package executor

import (
	"math/big"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
)

func setupTestEVM(t *testing.T) (*EVM, *StateDB, func()) {
	// Create temporary storage
	tmpDir := t.TempDir()
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	stateDB := NewStateDB(store)

	ctx := &Context{
		Origin:      core.Address{},
		GasPrice:    big.NewInt(1),
		Coinbase:    core.Address{},
		GasLimit:    DefaultGasLimit,
		BlockNumber: big.NewInt(1),
		Time:        big.NewInt(1000),
		Difficulty:  big.NewInt(1),
		ChainID:     big.NewInt(1),
	}

	evm := NewEVM(ctx, stateDB)

	cleanup := func() {
		store.Close()
	}

	return evm, stateDB, cleanup
}

func TestEVM_SimpleAdd(t *testing.T) {
	evm, _, cleanup := setupTestEVM(t)
	defer cleanup()

	// Simple bytecode: PUSH1 5, PUSH1 3, ADD, STOP
	// Should compute 5 + 3 = 8
	code := []byte{
		PUSH1, 0x05, // PUSH1 5
		PUSH1, 0x03, // PUSH1 3
		ADD,         // ADD
		PUSH1, 0x00, // PUSH1 0 (memory offset)
		MSTORE,      // MSTORE
		PUSH1, 0x20, // PUSH1 32 (size)
		PUSH1, 0x00, // PUSH1 0 (offset)
		RETURN,      // RETURN
	}

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       core.Address{2},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Execution failed: %v", result.Err)
	}

	// Check return data
	expected := big.NewInt(8).Bytes()
	actual := new(big.Int).SetBytes(result.ReturnData)
	if actual.Cmp(big.NewInt(8)) != 0 {
		t.Errorf("Expected 8, got %s", actual.String())
	}
	_ = expected
}

func TestEVM_SimpleMul(t *testing.T) {
	evm, _, cleanup := setupTestEVM(t)
	defer cleanup()

	// Simple bytecode: PUSH1 4, PUSH1 3, MUL, STOP
	// Should compute 4 * 3 = 12
	code := []byte{
		PUSH1, 0x04, // PUSH1 4
		PUSH1, 0x03, // PUSH1 3
		MUL,         // MUL
		PUSH1, 0x00, // PUSH1 0 (memory offset)
		MSTORE,      // MSTORE
		PUSH1, 0x20, // PUSH1 32 (size)
		PUSH1, 0x00, // PUSH1 0 (offset)
		RETURN,      // RETURN
	}

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       core.Address{2},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Execution failed: %v", result.Err)
	}

	actual := new(big.Int).SetBytes(result.ReturnData)
	if actual.Cmp(big.NewInt(12)) != 0 {
		t.Errorf("Expected 12, got %s", actual.String())
	}
}

func TestEVM_SStore_SLoad(t *testing.T) {
	evm, stateDB, cleanup := setupTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{1, 2, 3}

	// Store value 42 at slot 0, then load and return it
	code := []byte{
		PUSH1, 0x2A, // PUSH1 42 (value)
		PUSH1, 0x00, // PUSH1 0 (slot)
		SSTORE,      // SSTORE
		PUSH1, 0x00, // PUSH1 0 (slot)
		SLOAD,       // SLOAD
		PUSH1, 0x00, // PUSH1 0 (memory offset)
		MSTORE,      // MSTORE
		PUSH1, 0x20, // PUSH1 32 (size)
		PUSH1, 0x00, // PUSH1 0 (offset)
		RETURN,      // RETURN
	}

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Execution failed: %v", result.Err)
	}

	actual := new(big.Int).SetBytes(result.ReturnData)
	if actual.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("Expected 42, got %s", actual.String())
	}

	// Check that WriteSet contains the storage write
	writeSet := stateDB.GetWriteSet()
	if len(writeSet) == 0 {
		t.Error("WriteSet should contain storage write")
	}
}

