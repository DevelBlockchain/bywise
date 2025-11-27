package executor

import (
	"math/big"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
)

// Helper to create a test EVM environment
func newTestEVM(t *testing.T) (*EVM, *StateDB, func()) {
	tmpDir := t.TempDir()
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	stateDB := NewStateDB(store)

	ctx := &Context{
		Origin:      core.Address{0x01},
		GasPrice:    big.NewInt(1),
		Coinbase:    core.Address{0x02},
		GasLimit:    DefaultGasLimit,
		BlockNumber: big.NewInt(100),
		Time:        big.NewInt(1000000),
		Difficulty:  big.NewInt(1),
		ChainID:     big.NewInt(1),
	}

	evm := NewEVM(ctx, stateDB)

	cleanup := func() {
		store.Close()
	}

	return evm, stateDB, cleanup
}

// Helper to execute code and return result
func executeCode(t *testing.T, code []byte, gas uint64) *ExecutionResult {
	evm, _, cleanup := newTestEVM(t)
	defer cleanup()

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           gas,
	}

	return evm.Execute(contract)
}

// Helper to execute code with calldata
func executeCodeWithInput(t *testing.T, code []byte, input []byte, gas uint64) *ExecutionResult {
	evm, _, cleanup := newTestEVM(t)
	defer cleanup()

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(100),
		Input:         input,
		Code:          code,
		Gas:           gas,
	}

	return evm.Execute(contract)
}

// Helper to build code that returns a value from the stack
func returnStackTop(ops ...byte) []byte {
	code := append([]byte{}, ops...)
	code = append(code,
		PUSH1, 0x00, // offset
		MSTORE,
		PUSH1, 0x20, // size
		PUSH1, 0x00, // offset
		RETURN,
	)
	return code
}

// Helper to get result as big.Int
func resultToInt(result *ExecutionResult) *big.Int {
	if result.Err != nil {
		return nil
	}
	return new(big.Int).SetBytes(result.ReturnData)
}

// ==================== STOP AND ARITHMETIC ====================

func TestOpcode_STOP(t *testing.T) {
	code := []byte{STOP}
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("STOP failed: %v", result.Err)
	}
}

func TestOpcode_ADD(t *testing.T) {
	tests := []struct {
		name     string
		a, b     int64
		expected int64
	}{
		{"simple", 5, 3, 8},
		{"zeros", 0, 0, 0},
		{"with zero", 10, 0, 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.a),
				PUSH1, byte(tt.b),
				ADD,
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("ADD(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}

	// Test larger numbers with PUSH2
	t.Run("large", func(t *testing.T) {
		code := []byte{
			PUSH2, 0x01, 0x00, // 256
			PUSH2, 0x01, 0x00, // 256
			ADD,
			PUSH1, 0x00,
			MSTORE,
			PUSH1, 0x20,
			PUSH1, 0x00,
			RETURN,
		}
		result := executeCode(t, code, 10000)
		got := resultToInt(result)
		if got.Cmp(big.NewInt(512)) != 0 {
			t.Errorf("ADD(256, 256) = %s, want 512", got.String())
		}
	})
}

func TestOpcode_MUL(t *testing.T) {
	tests := []struct {
		name     string
		a, b     int64
		expected int64
	}{
		{"simple", 4, 3, 12},
		{"with zero", 5, 0, 0},
		{"with one", 7, 1, 7},
		{"large", 100, 200, 20000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.a),
				PUSH1, byte(tt.b),
				MUL,
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("MUL(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_SUB(t *testing.T) {
	// SUB: pops x, pops y, pushes x-y
	// To compute a-b: PUSH b, PUSH a, SUB
	tests := []struct {
		name     string
		a, b     int64
		expected int64
	}{
		{"simple", 10, 3, 7},
		{"same", 5, 5, 0},
		{"with zero", 10, 0, 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.b), // b goes first (bottom)
				PUSH1, byte(tt.a), // a on top
				SUB,               // a - b
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("SUB(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_DIV(t *testing.T) {
	// EVM DIV: pop x, pop y, push x/y
	// Stack [a, b] with b on top -> DIV -> b/a
	// To get a/b: PUSH b, PUSH a, DIV (a is on top, b below)
	tests := []struct {
		name     string
		a, b     int64 // we want a/b
		expected int64
	}{
		{"10/2", 10, 2, 5},
		{"10/3", 10, 3, 3},
		{"10/0", 10, 0, 0},
		{"5/5", 5, 5, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// PUSH b (divisor), PUSH a (dividend), DIV
			// Stack: [b, a] with a on top
			// DIV pops a, then b, computes a/b
			code := returnStackTop(
				PUSH1, byte(tt.b), // divisor goes first (bottom)
				PUSH1, byte(tt.a), // dividend on top
				DIV,               // a / b
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("DIV(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_SDIV(t *testing.T) {
	// SDIV is signed division: x/y where x is top
	code := returnStackTop(
		PUSH1, 2,  // divisor
		PUSH1, 10, // dividend (top)
		SDIV,      // 10/2 = 5
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(5)) != 0 {
		t.Errorf("SDIV(10, 2) = %s, want 5", got.String())
	}
}

func TestOpcode_MOD(t *testing.T) {
	// MOD: pops x, pops y, pushes x mod y
	// To compute a mod b: PUSH b, PUSH a, MOD
	tests := []struct {
		name     string
		a, b     int64
		expected int64
	}{
		{"simple", 10, 3, 1},
		{"exact", 10, 5, 0},
		{"mod by zero", 10, 0, 0},
		{"smaller", 3, 10, 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.b), // divisor goes first (bottom)
				PUSH1, byte(tt.a), // dividend on top
				MOD,               // a mod b
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("MOD(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_SMOD(t *testing.T) {
	// SMOD: pops x, pops y, pushes x smod y
	// To compute 10 smod 3: PUSH 3, PUSH 10, SMOD
	code := returnStackTop(
		PUSH1, 3,  // divisor (bottom)
		PUSH1, 10, // dividend (top)
		SMOD,      // 10 smod 3 = 1
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("SMOD(10, 3) = %s, want 1", got.String())
	}
}

func TestOpcode_ADDMOD(t *testing.T) {
	// ADDMOD: pops x, y, z, pushes (x+y) mod z
	// (10 + 10) % 8 = 4
	// To compute (a+b) mod c: PUSH c, PUSH b, PUSH a, ADDMOD
	code := returnStackTop(
		PUSH1, 8,  // modulus (bottom)
		PUSH1, 10, // second addend
		PUSH1, 10, // first addend (top)
		ADDMOD,    // (10 + 10) mod 8 = 4
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(4)) != 0 {
		t.Errorf("ADDMOD(10, 10, 8) = %s, want 4", got.String())
	}
}

func TestOpcode_MULMOD(t *testing.T) {
	// MULMOD: pops x, y, z, pushes (x*y) mod z
	// (10 * 10) % 8 = 100 % 8 = 4
	// To compute (a*b) mod c: PUSH c, PUSH b, PUSH a, MULMOD
	code := returnStackTop(
		PUSH1, 8,  // modulus (bottom)
		PUSH1, 10, // second multiplicand
		PUSH1, 10, // first multiplicand (top)
		MULMOD,    // (10 * 10) mod 8 = 4
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(4)) != 0 {
		t.Errorf("MULMOD(10, 10, 8) = %s, want 4", got.String())
	}
}

func TestOpcode_EXP(t *testing.T) {
	// EXP: pops base, pops exp, pushes base^exp
	// To compute a^b: PUSH b (exp), PUSH a (base), EXP
	tests := []struct {
		name     string
		base     int64
		exp      int64
		expected int64
	}{
		{"2^3", 2, 3, 8},
		{"2^10", 2, 10, 1024},
		{"5^0", 5, 0, 1},
		{"0^5", 0, 5, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.exp),  // exponent (bottom)
				PUSH1, byte(tt.base), // base (top)
				EXP,                  // base^exp
			)
			result := executeCode(t, code, 100000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("EXP(%d, %d) = %s, want %d", tt.base, tt.exp, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_SIGNEXTEND(t *testing.T) {
	// SIGNEXTEND: pops back (byte position), pops num, sign-extends num from byte back
	// To sign-extend value v from byte k: PUSH v, PUSH k, SIGNEXTEND
	// Extend byte 0 (first byte) of 0x7F (127)
	code := returnStackTop(
		PUSH1, 0x7F, // value to extend (bottom)
		PUSH1, 0,    // byte position (top)
		SIGNEXTEND,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	// 0x7F sign-extended from byte 0 should be 127 (positive, high bit is 0)
	if got.Cmp(big.NewInt(127)) != 0 {
		t.Errorf("SIGNEXTEND(0, 0x7F) = %s, want 127", got.String())
	}
}

// ==================== COMPARISON & BITWISE ====================

func TestOpcode_LT(t *testing.T) {
	// LT: pops x, pops y, pushes 1 if x < y, else 0
	// To check if a < b: PUSH b, PUSH a, LT
	tests := []struct {
		name     string
		a, b     int64
		expected int64
	}{
		{"less", 3, 5, 1},
		{"greater", 5, 3, 0},
		{"equal", 5, 5, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.b), // right operand (bottom)
				PUSH1, byte(tt.a), // left operand (top)
				LT,                // a < b
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("LT(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_GT(t *testing.T) {
	// GT: pops x, pops y, pushes 1 if x > y, else 0
	// To check if a > b: PUSH b, PUSH a, GT
	tests := []struct {
		name     string
		a, b     int64
		expected int64
	}{
		{"greater", 5, 3, 1},
		{"less", 3, 5, 0},
		{"equal", 5, 5, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.b), // right operand (bottom)
				PUSH1, byte(tt.a), // left operand (top)
				GT,                // a > b
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("GT(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_SLT(t *testing.T) {
	// SLT: signed less than - pops x, pops y, pushes 1 if x < y, else 0
	// To check if 3 < 5: PUSH 5, PUSH 3, SLT
	code := returnStackTop(
		PUSH1, 5, // right operand (bottom)
		PUSH1, 3, // left operand (top)
		SLT,      // 3 < 5 = 1
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("SLT(3, 5) = %s, want 1", got.String())
	}
}

func TestOpcode_SGT(t *testing.T) {
	// SGT: signed greater than - pops x, pops y, pushes 1 if x > y, else 0
	// To check if 5 > 3: PUSH 3, PUSH 5, SGT
	code := returnStackTop(
		PUSH1, 3, // right operand (bottom)
		PUSH1, 5, // left operand (top)
		SGT,      // 5 > 3 = 1
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("SGT(5, 3) = %s, want 1", got.String())
	}
}

func TestOpcode_EQ(t *testing.T) {
	tests := []struct {
		name     string
		a, b     int64
		expected int64
	}{
		{"equal", 5, 5, 1},
		{"not equal", 5, 3, 0},
		{"zeros", 0, 0, 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.a),
				PUSH1, byte(tt.b),
				EQ,
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("EQ(%d, %d) = %s, want %d", tt.a, tt.b, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_ISZERO(t *testing.T) {
	tests := []struct {
		name     string
		val      int64
		expected int64
	}{
		{"zero", 0, 1},
		{"non-zero", 5, 0},
		{"one", 1, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code := returnStackTop(
				PUSH1, byte(tt.val),
				ISZERO,
			)
			result := executeCode(t, code, 10000)
			got := resultToInt(result)
			if got.Cmp(big.NewInt(tt.expected)) != 0 {
				t.Errorf("ISZERO(%d) = %s, want %d", tt.val, got.String(), tt.expected)
			}
		})
	}
}

func TestOpcode_AND(t *testing.T) {
	// 0xFF & 0x0F = 0x0F = 15
	code := returnStackTop(
		PUSH1, 0xFF,
		PUSH1, 0x0F,
		AND,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(15)) != 0 {
		t.Errorf("AND(0xFF, 0x0F) = %s, want 15", got.String())
	}
}

func TestOpcode_OR(t *testing.T) {
	// 0xF0 | 0x0F = 0xFF = 255
	code := returnStackTop(
		PUSH1, 0xF0,
		PUSH1, 0x0F,
		OR,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(255)) != 0 {
		t.Errorf("OR(0xF0, 0x0F) = %s, want 255", got.String())
	}
}

func TestOpcode_XOR(t *testing.T) {
	// 0xFF ^ 0x0F = 0xF0 = 240
	code := returnStackTop(
		PUSH1, 0xFF,
		PUSH1, 0x0F,
		XOR,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(240)) != 0 {
		t.Errorf("XOR(0xFF, 0x0F) = %s, want 240", got.String())
	}
}

func TestOpcode_NOT(t *testing.T) {
	// NOT(0) should give max 256-bit value
	code := returnStackTop(
		PUSH1, 0,
		NOT,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	// Result should be 2^256 - 1
	max256 := new(big.Int).Lsh(big.NewInt(1), 256)
	max256.Sub(max256, big.NewInt(1))
	if got.Cmp(max256) != 0 {
		t.Errorf("NOT(0) != max256")
	}
}

func TestOpcode_BYTE(t *testing.T) {
	// BYTE: pops th (position), pops val, pushes byte at position th
	// To get byte 31 of value 0xFF: PUSH 0xFF, PUSH 31, BYTE
	code := returnStackTop(
		PUSH1, 0xFF, // value (bottom)
		PUSH1, 31,   // byte position (top)
		BYTE,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(255)) != 0 {
		t.Errorf("BYTE(31, 0xFF) = %s, want 255", got.String())
	}
}

func TestOpcode_SHL(t *testing.T) {
	// SHL: pops shift, pops value, pushes value << shift
	// To compute 1 << 4: PUSH 1 (value), PUSH 4 (shift), SHL
	code := returnStackTop(
		PUSH1, 1, // value (bottom)
		PUSH1, 4, // shift amount (top)
		SHL,      // 1 << 4 = 16
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(16)) != 0 {
		t.Errorf("SHL(1, 4) = %s, want 16", got.String())
	}
}

func TestOpcode_SHR(t *testing.T) {
	// SHR: pops shift, pops value, pushes value >> shift
	// To compute 16 >> 2: PUSH 16 (value), PUSH 2 (shift), SHR
	code := returnStackTop(
		PUSH1, 16, // value (bottom)
		PUSH1, 2,  // shift amount (top)
		SHR,       // 16 >> 2 = 4
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(4)) != 0 {
		t.Errorf("SHR(16, 2) = %s, want 4", got.String())
	}
}

func TestOpcode_SAR(t *testing.T) {
	// SAR: pops shift, pops value, pushes value >> shift (arithmetic)
	// To compute 16 >> 2: PUSH 16 (value), PUSH 2 (shift), SAR
	code := returnStackTop(
		PUSH1, 16, // value (bottom)
		PUSH1, 2,  // shift amount (top)
		SAR,       // 16 >> 2 = 4
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(4)) != 0 {
		t.Errorf("SAR(16, 2) = %s, want 4", got.String())
	}
}

// ==================== SHA3 ====================

func TestOpcode_SHA3(t *testing.T) {
	// Store 0xDEADBEEF in memory and hash it
	code := []byte{
		PUSH4, 0xDE, 0xAD, 0xBE, 0xEF,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x04, // size
		PUSH1, 0x1C, // offset (32 - 4 = 28)
		SHA3,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 100000)
	if result.Err != nil {
		t.Errorf("SHA3 failed: %v", result.Err)
	}
	if len(result.ReturnData) != 32 {
		t.Errorf("SHA3 should return 32 bytes, got %d", len(result.ReturnData))
	}
}

// ==================== ENVIRONMENTAL INFORMATION ====================

func TestOpcode_ADDRESS(t *testing.T) {
	evm, _, cleanup := newTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{0x11, 0x22, 0x33}
	code := returnStackTop(ADDRESS)

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           10000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		t.Errorf("ADDRESS failed: %v", result.Err)
	}
}

func TestOpcode_BALANCE(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	testAddr := core.Address{0xAA, 0xBB, 0xCC}
	stateDB.SetBalance(testAddr, big.NewInt(12345))

	code := []byte{
		PUSH20,
		0xAA, 0xBB, 0xCC, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		BALANCE,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(12345)) != 0 {
		t.Errorf("BALANCE = %s, want 12345", got.String())
	}
}

func TestOpcode_ORIGIN(t *testing.T) {
	code := returnStackTop(ORIGIN)
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("ORIGIN failed: %v", result.Err)
	}
}

func TestOpcode_CALLER(t *testing.T) {
	code := returnStackTop(CALLER)
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("CALLER failed: %v", result.Err)
	}
}

func TestOpcode_CALLVALUE(t *testing.T) {
	evm, _, cleanup := newTestEVM(t)
	defer cleanup()

	code := returnStackTop(CALLVALUE)

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(999),
		Input:         []byte{},
		Code:          code,
		Gas:           10000,
	}

	result := evm.Execute(contract)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(999)) != 0 {
		t.Errorf("CALLVALUE = %s, want 999", got.String())
	}
}

func TestOpcode_CALLDATALOAD(t *testing.T) {
	// Calldata with value at offset 0
	calldata := make([]byte, 32)
	calldata[31] = 42

	code := returnStackTop(
		PUSH1, 0x00,
		CALLDATALOAD,
	)

	result := executeCodeWithInput(t, code, calldata, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("CALLDATALOAD = %s, want 42", got.String())
	}
}

func TestOpcode_CALLDATASIZE(t *testing.T) {
	calldata := make([]byte, 64)

	code := returnStackTop(
		CALLDATASIZE,
	)

	result := executeCodeWithInput(t, code, calldata, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(64)) != 0 {
		t.Errorf("CALLDATASIZE = %s, want 64", got.String())
	}
}

func TestOpcode_CALLDATACOPY(t *testing.T) {
	calldata := []byte{0xDE, 0xAD, 0xBE, 0xEF}

	code := []byte{
		PUSH1, 0x04, // length
		PUSH1, 0x00, // data offset
		PUSH1, 0x00, // memory offset
		CALLDATACOPY,
		PUSH1, 0x04, // size
		PUSH1, 0x00, // offset
		RETURN,
	}

	result := executeCodeWithInput(t, code, calldata, 10000)
	if result.Err != nil {
		t.Errorf("CALLDATACOPY failed: %v", result.Err)
	}
	if len(result.ReturnData) != 4 {
		t.Errorf("Expected 4 bytes, got %d", len(result.ReturnData))
	}
}

func TestOpcode_CODESIZE(t *testing.T) {
	code := returnStackTop(CODESIZE)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	expectedSize := int64(len(code))
	if got.Cmp(big.NewInt(expectedSize)) != 0 {
		t.Errorf("CODESIZE = %s, want %d", got.String(), expectedSize)
	}
}

func TestOpcode_CODECOPY(t *testing.T) {
	code := []byte{
		PUSH1, 0x05, // length
		PUSH1, 0x00, // code offset
		PUSH1, 0x00, // memory offset
		CODECOPY,
		PUSH1, 0x05, // size
		PUSH1, 0x00, // offset
		RETURN,
	}
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("CODECOPY failed: %v", result.Err)
	}
}

func TestOpcode_GASPRICE(t *testing.T) {
	code := returnStackTop(GASPRICE)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 { // Default gas price is 1
		t.Errorf("GASPRICE = %s, want 1", got.String())
	}
}

func TestOpcode_EXTCODESIZE(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	// Set code for an external address
	extAddr := core.Address{0xEE}
	stateDB.SetCode(extAddr, []byte{0x01, 0x02, 0x03, 0x04, 0x05})

	code := []byte{
		PUSH20,
		0xEE, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		EXTCODESIZE,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(5)) != 0 {
		t.Errorf("EXTCODESIZE = %s, want 5", got.String())
	}
}

func TestOpcode_RETURNDATASIZE(t *testing.T) {
	code := returnStackTop(RETURNDATASIZE)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	// Initially returndata is empty
	if got.Cmp(big.NewInt(0)) != 0 {
		t.Errorf("RETURNDATASIZE = %s, want 0", got.String())
	}
}

// ==================== BLOCK INFORMATION ====================

func TestOpcode_BLOCKHASH(t *testing.T) {
	code := returnStackTop(
		PUSH1, 99,
		BLOCKHASH,
	)
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("BLOCKHASH failed: %v", result.Err)
	}
}

func TestOpcode_COINBASE(t *testing.T) {
	code := returnStackTop(COINBASE)
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("COINBASE failed: %v", result.Err)
	}
}

func TestOpcode_TIMESTAMP(t *testing.T) {
	code := returnStackTop(TIMESTAMP)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1000000)) != 0 { // Default timestamp
		t.Errorf("TIMESTAMP = %s, want 1000000", got.String())
	}
}

func TestOpcode_NUMBER(t *testing.T) {
	code := returnStackTop(NUMBER)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(100)) != 0 { // Default block number
		t.Errorf("NUMBER = %s, want 100", got.String())
	}
}

func TestOpcode_DIFFICULTY(t *testing.T) {
	code := returnStackTop(DIFFICULTY)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 { // Default difficulty
		t.Errorf("DIFFICULTY = %s, want 1", got.String())
	}
}

func TestOpcode_GASLIMIT(t *testing.T) {
	code := returnStackTop(GASLIMIT)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(int64(DefaultGasLimit))) != 0 {
		t.Errorf("GASLIMIT = %s, want %d", got.String(), DefaultGasLimit)
	}
}

func TestOpcode_CHAINID(t *testing.T) {
	code := returnStackTop(CHAINID)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 { // Default chain ID
		t.Errorf("CHAINID = %s, want 1", got.String())
	}
}

func TestOpcode_SELFBALANCE(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{0x20}
	stateDB.SetBalance(contractAddr, big.NewInt(5000))

	code := returnStackTop(SELFBALANCE)

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           10000,
	}

	result := evm.Execute(contract)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(5000)) != 0 {
		t.Errorf("SELFBALANCE = %s, want 5000", got.String())
	}
}

func TestOpcode_BASEFEE(t *testing.T) {
	code := returnStackTop(BASEFEE)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0)) != 0 { // Default basefee is 0
		t.Errorf("BASEFEE = %s, want 0", got.String())
	}
}

// ==================== STACK, MEMORY, STORAGE, FLOW ====================

func TestOpcode_POP(t *testing.T) {
	// Push 5, push 10, pop, return top (should be 5)
	code := returnStackTop(
		PUSH1, 5,
		PUSH1, 10,
		POP,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(5)) != 0 {
		t.Errorf("After POP, top = %s, want 5", got.String())
	}
}

func TestOpcode_MLOAD_MSTORE(t *testing.T) {
	code := []byte{
		PUSH1, 42,   // value
		PUSH1, 0x00, // offset
		MSTORE,
		PUSH1, 0x00, // offset
		MLOAD,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("MLOAD/MSTORE = %s, want 42", got.String())
	}
}

func TestOpcode_MSTORE8(t *testing.T) {
	code := []byte{
		PUSH1, 0xFF, // value (only low byte used)
		PUSH1, 0x1F, // offset (byte 31)
		MSTORE8,
		PUSH1, 0x00,
		MLOAD,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(255)) != 0 {
		t.Errorf("MSTORE8 = %s, want 255", got.String())
	}
}

func TestOpcode_SLOAD_SSTORE(t *testing.T) {
	evm, _, cleanup := newTestEVM(t)
	defer cleanup()

	code := []byte{
		PUSH1, 0x99, // value
		PUSH1, 0x00, // slot
		SSTORE,
		PUSH1, 0x00, // slot
		SLOAD,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0x99)) != 0 {
		t.Errorf("SLOAD/SSTORE = %s, want 153", got.String())
	}
}

func TestOpcode_JUMP(t *testing.T) {
	// PUSH 5, JUMP, INVALID, INVALID, INVALID, JUMPDEST, PUSH 1, return
	code := []byte{
		PUSH1, 0x05, // destination
		JUMP,
		INVALID,
		INVALID,
		JUMPDEST, // position 5
		PUSH1, 0x01,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("After JUMP = %s, want 1", got.String())
	}
}

func TestOpcode_JUMPI_True(t *testing.T) {
	// Conditional jump when condition is true
	code := []byte{
		PUSH1, 0x01, // condition (true)
		PUSH1, 0x06, // destination
		JUMPI,
		INVALID,
		JUMPDEST, // position 6
		PUSH1, 0x42,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0x42)) != 0 {
		t.Errorf("JUMPI true = %s, want 66", got.String())
	}
}

func TestOpcode_JUMPI_False(t *testing.T) {
	// Conditional jump when condition is false (don't jump)
	code := []byte{
		PUSH1, 0x00, // condition (false)
		PUSH1, 0x0A, // destination (won't be used)
		JUMPI,
		PUSH1, 0x33, // this should execute
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
		JUMPDEST,
		PUSH1, 0xFF,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0x33)) != 0 {
		t.Errorf("JUMPI false = %s, want 51", got.String())
	}
}

func TestOpcode_PC(t *testing.T) {
	// PC at position 0 should return 0
	code := returnStackTop(PC)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0)) != 0 {
		t.Errorf("PC = %s, want 0", got.String())
	}
}

func TestOpcode_MSIZE(t *testing.T) {
	// Initial memory size should be 0
	code := returnStackTop(MSIZE)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0)) != 0 {
		t.Errorf("Initial MSIZE = %s, want 0", got.String())
	}
}