func TestEVM_Jump(t *testing.T) {
	evm, _, cleanup := setupTestEVM(t)
	defer cleanup()

	// Jump over a section of code
	// PUSH1 6, JUMP, INVALID, INVALID, INVALID, INVALID, JUMPDEST, PUSH1 1, STOP
	code := []byte{
		PUSH1, 0x06, // PUSH1 6 (jump destination)
		JUMP,        // JUMP
		INVALID,     // INVALID (skipped)
		INVALID,     // INVALID (skipped)
		INVALID,     // INVALID (skipped)
		JUMPDEST,    // JUMPDEST at position 6
		PUSH1, 0x01, // PUSH1 1
		PUSH1, 0x00, // PUSH1 0 (memory offset)
		MSTORE,      // MSTORE
		PUSH1, 0x20, // PUSH1 32 (size)
		PUSH1, 0x00, // PUSH1 0 (offset)
		RETURN,      // RETURN
	}

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       core.Address{2},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Execution failed: %v", result.Err)
	}

	actual := new(big.Int).SetBytes(result.ReturnData)
	if actual.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("Expected 1, got %s", actual.String())
	}
}

func TestEVM_CallDataLoad(t *testing.T) {
	evm, _, cleanup := setupTestEVM(t)
	defer cleanup()

	// Load first 32 bytes of calldata and return it
	code := []byte{
		PUSH1, 0x00,  // PUSH1 0 (offset)
		CALLDATALOAD, // CALLDATALOAD
		PUSH1, 0x00,  // PUSH1 0 (memory offset)
		MSTORE,       // MSTORE
		PUSH1, 0x20,  // PUSH1 32 (size)
		PUSH1, 0x00,  // PUSH1 0 (offset)
		RETURN,       // RETURN
	}

	// Create calldata with value 123
	calldata := make([]byte, 32)
	calldata[31] = 123

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       core.Address{2},
		Value:         big.NewInt(0),
		Input:         calldata,
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Execution failed: %v", result.Err)
	}

	actual := new(big.Int).SetBytes(result.ReturnData)
	if actual.Cmp(big.NewInt(123)) != 0 {
		t.Errorf("Expected 123, got %s", actual.String())
	}
}

func TestEVM_Revert(t *testing.T) {
	evm, _, cleanup := setupTestEVM(t)
	defer cleanup()

	// REVERT with message
	code := []byte{
		PUSH1, 0x00, // PUSH1 0 (size)
		PUSH1, 0x00, // PUSH1 0 (offset)
		REVERT,      // REVERT
	}

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       core.Address{2},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if !result.Reverted {
		t.Error("Expected execution to be reverted")
	}
}

func TestEVM_OutOfGas(t *testing.T) {
	evm, _, cleanup := setupTestEVM(t)
	defer cleanup()

	// Infinite loop that will run out of gas
	code := []byte{
		JUMPDEST,    // JUMPDEST at 0
		PUSH1, 0x00, // PUSH1 0
		JUMP,        // JUMP to 0
	}

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       core.Address{2},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100, // Very limited gas
	}

	result := evm.Execute(contract)

	if result.Err != ErrOutOfGas {
		t.Errorf("Expected out of gas error, got: %v", result.Err)
	}
}

func TestEVM_Balance(t *testing.T) {
	evm, stateDB, cleanup := setupTestEVM(t)
	defer cleanup()

	testAddr := core.Address{1, 2, 3}
	stateDB.SetBalance(testAddr, big.NewInt(1000))

	// Get balance of testAddr
	code := []byte{
		PUSH20, // PUSH20 address
		1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		BALANCE,     // BALANCE
		PUSH1, 0x00, // PUSH1 0 (memory offset)
		MSTORE,      // MSTORE
		PUSH1, 0x20, // PUSH1 32 (size)
		PUSH1, 0x00, // PUSH1 0 (offset)
		RETURN,      // RETURN
	}

	contract := &Contract{
		CallerAddress: core.Address{1},
		Address:       core.Address{2},
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Execution failed: %v", result.Err)
	}

	actual := new(big.Int).SetBytes(result.ReturnData)
	if actual.Cmp(big.NewInt(1000)) != 0 {
		t.Errorf("Expected 1000, got %s", actual.String())
	}
}

func TestStack_Basic(t *testing.T) {
	stack := NewStack()

	// Push and pop
	stack.Push(big.NewInt(5))
	stack.Push(big.NewInt(10))

	val, err := stack.Pop()
	if err != nil {
		t.Fatalf("Pop failed: %v", err)
	}
	if val.Cmp(big.NewInt(10)) != 0 {
		t.Errorf("Expected 10, got %s", val.String())
	}

	val, err = stack.Pop()
	if err != nil {
		t.Fatalf("Pop failed: %v", err)
	}
	if val.Cmp(big.NewInt(5)) != 0 {
		t.Errorf("Expected 5, got %s", val.String())
	}
}

func TestStack_Overflow(t *testing.T) {
	stack := NewStack()

	// Fill stack to max
	for i := 0; i < MaxStackSize; i++ {
		if err := stack.Push(big.NewInt(int64(i))); err != nil {
			t.Fatalf("Push failed at %d: %v", i, err)
		}
	}

	// Next push should fail
	err := stack.Push(big.NewInt(1))
	if err != ErrStackOverflow {
		t.Errorf("Expected stack overflow, got: %v", err)
	}
}

func TestStack_Underflow(t *testing.T) {
	stack := NewStack()

	_, err := stack.Pop()
	if err != ErrStackUnderflow {
		t.Errorf("Expected stack underflow, got: %v", err)
	}
}

func TestMemory_Basic(t *testing.T) {
	mem := NewMemory()

	// Store and load
	err := mem.Set32(0, big.NewInt(42))
	if err != nil {
		t.Fatalf("Set32 failed: %v", err)
	}

	val, err := mem.Get32(0)
	if err != nil {
		t.Fatalf("Get32 failed: %v", err)
	}

	if val.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("Expected 42, got %s", val.String())
	}
}

func TestMemory_Resize(t *testing.T) {
	mem := NewMemory()

	if mem.Len() != 0 {
		t.Errorf("Expected length 0, got %d", mem.Len())
	}

	err := mem.Resize(100)
	if err != nil {
		t.Fatalf("Resize failed: %v", err)
	}

	if mem.Len() != 100 {
		t.Errorf("Expected length 100, got %d", mem.Len())
	}
}

func TestStateDB_ReadWriteTracking(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer store.Close()

	stateDB := NewStateDB(store)

	// Read balance (should track read)
	testAddr := core.Address{1, 2, 3}
	_ = stateDB.GetBalance(testAddr)

	readSet := stateDB.GetReadSet()
	if len(readSet) == 0 {
		t.Error("ReadSet should contain the balance read")
	}

	// Write balance (should track write)
	stateDB.SetBalance(testAddr, big.NewInt(500))

	writeSet := stateDB.GetWriteSet()
	if len(writeSet) == 0 {
		t.Error("WriteSet should contain the balance write")
	}
}

func TestStateDB_StorageTracking(t *testing.T) {
	tmpDir := t.TempDir()
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer store.Close()

	stateDB := NewStateDB(store)

	contractAddr := core.Address{1, 2, 3}
	slot := core.Hash{4, 5, 6}

	// Read storage slot (should track read)
	_ = stateDB.GetState(contractAddr, slot)

	readSet := stateDB.GetReadSet()
	foundRead := false
	for key := range readSet {
		if len(key) > 0 && key[0] == byte(core.KeyTypeStorage) {
			foundRead = true
			break
		}
	}
	if !foundRead {
		t.Error("ReadSet should contain storage read")
	}

	// Write storage slot (should track write)
	value := core.Hash{7, 8, 9}
	stateDB.SetState(contractAddr, slot, value)

	writeSet := stateDB.GetWriteSet()
	if len(writeSet) == 0 {
		t.Error("WriteSet should contain storage write")
	}
}

// ==================== ERC20 TOKEN TESTS ====================

// TestERC20_MappingStorage tests storage slot calculation for ERC20 balances mapping
// In Solidity, mapping(address => uint256) balances stores at keccak256(address . slot)
func TestERC20_MappingStorage(t *testing.T) {
	evm, stateDB, cleanup := setupTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{0xEE, 0xC2, 0x00}
	ownerAddr := core.Address{0xAA, 0xBB, 0xCC}

	// ERC20 balances are typically at slot 0
	// The storage key for balances[owner] = keccak256(abi.encode(owner, slot))
	// For simplicity, we'll use a direct slot approach

	// Store balance: balances[owner] = 1000000
	// We compute the slot as: keccak256(owner ++ slot0)
	// For this test, we'll just use a precomputed slot

	// Simplified: store at slot = hash(owner address padded to 32 bytes)
	var ownerPadded [32]byte
	copy(ownerPadded[12:], ownerAddr[:]) // Address is 20 bytes, pad to 32

	balanceSlot := core.HashData(ownerPadded[:])

	// Set initial balance
	initialBalance := big.NewInt(1000000)
	stateDB.SetState(contractAddr, balanceSlot, bigIntToHash(initialBalance))

	// Code to load balance from the computed slot and return it
	// We'll compute the slot in the EVM using SHA3
	code := []byte{
		// Store owner address (padded) in memory at offset 0
		// PUSH20 pushes a 20-byte value that becomes 32 bytes left-padded with zeros on stack
		// MSTORE at offset 0 stores these 32 bytes, with address at bytes [12:32]
		PUSH20, 0xAA, 0xBB, 0xCC, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
		PUSH1, 0x00, // offset 0
		MSTORE,      // Store at memory[0:32] - address is right-aligned (at bytes 12-31)

		// Hash the 32 bytes at memory[0:32] to get the storage slot
		PUSH1, 0x20, // size = 32
		PUSH1, 0x00, // offset = 0
		SHA3, // keccak256(memory[0:32])

		// Load from that storage slot
		SLOAD,

		// Return the value
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: ownerAddr,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Execution failed: %v", result.Err)
	}

	actual := new(big.Int).SetBytes(result.ReturnData)
	if actual.Cmp(initialBalance) != 0 {
		t.Errorf("Expected balance %s, got %s", initialBalance.String(), actual.String())
	}
}