func TestOpcode_GAS(t *testing.T) {
	code := returnStackTop(GAS)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	// Should be less than initial gas due to ops executed
	if got.Sign() <= 0 {
		t.Errorf("GAS should be positive, got %s", got.String())
	}
}

func TestOpcode_JUMPDEST(t *testing.T) {
	// JUMPDEST is a no-op marker
	code := []byte{
		JUMPDEST,
		PUSH1, 0x01,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("After JUMPDEST = %s, want 1", got.String())
	}
}

// ==================== PUSH OPERATIONS ====================

func TestOpcode_PUSH1(t *testing.T) {
	code := returnStackTop(PUSH1, 0xFF)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(255)) != 0 {
		t.Errorf("PUSH1 0xFF = %s, want 255", got.String())
	}
}

func TestOpcode_PUSH2(t *testing.T) {
	code := returnStackTop(PUSH2, 0x01, 0x00)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(256)) != 0 {
		t.Errorf("PUSH2 0x0100 = %s, want 256", got.String())
	}
}

func TestOpcode_PUSH4(t *testing.T) {
	code := returnStackTop(PUSH4, 0x00, 0x01, 0x00, 0x00)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(65536)) != 0 {
		t.Errorf("PUSH4 = %s, want 65536", got.String())
	}
}