// TestERC20_Transfer tests a simplified ERC20 transfer operation
func TestERC20_Transfer(t *testing.T) {
	evm, stateDB, cleanup := setupTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{0xEE, 0xC2, 0x00}
	sender := core.Address{0xAA, 0xBB, 0xCC}
	recipient := core.Address{0xDD, 0xEE, 0xFF}

	// Compute storage slots for sender and recipient balances
	var senderPadded, recipientPadded [32]byte
	copy(senderPadded[12:], sender[:])
	copy(recipientPadded[12:], recipient[:])

	senderSlot := core.HashData(senderPadded[:])
	recipientSlot := core.HashData(recipientPadded[:])

	// Initial balances
	senderBalance := big.NewInt(1000)
	recipientBalance := big.NewInt(0)
	transferAmount := big.NewInt(250)

	stateDB.SetState(contractAddr, senderSlot, bigIntToHash(senderBalance))
	stateDB.SetState(contractAddr, recipientSlot, bigIntToHash(recipientBalance))

	// Clear the write set to track only the transfer
	stateDB.ClearSets()

	// Bytecode for transfer(recipient, amount):
	// 1. Load sender balance
	// 2. Check sender balance >= amount
	// 3. Subtract amount from sender
	// 4. Add amount to recipient
	// 5. Return success (1)

	// For simplicity, we'll use calldata: first 20 bytes = recipient, next 32 bytes = amount
	calldata := make([]byte, 52)
	copy(calldata[0:20], recipient[:])
	amountHash := bigIntToHash(transferAmount)
	copy(calldata[20:52], amountHash[:])

	code := []byte{
		// === Compute sender's balance slot ===
		// Store CALLER address padded at memory[0:32]
		// CALLER pushes 20-byte address as 32-byte left-padded value
		// MSTORE at offset 0 stores it at memory[0:32] with address right-aligned
		CALLER,      // Push caller address (32 bytes: 12 zeros + 20-byte addr)
		PUSH1, 0x00, // offset 0
		MSTORE, // memory[0:32] = (12 zeros + caller addr)

		// Hash to get sender slot
		PUSH1, 0x20, // size
		PUSH1, 0x00, // offset
		SHA3, // stack: [senderSlot]

		// Duplicate sender slot for later use
		DUP1, // stack: [senderSlot, senderSlot]

		// Load sender balance
		SLOAD, // stack: [senderBalance, senderSlot]

		// === Load transfer amount from calldata ===
		PUSH1, 0x14, // offset 20 (after recipient address)
		CALLDATALOAD, // stack: [amount, senderBalance, senderSlot]

		// === Check balance >= amount (revert if amount > balance) ===
		// We want to revert if amount > balance
		// LT pops a (top), b (second) and returns b < a
		DUP1,               // stack: [amount, amount, senderBalance, senderSlot]
		DUP3,               // stack: [senderBalance, amount, amount, senderBalance, senderSlot]
		LT,                 // senderBalance < amount? (revert if true)
		PUSH1, 0x3B, JUMPI, // Jump to REVERT at offset 59 (0x3B) if insufficient balance

		// === Subtract from sender ===
		// stack: [amount, senderBalance, senderSlot]
		SWAP1,       // stack: [senderBalance, amount, senderSlot]
		DUP2,        // stack: [amount, senderBalance, amount, senderSlot]
		SWAP1,       // stack: [senderBalance, amount, amount, senderSlot]
		SUB,         // stack: [newSenderBalance, amount, senderSlot]
		DUP3,        // stack: [senderSlot, newSenderBalance, amount, senderSlot]
		SSTORE,      // Store new sender balance; stack: [amount, senderSlot]
		SWAP1, POP,  // stack: [amount]

		// === Compute recipient's balance slot ===
		// Load recipient from calldata
		PUSH1, 0x00, // offset 0
		CALLDATALOAD, // stack: [recipientPadded, amount]
		// Note: calldataload returns 32 bytes, recipient is in high 20 bytes (left-aligned)
		// After SHR, it becomes a 20-byte address left-padded with zeros (right-aligned)
		PUSH1, 96, // 256 - 160 = 96 bits to shift right
		SHR, // stack: [recipient, amount] - recipient is now right-aligned

		// Store recipient padded at memory[0:32]
		// The value is already right-aligned (12 zeros + 20-byte address)
		PUSH1, 0x00,
		MSTORE, // memory[0:32] = (12 zeros + recipient addr)

		// Hash to get recipient slot
		PUSH1, 0x20,
		PUSH1, 0x00,
		SHA3, // stack: [recipientSlot, amount]

		// === Add to recipient ===
		DUP1,  // stack: [recipientSlot, recipientSlot, amount]
		SLOAD, // stack: [recipientBalance, recipientSlot, amount]
		DUP3,  // stack: [amount, recipientBalance, recipientSlot, amount]
		ADD,   // stack: [newRecipientBalance, recipientSlot, amount]
		SWAP1, // stack: [recipientSlot, newRecipientBalance, amount]
		SSTORE, // Store new recipient balance

		// === Return success (1) ===
		POP,         // clean stack
		PUSH1, 0x01, // success = 1
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,

		// === REVERT (insufficient balance) ===
		JUMPDEST,    // position 0x3B (59)
		PUSH1, 0x00,
		PUSH1, 0x00,
		REVERT,
	}

	contract := &Contract{
		CallerAddress: sender,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         calldata,
		Code:          code,
		Gas:           200000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("Transfer failed: %v", result.Err)
	}

	if result.Reverted {
		t.Fatal("Transfer was reverted")
	}

	// Verify return value is 1 (success)
	returnVal := new(big.Int).SetBytes(result.ReturnData)
	if returnVal.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("Expected return value 1, got %s", returnVal.String())
	}

	// Verify balances in storage
	newSenderBalance := stateDB.GetState(contractAddr, senderSlot)
	newRecipientBalance := stateDB.GetState(contractAddr, recipientSlot)

	expectedSenderBalance := big.NewInt(750)  // 1000 - 250
	expectedRecipientBalance := big.NewInt(250) // 0 + 250

	actualSender := new(big.Int).SetBytes(newSenderBalance[:])
	actualRecipient := new(big.Int).SetBytes(newRecipientBalance[:])

	if actualSender.Cmp(expectedSenderBalance) != 0 {
		t.Errorf("Sender balance: expected %s, got %s", expectedSenderBalance.String(), actualSender.String())
	}

	if actualRecipient.Cmp(expectedRecipientBalance) != 0 {
		t.Errorf("Recipient balance: expected %s, got %s", expectedRecipientBalance.String(), actualRecipient.String())
	}

	// Verify WriteSet contains the balance updates
	writeSet := stateDB.GetWriteSet()
	if len(writeSet) < 2 {
		t.Errorf("WriteSet should contain at least 2 storage writes, got %d", len(writeSet))
	}

	t.Logf("Transfer successful! Sender: %s -> %s, Recipient: %s -> %s",
		senderBalance.String(), actualSender.String(),
		recipientBalance.String(), actualRecipient.String())
	t.Logf("Gas used: %d", result.GasUsed)
}