func TestOpcode_PUSH32(t *testing.T) {
	pushData := make([]byte, 33)
	pushData[0] = PUSH32
	pushData[32] = 0xFF // Last byte is 255

	code := append(pushData,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(255)) != 0 {
		t.Errorf("PUSH32 last byte = %s, want 255", got.String())
	}
}

// ==================== DUP OPERATIONS ====================

func TestOpcode_DUP1(t *testing.T) {
	// PUSH 5, DUP1 -> stack: [5, 5]
	code := returnStackTop(
		PUSH1, 5,
		DUP1,
		ADD, // 5 + 5 = 10
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(10)) != 0 {
		t.Errorf("DUP1 = %s, want 10", got.String())
	}
}

func TestOpcode_DUP2(t *testing.T) {
	// PUSH 3, PUSH 5, DUP2 -> stack: [3, 5, 3], top is 3
	code := returnStackTop(
		PUSH1, 3,
		PUSH1, 5,
		DUP2,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(3)) != 0 {
		t.Errorf("DUP2 = %s, want 3", got.String())
	}
}

func TestOpcode_DUP16(t *testing.T) {
	// Push 16 values, DUP16 should duplicate the first one
	code := []byte{
		PUSH1, 0x10, // value 16 (position 16)
		PUSH1, 0x0F, // 15
		PUSH1, 0x0E, // 14
		PUSH1, 0x0D, // 13
		PUSH1, 0x0C, // 12
		PUSH1, 0x0B, // 11
		PUSH1, 0x0A, // 10
		PUSH1, 0x09, // 9
		PUSH1, 0x08, // 8
		PUSH1, 0x07, // 7
		PUSH1, 0x06, // 6
		PUSH1, 0x05, // 5
		PUSH1, 0x04, // 4
		PUSH1, 0x03, // 3
		PUSH1, 0x02, // 2
		PUSH1, 0x01, // 1 (top)
		DUP16,       // duplicates value 16
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(16)) != 0 {
		t.Errorf("DUP16 = %s, want 16", got.String())
	}
}

// ==================== SWAP OPERATIONS ====================

func TestOpcode_SWAP1(t *testing.T) {
	// PUSH 3, PUSH 5, SWAP1 -> top is 3
	code := returnStackTop(
		PUSH1, 3,
		PUSH1, 5,
		SWAP1,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(3)) != 0 {
		t.Errorf("SWAP1 = %s, want 3", got.String())
	}
}

func TestOpcode_SWAP2(t *testing.T) {
	// PUSH 1, PUSH 2, PUSH 3, SWAP2 -> swaps positions 0 and 2
	// Stack before: [1, 2, 3] (3 on top)
	// After SWAP2: [3, 2, 1] (1 on top)
	code := returnStackTop(
		PUSH1, 1,
		PUSH1, 2,
		PUSH1, 3,
		SWAP2,
	)
	result := executeCode(t, code, 10000)
	got := resultToInt(result)
	if got.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("SWAP2 = %s, want 1", got.String())
	}
}

// ==================== LOG OPERATIONS ====================

func TestOpcode_LOG0(t *testing.T) {
	code := []byte{
		PUSH1, 0x00, // size
		PUSH1, 0x00, // offset
		LOG0,
		STOP,
	}
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("LOG0 failed: %v", result.Err)
	}
}

func TestOpcode_LOG1(t *testing.T) {
	code := []byte{
		PUSH32, // topic
		0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
		PUSH1, 0x00, // size
		PUSH1, 0x00, // offset
		LOG1,
		STOP,
	}
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("LOG1 failed: %v", result.Err)
	}
}