// TestERC20_TransferInsufficientBalance tests transfer with insufficient balance
func TestERC20_TransferInsufficientBalance(t *testing.T) {
	evm, stateDB, cleanup := setupTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{0xEE, 0xC2, 0x00}
	sender := core.Address{0xAA, 0xBB, 0xCC}
	recipient := core.Address{0xDD, 0xEE, 0xFF}

	// Compute storage slot for sender
	var senderPadded [32]byte
	copy(senderPadded[12:], sender[:])
	senderSlot := core.HashData(senderPadded[:])

	// Sender has only 100 tokens
	senderBalance := big.NewInt(100)
	transferAmount := big.NewInt(500) // Try to transfer more than balance

	stateDB.SetState(contractAddr, senderSlot, bigIntToHash(senderBalance))

	// Same transfer code as above
	calldata := make([]byte, 52)
	copy(calldata[0:20], recipient[:])
	amountHash := bigIntToHash(transferAmount)
	copy(calldata[20:52], amountHash[:])

	code := []byte{
		// Store CALLER at memory[0:32] (address is right-aligned)
		CALLER, PUSH1, 0x00, MSTORE,
		// Hash to get sender's balance slot
		PUSH1, 0x20, PUSH1, 0x00, SHA3,
		DUP1, SLOAD,
		// Load transfer amount from calldata
		PUSH1, 0x14, CALLDATALOAD,
		// Check if balance < amount (revert if true)
		DUP1, DUP3, LT,
		PUSH1, 0x1E, JUMPI, // Jump to REVERT at offset 30 (0x1E)
		// ... rest of transfer code (won't execute in this test)
		PUSH1, 0x01, PUSH1, 0x00, MSTORE,
		PUSH1, 0x20, PUSH1, 0x00, RETURN,
		// REVERT at offset 30 (0x1E)
		JUMPDEST, PUSH1, 0x00, PUSH1, 0x00, REVERT,
	}

	contract := &Contract{
		CallerAddress: sender,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         calldata,
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if !result.Reverted {
		t.Error("Transfer should have been reverted due to insufficient balance")
	}

	t.Log("Transfer correctly reverted due to insufficient balance")
}

// TestERC20_BalanceOf tests reading a balance using function selector
func TestERC20_BalanceOf(t *testing.T) {
	evm, stateDB, cleanup := setupTestEVM(t)
	defer cleanup()

	contractAddr := core.Address{0xEE, 0xC2, 0x00}
	queryAddr := core.Address{0x11, 0x22, 0x33}

	// Set up balance
	var queryPadded [32]byte
	copy(queryPadded[12:], queryAddr[:])
	balanceSlot := core.HashData(queryPadded[:])

	expectedBalance := big.NewInt(999999)
	stateDB.SetState(contractAddr, balanceSlot, bigIntToHash(expectedBalance))

	// balanceOf(address) selector: 0x70a08231
	// Calldata: selector (4 bytes) + address padded to 32 bytes
	calldata := make([]byte, 36)
	calldata[0] = 0x70
	calldata[1] = 0xa0
	calldata[2] = 0x82
	calldata[3] = 0x31
	copy(calldata[4+12:], queryAddr[:]) // Address at bytes 4-35 (right-aligned)

	// Contract that reads selector and dispatches to balanceOf
	code := []byte{
		// Load function selector (first 4 bytes of calldata)
		PUSH1, 0x00,
		CALLDATALOAD, // Load 32 bytes at offset 0
		PUSH1, 224,   // 256 - 32 = 224 bits
		SHR,          // Right shift to get first 4 bytes

		// Check if selector == 0x70a08231 (balanceOf)
		PUSH4, 0x70, 0xa0, 0x82, 0x31,
		EQ,
		PUSH1, 0x14, // Jump to balanceOf handler
		JUMPI,

		// Default: revert (unknown function)
		PUSH1, 0x00, PUSH1, 0x00, REVERT,

		// balanceOf handler
		JUMPDEST, // position 0x14

		// Load address from calldata (at offset 4, padded to 32 bytes)
		PUSH1, 0x04,
		CALLDATALOAD, // Stack: [addressPadded]

		// Store at memory[0:32]
		PUSH1, 0x00,
		MSTORE,

		// Hash to get storage slot
		PUSH1, 0x20,
		PUSH1, 0x00,
		SHA3,

		// Load balance
		SLOAD,

		// Return balance
		PUSH1, 0x00,
		MSTORE,
		PUSH1, 0x20,
		PUSH1, 0x00,
		RETURN,
	}

	contract := &Contract{
		CallerAddress: core.Address{0xFF},
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         calldata,
		Code:          code,
		Gas:           100000,
	}

	result := evm.Execute(contract)

	if result.Err != nil {
		t.Fatalf("balanceOf failed: %v", result.Err)
	}

	actualBalance := new(big.Int).SetBytes(result.ReturnData)
	if actualBalance.Cmp(expectedBalance) != 0 {
		t.Errorf("balanceOf returned %s, expected %s", actualBalance.String(), expectedBalance.String())
	}

	t.Logf("balanceOf(%x) = %s", queryAddr, actualBalance.String())
}