func TestOpcode_LOG4(t *testing.T) {
	code := []byte{
		PUSH1, 0x01, // topic4
		PUSH1, 0x02, // topic3
		PUSH1, 0x03, // topic2
		PUSH1, 0x04, // topic1
		PUSH1, 0x00, // size
		PUSH1, 0x00, // offset
		LOG4,
		STOP,
	}
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("LOG4 failed: %v", result.Err)
	}
}

// ==================== SYSTEM OPERATIONS ====================

func TestOpcode_RETURN(t *testing.T) {
	code := []byte{
		PUSH1, 0xAB, // value
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20, // size
		PUSH1, 0x00, // offset
		RETURN,
	}
	result := executeCode(t, code, 10000)
	if result.Err != nil {
		t.Errorf("RETURN failed: %v", result.Err)
	}
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0xAB)) != 0 {
		t.Errorf("RETURN value = %s, want 171", got.String())
	}
}

func TestOpcode_REVERT(t *testing.T) {
	code := []byte{
		PUSH1, 0x00, // size
		PUSH1, 0x00, // offset
		REVERT,
	}
	result := executeCode(t, code, 10000)
	if !result.Reverted {
		t.Error("REVERT should set Reverted flag")
	}
	if result.Err != ErrExecutionReverted {
		t.Errorf("REVERT error = %v, want ErrExecutionReverted", result.Err)
	}
}

func TestOpcode_INVALID(t *testing.T) {
	code := []byte{INVALID}
	result := executeCode(t, code, 10000)
	if result.Err != ErrInvalidOpcode {
		t.Errorf("INVALID error = %v, want ErrInvalidOpcode", result.Err)
	}
}

func TestOpcode_CREATE(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	// Set up caller with balance
	callerAddr := core.Address{0x10}
	stateDB.SetBalance(callerAddr, big.NewInt(1000000))

	// Init code that returns 0x6001 (PUSH1 1)
	initCode := []byte{
		PUSH2, 0x60, 0x01, // Push code to deploy
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x02, // size
		PUSH1, 0x1E, // offset (32 - 2)
		RETURN,
	}

	// Store init code in memory and call CREATE
	code := []byte{
		// Store init code in memory
		PUSH8, initCode[0], initCode[1], initCode[2], initCode[3],
		initCode[4], initCode[5], initCode[6], initCode[7],
		PUSH1, 0x00,
		MSTORE,
	}
	code = append(code,
		PUSH1, byte(len(initCode)), // size
		PUSH1, 0x18,                // offset (32 - 8)
		PUSH1, 0x00,                // value
		CREATE,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	)

	contract := &Contract{
		CallerAddress: callerAddr,
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           1000000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		t.Logf("CREATE result: %v", result.Err)
	}
}

func TestOpcode_CALL(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	// Set up target contract with simple code
	targetAddr := core.Address{0x30}
	targetCode := []byte{
		PUSH1, 0x42,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	stateDB.SetCode(targetAddr, targetCode)

	// Call the target contract
	code := []byte{
		PUSH1, 0x20, // retSize
		PUSH1, 0x00, // retOffset
		PUSH1, 0x00, // argsSize
		PUSH1, 0x00, // argsOffset
		PUSH1, 0x00, // value
		PUSH20, // address
		0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		PUSH2, 0xFF, 0xFF, // gas
		CALL,
		// Return the result of the call
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           1000000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		t.Errorf("CALL failed: %v", result.Err)
	}
	got := resultToInt(result)
	if got.Cmp(big.NewInt(0x42)) != 0 {
		t.Errorf("CALL result = %s, want 66", got.String())
	}
}

func TestOpcode_STATICCALL(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	// Set up target contract that tries to SSTORE (should fail in static call)
	targetAddr := core.Address{0x30}
	targetCode := []byte{
		PUSH1, 0x42,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	stateDB.SetCode(targetAddr, targetCode)

	// Static call the target contract
	code := []byte{
		PUSH1, 0x20, // retSize
		PUSH1, 0x00, // retOffset
		PUSH1, 0x00, // argsSize
		PUSH1, 0x00, // argsOffset
		PUSH20,      // address
		0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		PUSH2, 0xFF, 0xFF, // gas
		STATICCALL,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           1000000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		t.Errorf("STATICCALL failed: %v", result.Err)
	}
}

func TestOpcode_DELEGATECALL(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	// Set up library contract
	libAddr := core.Address{0x30}
	libCode := []byte{
		PUSH1, 0x99,
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}
	stateDB.SetCode(libAddr, libCode)

	// Delegatecall the library
	code := []byte{
		PUSH1, 0x20, // retSize
		PUSH1, 0x00, // retOffset
		PUSH1, 0x00, // argsSize
		PUSH1, 0x00, // argsOffset
		PUSH20,      // address
		0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		PUSH2, 0xFF, 0xFF, // gas
		DELEGATECALL,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(100),
		Input:         []byte{},
		Code:          code,
		Gas:           1000000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		t.Errorf("DELEGATECALL failed: %v", result.Err)
	}
}

func TestOpcode_SELFDESTRUCT(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{0x20}
	beneficiary := core.Address{0x30}

	stateDB.SetBalance(contractAddr, big.NewInt(1000))
	stateDB.SetCode(contractAddr, []byte{0x01, 0x02})

	code := []byte{
		PUSH20, // beneficiary
		0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		SELFDESTRUCT,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		t.Errorf("SELFDESTRUCT failed: %v", result.Err)
	}

	// Check beneficiary received the balance
	beneficiaryBalance := stateDB.GetBalance(beneficiary)
	if beneficiaryBalance.Cmp(big.NewInt(1000)) != 0 {
		t.Errorf("Beneficiary balance = %s, want 1000", beneficiaryBalance.String())
	}

	// Check contract balance is 0
	contractBalance := stateDB.GetBalance(contractAddr)
	if contractBalance.Sign() != 0 {
		t.Errorf("Contract balance = %s, want 0", contractBalance.String())
	}
}

// ==================== ERROR CASES ====================

func TestOpcode_InvalidJump(t *testing.T) {
	code := []byte{
		PUSH1, 0x10, // invalid destination
		JUMP,
	}
	result := executeCode(t, code, 10000)
	if result.Err != ErrInvalidJump {
		t.Errorf("Invalid jump error = %v, want ErrInvalidJump", result.Err)
	}
}

func TestOpcode_StackUnderflow(t *testing.T) {
	code := []byte{ADD} // ADD needs 2 values, stack is empty
	result := executeCode(t, code, 10000)
	if result.Err != ErrStackUnderflow {
		t.Errorf("Stack underflow error = %v, want ErrStackUnderflow", result.Err)
	}
}

func TestOpcode_OutOfGas(t *testing.T) {
	code := []byte{
		JUMPDEST,
		PUSH1, 0x00,
		JUMP,
	}
	result := executeCode(t, code, 50) // Very limited gas
	if result.Err != ErrOutOfGas {
		t.Errorf("Out of gas error = %v, want ErrOutOfGas", result.Err)
	}
}

func TestOpcode_WriteProtection(t *testing.T) {
	evm, stateDB, cleanup := newTestEVM(t)
	defer cleanup()

	// Set up target contract that tries to SSTORE
	targetAddr := core.Address{0x30}
	targetCode := []byte{
		PUSH1, 0x01,
		PUSH1, 0x00,
		SSTORE, // This should fail in static context
		STOP,
	}
	stateDB.SetCode(targetAddr, targetCode)

	// Static call the target contract
	code := []byte{
		PUSH1, 0x00, // retSize
		PUSH1, 0x00, // retOffset
		PUSH1, 0x00, // argsSize
		PUSH1, 0x00, // argsOffset
		PUSH20,      // address
		0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		PUSH2, 0xFF, 0xFF, // gas
		STATICCALL,
		// Check if call failed (0 = fail)
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0x10},
		Address:       core.Address{0x20},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           1000000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		t.Errorf("STATICCALL wrapper failed: %v", result.Err)
	}
	got := resultToInt(result)
	// STATICCALL should return 0 (fail) because target tried to SSTORE
	if got.Cmp(big.NewInt(0)) != 0 {
		t.Errorf("STATICCALL with SSTORE should fail, got %s", got.String())
	}
}
