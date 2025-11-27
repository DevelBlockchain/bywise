package executor

import (
	"errors"
	"math/big"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/wallet"
)

var (
	ErrOutOfGas            = errors.New("out of gas")
	ErrInvalidJump         = errors.New("invalid jump destination")
	ErrReturnDataOverflow  = errors.New("return data out of bounds")
	ErrWriteProtection     = errors.New("write protection")
	ErrExecutionReverted   = errors.New("execution reverted")
	ErrMaxCodeSizeExceeded = errors.New("max code size exceeded")
	ErrInvalidOpcode       = errors.New("invalid opcode")
	ErrDepthExceeded       = errors.New("max call depth exceeded")
)

const (
	// MaxCodeSize is the maximum size of contract code (24KB)
	MaxCodeSize = 24576
	// MaxCallDepth is the maximum call depth
	MaxCallDepth = 1024
	// DefaultGasLimit is the default gas limit
	DefaultGasLimit = 10000000
)

// Context holds execution context information
type Context struct {
	Origin      core.Address // Original transaction sender
	GasPrice    *big.Int     // Gas price
	Coinbase    core.Address // Block miner
	GasLimit    uint64       // Block gas limit
	BlockNumber *big.Int     // Block number
	Time        *big.Int     // Block timestamp
	Difficulty  *big.Int     // Block difficulty
	ChainID     *big.Int     // Chain ID
}

// Contract represents a contract being executed
type Contract struct {
	CallerAddress core.Address // Caller address
	Address       core.Address // Contract address
	Value         *big.Int     // Value sent with call
	Input         []byte       // Call input data
	Code          []byte       // Contract code
	Gas           uint64       // Available gas
}

// ExecutionResult contains the result of EVM execution
type ExecutionResult struct {
	ReturnData []byte // Data returned by execution
	GasUsed    uint64 // Gas consumed
	Err        error  // Execution error (if any)
	Reverted   bool   // Whether execution was reverted
}

// EVM represents the Ethereum Virtual Machine
type EVM struct {
	Context  *Context
	StateDB  *StateDB
	depth    int
	readOnly bool
}

// NewEVM creates a new EVM instance
func NewEVM(ctx *Context, stateDB *StateDB) *EVM {
	return &EVM{
		Context: ctx,
		StateDB: stateDB,
		depth:   0,
	}
}

// Execute executes the given contract code
func (evm *EVM) Execute(contract *Contract) *ExecutionResult {
	if evm.depth > MaxCallDepth {
		return &ExecutionResult{Err: ErrDepthExceeded}
	}

	// Create execution environment
	stack := NewStack()
	memory := NewMemory()
	pc := uint64(0)
	returnData := []byte{}
	gasUsed := uint64(0)

	code := contract.Code
	codeLen := uint64(len(code))

	// Build jump destination table
	jumpDests := make(map[uint64]bool)
	for i := uint64(0); i < codeLen; i++ {
		if code[i] == JUMPDEST {
			jumpDests[i] = true
		}
		// Skip PUSH data
		if code[i] >= PUSH1 && code[i] <= PUSH32 {
			i += uint64(code[i] - PUSH1 + 1)
		}
	}

	for pc < codeLen {
		op := code[pc]
		pc++

		// Gas metering (simplified - each op costs 3 gas by default)
		gasCost := uint64(3)
		if op == SSTORE {
			gasCost = 20000
		} else if op == SLOAD {
			gasCost = 800
		} else if op == CALL || op == DELEGATECALL || op == STATICCALL {
			gasCost = 700
		} else if op == CREATE || op == CREATE2 {
			gasCost = 32000
		}

		if contract.Gas < gasCost {
			return &ExecutionResult{Err: ErrOutOfGas, GasUsed: gasUsed}
		}
		contract.Gas -= gasCost
		gasUsed += gasCost

		var err error

		switch op {
		case STOP:
			return &ExecutionResult{ReturnData: returnData, GasUsed: gasUsed}

		case ADD:
			err = evm.opAdd(stack)
		case MUL:
			err = evm.opMul(stack)
		case SUB:
			err = evm.opSub(stack)
		case DIV:
			err = evm.opDiv(stack)
		case SDIV:
			err = evm.opSDiv(stack)
		case MOD:
			err = evm.opMod(stack)
		case SMOD:
			err = evm.opSMod(stack)
		case ADDMOD:
			err = evm.opAddMod(stack)
		case MULMOD:
			err = evm.opMulMod(stack)
		case EXP:
			err = evm.opExp(stack)
		case SIGNEXTEND:
			err = evm.opSignExtend(stack)

		case LT:
			err = evm.opLt(stack)
		case GT:
			err = evm.opGt(stack)
		case SLT:
			err = evm.opSlt(stack)
		case SGT:
			err = evm.opSgt(stack)
		case EQ:
			err = evm.opEq(stack)
		case ISZERO:
			err = evm.opIsZero(stack)
		case AND:
			err = evm.opAnd(stack)
		case OR:
			err = evm.opOr(stack)
		case XOR:
			err = evm.opXor(stack)
		case NOT:
			err = evm.opNot(stack)
		case BYTE:
			err = evm.opByte(stack)
		case SHL:
			err = evm.opSHL(stack)
		case SHR:
			err = evm.opSHR(stack)
		case SAR:
			err = evm.opSAR(stack)

		case SHA3:
			err = evm.opSha3(stack, memory)

		case ADDRESS:
			err = stack.Push(new(big.Int).SetBytes(contract.Address[:]))
		case BALANCE:
			err = evm.opBalance(stack)
		case ORIGIN:
			err = stack.Push(new(big.Int).SetBytes(evm.Context.Origin[:]))
		case CALLER:
			err = stack.Push(new(big.Int).SetBytes(contract.CallerAddress[:]))
		case CALLVALUE:
			err = stack.Push(new(big.Int).Set(contract.Value))
		case CALLDATALOAD:
			err = evm.opCallDataLoad(stack, contract.Input)
		case CALLDATASIZE:
			err = stack.Push(big.NewInt(int64(len(contract.Input))))
		case CALLDATACOPY:
			err = evm.opCallDataCopy(stack, memory, contract.Input)
		case CODESIZE:
			err = stack.Push(big.NewInt(int64(len(contract.Code))))
		case CODECOPY:
			err = evm.opCodeCopy(stack, memory, contract.Code)
		case GASPRICE:
			err = stack.Push(new(big.Int).Set(evm.Context.GasPrice))
		case EXTCODESIZE:
			err = evm.opExtCodeSize(stack)
		case EXTCODECOPY:
			err = evm.opExtCodeCopy(stack, memory)
		case RETURNDATASIZE:
			err = stack.Push(big.NewInt(int64(len(returnData))))
		case RETURNDATACOPY:
			err = evm.opReturnDataCopy(stack, memory, returnData)
		case EXTCODEHASH:
			err = evm.opExtCodeHash(stack)

		case BLOCKHASH:
			err = evm.opBlockHash(stack)
		case COINBASE:
			err = stack.Push(new(big.Int).SetBytes(evm.Context.Coinbase[:]))
		case TIMESTAMP:
			err = stack.Push(new(big.Int).Set(evm.Context.Time))
		case NUMBER:
			err = stack.Push(new(big.Int).Set(evm.Context.BlockNumber))
		case DIFFICULTY:
			err = stack.Push(new(big.Int).Set(evm.Context.Difficulty))
		case GASLIMIT:
			err = stack.Push(big.NewInt(int64(evm.Context.GasLimit)))
		case CHAINID:
			err = stack.Push(new(big.Int).Set(evm.Context.ChainID))
		case SELFBALANCE:
			balance := evm.StateDB.GetBalance(contract.Address)
			err = stack.Push(balance)
		case BASEFEE:
			err = stack.Push(big.NewInt(0)) // Simplified

		case POP:
			_, err = stack.Pop()
		case MLOAD:
			err = evm.opMload(stack, memory)
		case MSTORE:
			err = evm.opMstore(stack, memory)
		case MSTORE8:
			err = evm.opMstore8(stack, memory)
		case SLOAD:
			err = evm.opSload(stack, contract.Address)
		case SSTORE:
			if evm.readOnly {
				return &ExecutionResult{Err: ErrWriteProtection, GasUsed: gasUsed}
			}
			err = evm.opSstore(stack, contract.Address)
		case JUMP:
			dest, popErr := stack.Pop()
			if popErr != nil {
				err = popErr
				break
			}
			if !jumpDests[dest.Uint64()] {
				return &ExecutionResult{Err: ErrInvalidJump, GasUsed: gasUsed}
			}
			pc = dest.Uint64()
		case JUMPI:
			dest, popErr := stack.Pop()
			if popErr != nil {
				err = popErr
				break
			}
			cond, popErr := stack.Pop()
			if popErr != nil {
				err = popErr
				break
			}
			if cond.Sign() != 0 {
				if !jumpDests[dest.Uint64()] {
					return &ExecutionResult{Err: ErrInvalidJump, GasUsed: gasUsed}
				}
				pc = dest.Uint64()
			}
		case PC:
			err = stack.Push(big.NewInt(int64(pc - 1)))
		case MSIZE:
			err = stack.Push(big.NewInt(int64(memory.Len())))
		case GAS:
			err = stack.Push(big.NewInt(int64(contract.Gas)))
		case JUMPDEST:
			// No operation

		case MCOPY:
			// EIP-5656: Memory copying instruction
			err = evm.opMcopy(stack, memory)

		case PUSH0:
			// EIP-3855: Push zero onto stack
			err = stack.Push(big.NewInt(0))

		case PUSH1, PUSH2, PUSH3, PUSH4, PUSH5, PUSH6, PUSH7, PUSH8,
			PUSH9, PUSH10, PUSH11, PUSH12, PUSH13, PUSH14, PUSH15, PUSH16,
			PUSH17, PUSH18, PUSH19, PUSH20, PUSH21, PUSH22, PUSH23, PUSH24,
			PUSH25, PUSH26, PUSH27, PUSH28, PUSH29, PUSH30, PUSH31, PUSH32:
			size := int(op - PUSH1 + 1)
			data := make([]byte, size)
			for i := 0; i < size && pc < codeLen; i++ {
				data[i] = code[pc]
				pc++
			}
			err = stack.PushBytes(data)

		case DUP1, DUP2, DUP3, DUP4, DUP5, DUP6, DUP7, DUP8,
			DUP9, DUP10, DUP11, DUP12, DUP13, DUP14, DUP15, DUP16:
			err = stack.Dup(int(op - DUP1 + 1))

		case SWAP1, SWAP2, SWAP3, SWAP4, SWAP5, SWAP6, SWAP7, SWAP8,
			SWAP9, SWAP10, SWAP11, SWAP12, SWAP13, SWAP14, SWAP15, SWAP16:
			err = stack.Swap(int(op - SWAP1 + 1))

		case LOG0, LOG1, LOG2, LOG3, LOG4:
			err = evm.opLog(stack, memory, op)

		case CREATE:
			if evm.readOnly {
				return &ExecutionResult{Err: ErrWriteProtection, GasUsed: gasUsed}
			}
			result := evm.opCreate(stack, memory, contract)
			returnData = result.ReturnData
			if result.Err != nil {
				err = stack.Push(big.NewInt(0))
			}
		case CREATE2:
			if evm.readOnly {
				return &ExecutionResult{Err: ErrWriteProtection, GasUsed: gasUsed}
			}
			result := evm.opCreate2(stack, memory, contract)
			returnData = result.ReturnData
			if result.Err != nil {
				err = stack.Push(big.NewInt(0))
			}

		case CALL:
			result := evm.opCall(stack, memory, contract)
			returnData = result.ReturnData
			if result.Err != nil || result.Reverted {
				err = stack.Push(big.NewInt(0))
			} else {
				err = stack.Push(big.NewInt(1))
			}
		case CALLCODE:
			result := evm.opCallCode(stack, memory, contract)
			returnData = result.ReturnData
			if result.Err != nil || result.Reverted {
				err = stack.Push(big.NewInt(0))
			} else {
				err = stack.Push(big.NewInt(1))
			}
		case DELEGATECALL:
			result := evm.opDelegateCall(stack, memory, contract)
			returnData = result.ReturnData
			if result.Err != nil || result.Reverted {
				err = stack.Push(big.NewInt(0))
			} else {
				err = stack.Push(big.NewInt(1))
			}
		case STATICCALL:
			result := evm.opStaticCall(stack, memory, contract)
			returnData = result.ReturnData
			if result.Err != nil || result.Reverted {
				err = stack.Push(big.NewInt(0))
			} else {
				err = stack.Push(big.NewInt(1))
			}

		case RETURN:
			offset, popErr := stack.Pop()
			if popErr != nil {
				return &ExecutionResult{Err: popErr, GasUsed: gasUsed}
			}
			size, popErr := stack.Pop()
			if popErr != nil {
				return &ExecutionResult{Err: popErr, GasUsed: gasUsed}
			}
			data, memErr := memory.Get(offset.Uint64(), size.Uint64())
			if memErr != nil {
				return &ExecutionResult{Err: memErr, GasUsed: gasUsed}
			}
			return &ExecutionResult{ReturnData: data, GasUsed: gasUsed}

		case REVERT:
			offset, popErr := stack.Pop()
			if popErr != nil {
				return &ExecutionResult{Err: popErr, GasUsed: gasUsed, Reverted: true}
			}
			size, popErr := stack.Pop()
			if popErr != nil {
				return &ExecutionResult{Err: popErr, GasUsed: gasUsed, Reverted: true}
			}
			data, memErr := memory.Get(offset.Uint64(), size.Uint64())
			if memErr != nil {
				return &ExecutionResult{Err: memErr, GasUsed: gasUsed, Reverted: true}
			}
			return &ExecutionResult{ReturnData: data, Err: ErrExecutionReverted, GasUsed: gasUsed, Reverted: true}

		case INVALID:
			return &ExecutionResult{Err: ErrInvalidOpcode, GasUsed: gasUsed}

		case SELFDESTRUCT:
			if evm.readOnly {
				return &ExecutionResult{Err: ErrWriteProtection, GasUsed: gasUsed}
			}
			err = evm.opSelfDestruct(stack, contract)
			if err == nil {
				return &ExecutionResult{GasUsed: gasUsed}
			}

		default:
			return &ExecutionResult{Err: ErrInvalidOpcode, GasUsed: gasUsed}
		}

		if err != nil {
			return &ExecutionResult{Err: err, GasUsed: gasUsed}
		}
	}

	return &ExecutionResult{ReturnData: returnData, GasUsed: gasUsed}
}

// --- Arithmetic Operations ---

func (evm *EVM) opAdd(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	return stack.Push(new(big.Int).Add(x, y))
}

func (evm *EVM) opMul(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	return stack.Push(new(big.Int).Mul(x, y))
}

func (evm *EVM) opSub(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	return stack.Push(new(big.Int).Sub(x, y))
}

func (evm *EVM) opDiv(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	if y.Sign() == 0 {
		return stack.Push(big.NewInt(0))
	}
	return stack.Push(new(big.Int).Div(x, y))
}

func (evm *EVM) opSDiv(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	if y.Sign() == 0 {
		return stack.Push(big.NewInt(0))
	}
	// Signed division
	return stack.Push(new(big.Int).Quo(x, y))
}

func (evm *EVM) opMod(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	if y.Sign() == 0 {
		return stack.Push(big.NewInt(0))
	}
	return stack.Push(new(big.Int).Mod(x, y))
}

func (evm *EVM) opSMod(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	if y.Sign() == 0 {
		return stack.Push(big.NewInt(0))
	}
	return stack.Push(new(big.Int).Rem(x, y))
}

func (evm *EVM) opAddMod(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	z, err := stack.Pop()
	if err != nil {
		return err
	}
	if z.Sign() == 0 {
		return stack.Push(big.NewInt(0))
	}
	sum := new(big.Int).Add(x, y)
	return stack.Push(sum.Mod(sum, z))
}

func (evm *EVM) opMulMod(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	z, err := stack.Pop()
	if err != nil {
		return err
	}
	if z.Sign() == 0 {
		return stack.Push(big.NewInt(0))
	}
	prod := new(big.Int).Mul(x, y)
	return stack.Push(prod.Mod(prod, z))
}

func (evm *EVM) opExp(stack *Stack) error {
	base, err := stack.Pop()
	if err != nil {
		return err
	}
	exp, err := stack.Pop()
	if err != nil {
		return err
	}
	return stack.Push(new(big.Int).Exp(base, exp, nil))
}

func (evm *EVM) opSignExtend(stack *Stack) error {
	back, err := stack.Pop()
	if err != nil {
		return err
	}
	num, err := stack.Pop()
	if err != nil {
		return err
	}

	if back.Cmp(big.NewInt(31)) < 0 {
		bit := uint(back.Uint64()*8 + 7)
		mask := new(big.Int).Lsh(big.NewInt(1), bit)
		if num.Bit(int(bit)) > 0 {
			num.Or(num, new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), mask))
		} else {
			num.And(num, new(big.Int).Sub(mask, big.NewInt(1)))
		}
	}
	return stack.Push(num)
}

// --- Comparison Operations ---

func (evm *EVM) opLt(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	if x.Cmp(y) < 0 {
		return stack.Push(big.NewInt(1))
	}
	return stack.Push(big.NewInt(0))
}

func (evm *EVM) opGt(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	if x.Cmp(y) > 0 {
		return stack.Push(big.NewInt(1))
	}
	return stack.Push(big.NewInt(0))
}

func (evm *EVM) opSlt(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	// Signed comparison
	if x.Cmp(y) < 0 {
		return stack.Push(big.NewInt(1))
	}
	return stack.Push(big.NewInt(0))
}

func (evm *EVM) opSgt(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	// Signed comparison
	if x.Cmp(y) > 0 {
		return stack.Push(big.NewInt(1))
	}
	return stack.Push(big.NewInt(0))
}

func (evm *EVM) opEq(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	if x.Cmp(y) == 0 {
		return stack.Push(big.NewInt(1))
	}
	return stack.Push(big.NewInt(0))
}

func (evm *EVM) opIsZero(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	if x.Sign() == 0 {
		return stack.Push(big.NewInt(1))
	}
	return stack.Push(big.NewInt(0))
}

// --- Bitwise Operations ---

func (evm *EVM) opAnd(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	return stack.Push(new(big.Int).And(x, y))
}

func (evm *EVM) opOr(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	return stack.Push(new(big.Int).Or(x, y))
}

func (evm *EVM) opXor(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	y, err := stack.Pop()
	if err != nil {
		return err
	}
	return stack.Push(new(big.Int).Xor(x, y))
}

func (evm *EVM) opNot(stack *Stack) error {
	x, err := stack.Pop()
	if err != nil {
		return err
	}
	// 256-bit NOT
	max := new(big.Int).Lsh(big.NewInt(1), 256)
	max.Sub(max, big.NewInt(1))
	return stack.Push(new(big.Int).Xor(x, max))
}

func (evm *EVM) opByte(stack *Stack) error {
	th, err := stack.Pop()
	if err != nil {
		return err
	}
	val, err := stack.Pop()
	if err != nil {
		return err
	}

	if th.Cmp(big.NewInt(32)) >= 0 {
		return stack.Push(big.NewInt(0))
	}

	// Get the th byte from val (big-endian)
	// Pad val to 32 bytes and get the th byte
	b := val.Bytes()
	padLen := 32 - len(b)
	idx := int(th.Int64()) - padLen
	if idx < 0 {
		// th points to a leading zero byte
		return stack.Push(big.NewInt(0))
	}
	if idx >= len(b) {
		return stack.Push(big.NewInt(0))
	}
	return stack.Push(big.NewInt(int64(b[idx])))
}

func (evm *EVM) opSHL(stack *Stack) error {
	shift, err := stack.Pop()
	if err != nil {
		return err
	}
	value, err := stack.Pop()
	if err != nil {
		return err
	}
	if shift.Cmp(big.NewInt(256)) >= 0 {
		return stack.Push(big.NewInt(0))
	}
	return stack.Push(new(big.Int).Lsh(value, uint(shift.Uint64())))
}

func (evm *EVM) opSHR(stack *Stack) error {
	shift, err := stack.Pop()
	if err != nil {
		return err
	}
	value, err := stack.Pop()
	if err != nil {
		return err
	}
	if shift.Cmp(big.NewInt(256)) >= 0 {
		return stack.Push(big.NewInt(0))
	}
	return stack.Push(new(big.Int).Rsh(value, uint(shift.Uint64())))
}

func (evm *EVM) opSAR(stack *Stack) error {
	shift, err := stack.Pop()
	if err != nil {
		return err
	}
	value, err := stack.Pop()
	if err != nil {
		return err
	}
	// Arithmetic right shift (preserves sign)
	if shift.Cmp(big.NewInt(256)) >= 0 {
		if value.Sign() < 0 {
			return stack.Push(big.NewInt(-1))
		}
		return stack.Push(big.NewInt(0))
	}
	return stack.Push(new(big.Int).Rsh(value, uint(shift.Uint64())))
}

// --- SHA3 ---

func (evm *EVM) opSha3(stack *Stack, memory *Memory) error {
	offset, err := stack.Pop()
	if err != nil {
		return err
	}
	size, err := stack.Pop()
	if err != nil {
		return err
	}
	data, err := memory.Get(offset.Uint64(), size.Uint64())
	if err != nil {
		return err
	}
	hash := wallet.Keccak256(data)
	return stack.Push(new(big.Int).SetBytes(hash))
}

// --- Memory Operations ---

func (evm *EVM) opMload(stack *Stack, memory *Memory) error {
	offset, err := stack.Pop()
	if err != nil {
		return err
	}
	val, err := memory.Get32(offset.Uint64())
	if err != nil {
		return err
	}
	return stack.Push(val)
}

func (evm *EVM) opMstore(stack *Stack, memory *Memory) error {
	offset, err := stack.Pop()
	if err != nil {
		return err
	}
	val, err := stack.Pop()
	if err != nil {
		return err
	}
	return memory.Set32(offset.Uint64(), val)
}

func (evm *EVM) opMstore8(stack *Stack, memory *Memory) error {
	offset, err := stack.Pop()
	if err != nil {
		return err
	}
	val, err := stack.Pop()
	if err != nil {
		return err
	}
	return memory.SetByte(offset.Uint64(), byte(val.Uint64()&0xff))
}

// opMcopy implements EIP-5656: Memory copying instruction
func (evm *EVM) opMcopy(stack *Stack, memory *Memory) error {
	destOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	srcOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	length, err := stack.Pop()
	if err != nil {
		return err
	}

	if length.Sign() == 0 {
		return nil
	}

	// Get source data
	src, err := memory.Get(srcOffset.Uint64(), length.Uint64())
	if err != nil {
		return err
	}

	// Copy to destination (handles overlapping regions)
	return memory.Set(destOffset.Uint64(), length.Uint64(), src)
}

// --- Storage Operations ---

func (evm *EVM) opSload(stack *Stack, addr core.Address) error {
	loc, err := stack.Pop()
	if err != nil {
		return err
	}
	slot := bigIntToHash(loc)
	val := evm.StateDB.GetState(addr, slot)
	return stack.Push(new(big.Int).SetBytes(val[:]))
}

func (evm *EVM) opSstore(stack *Stack, addr core.Address) error {
	loc, err := stack.Pop()
	if err != nil {
		return err
	}
	val, err := stack.Pop()
	if err != nil {
		return err
	}
	slot := bigIntToHash(loc)
	value := bigIntToHash(val)
	evm.StateDB.SetState(addr, slot, value)
	return nil
}

// bigIntToHash converts a big.Int to a 32-byte hash with proper padding
func bigIntToHash(i *big.Int) core.Hash {
	var h core.Hash
	b := i.Bytes()
	if len(b) > 32 {
		copy(h[:], b[len(b)-32:])
	} else {
		copy(h[32-len(b):], b)
	}
	return h
}

// --- Balance ---

func (evm *EVM) opBalance(stack *Stack) error {
	addr, err := stack.Pop()
	if err != nil {
		return err
	}
	address := core.AddressFromBytes(addr.Bytes())
	balance := evm.StateDB.GetBalance(address)
	return stack.Push(balance)
}

// --- Call Data Operations ---

func (evm *EVM) opCallDataLoad(stack *Stack, input []byte) error {
	offset, err := stack.Pop()
	if err != nil {
		return err
	}
	off := int(offset.Uint64())
	data := make([]byte, 32)
	if off < len(input) {
		end := off + 32
		if end > len(input) {
			end = len(input)
		}
		copy(data, input[off:end])
	}
	return stack.Push(new(big.Int).SetBytes(data))
}

func (evm *EVM) opCallDataCopy(stack *Stack, memory *Memory, input []byte) error {
	memOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	dataOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	length, err := stack.Pop()
	if err != nil {
		return err
	}

	dOff := int(dataOffset.Uint64())
	size := int(length.Uint64())
	data := make([]byte, size)

	if dOff < len(input) {
		end := dOff + size
		if end > len(input) {
			end = len(input)
		}
		copy(data, input[dOff:end])
	}

	return memory.Set(memOffset.Uint64(), uint64(size), data)
}

func (evm *EVM) opCodeCopy(stack *Stack, memory *Memory, code []byte) error {
	memOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	codeOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	length, err := stack.Pop()
	if err != nil {
		return err
	}

	cOff := int(codeOffset.Uint64())
	size := int(length.Uint64())
	data := make([]byte, size)

	if cOff < len(code) {
		end := cOff + size
		if end > len(code) {
			end = len(code)
		}
		copy(data, code[cOff:end])
	}

	return memory.Set(memOffset.Uint64(), uint64(size), data)
}

func (evm *EVM) opExtCodeSize(stack *Stack) error {
	addr, err := stack.Pop()
	if err != nil {
		return err
	}
	address := core.AddressFromBytes(addr.Bytes())
	size := evm.StateDB.GetCodeSize(address)
	return stack.Push(big.NewInt(int64(size)))
}

func (evm *EVM) opExtCodeCopy(stack *Stack, memory *Memory) error {
	addr, err := stack.Pop()
	if err != nil {
		return err
	}
	memOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	codeOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	length, err := stack.Pop()
	if err != nil {
		return err
	}

	address := core.AddressFromBytes(addr.Bytes())
	code := evm.StateDB.GetCode(address)

	cOff := int(codeOffset.Uint64())
	size := int(length.Uint64())
	data := make([]byte, size)

	if cOff < len(code) {
		end := cOff + size
		if end > len(code) {
			end = len(code)
		}
		copy(data, code[cOff:end])
	}

	return memory.Set(memOffset.Uint64(), uint64(size), data)
}

func (evm *EVM) opExtCodeHash(stack *Stack) error {
	addr, err := stack.Pop()
	if err != nil {
		return err
	}
	address := core.AddressFromBytes(addr.Bytes())
	hash := evm.StateDB.GetCodeHash(address)
	return stack.Push(new(big.Int).SetBytes(hash[:]))
}

func (evm *EVM) opReturnDataCopy(stack *Stack, memory *Memory, returnData []byte) error {
	memOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	dataOffset, err := stack.Pop()
	if err != nil {
		return err
	}
	length, err := stack.Pop()
	if err != nil {
		return err
	}

	end := dataOffset.Uint64() + length.Uint64()
	if end > uint64(len(returnData)) {
		return ErrReturnDataOverflow
	}

	data := make([]byte, length.Uint64())
	copy(data, returnData[dataOffset.Uint64():end])

	return memory.Set(memOffset.Uint64(), length.Uint64(), data)
}

// --- Block Operations ---

func (evm *EVM) opBlockHash(stack *Stack) error {
	num, err := stack.Pop()
	if err != nil {
		return err
	}
	// Simplified - return empty hash
	_ = num
	return stack.Push(big.NewInt(0))
}

// --- Logging ---

func (evm *EVM) opLog(stack *Stack, memory *Memory, op byte) error {
	if evm.readOnly {
		return ErrWriteProtection
	}

	mStart, err := stack.Pop()
	if err != nil {
		return err
	}
	mSize, err := stack.Pop()
	if err != nil {
		return err
	}

	numTopics := int(op - LOG0)
	topics := make([]core.Hash, numTopics)

	for i := 0; i < numTopics; i++ {
		topic, err := stack.Pop()
		if err != nil {
			return err
		}
		topics[i] = core.HashFromBytes(topic.Bytes())
	}

	// Read log data from memory
	_, err = memory.Get(mStart.Uint64(), mSize.Uint64())
	if err != nil {
		return err
	}

	// In a full implementation, logs would be recorded
	return nil
}

// --- Contract Creation ---

func (evm *EVM) opCreate(stack *Stack, memory *Memory, contract *Contract) *ExecutionResult {
	value, err := stack.Pop()
	if err != nil {
		return &ExecutionResult{Err: err}
	}
	offset, err := stack.Pop()
	if err != nil {
		return &ExecutionResult{Err: err}
	}
	size, err := stack.Pop()
	if err != nil {
		return &ExecutionResult{Err: err}
	}

	input, err := memory.Get(offset.Uint64(), size.Uint64())
	if err != nil {
		return &ExecutionResult{Err: err}
	}

	// Calculate new address
	nonce := evm.StateDB.GetNonce(contract.Address)
	newAddr := createAddress(contract.Address, nonce)

	// Create the contract
	result := evm.create(contract, newAddr, value, input)

	if result.Err == nil {
		stack.Push(new(big.Int).SetBytes(newAddr[:]))
	}

	return result
}

func (evm *EVM) opCreate2(stack *Stack, memory *Memory, contract *Contract) *ExecutionResult {
	value, err := stack.Pop()
	if err != nil {
		return &ExecutionResult{Err: err}
	}
	offset, err := stack.Pop()
	if err != nil {
		return &ExecutionResult{Err: err}
	}
	size, err := stack.Pop()
	if err != nil {
		return &ExecutionResult{Err: err}
	}
	salt, err := stack.Pop()
	if err != nil {
		return &ExecutionResult{Err: err}
	}

	input, err := memory.Get(offset.Uint64(), size.Uint64())
	if err != nil {
		return &ExecutionResult{Err: err}
	}

	// Calculate new address using CREATE2 formula
	newAddr := create2Address(contract.Address, salt.Bytes(), input)

	// Create the contract
	result := evm.create(contract, newAddr, value, input)

	if result.Err == nil {
		stack.Push(new(big.Int).SetBytes(newAddr[:]))
	}

	return result
}

func (evm *EVM) create(caller *Contract, addr core.Address, value *big.Int, code []byte) *ExecutionResult {
	// Check if address already has code
	if len(evm.StateDB.GetCode(addr)) > 0 {
		return &ExecutionResult{Err: errors.New("address already has code")}
	}

	// Transfer value
	if value.Sign() > 0 {
		if !evm.StateDB.SubBalance(caller.Address, value) {
			return &ExecutionResult{Err: errors.New("insufficient balance")}
		}
		evm.StateDB.AddBalance(addr, value)
	}

	// Increment nonce
	nonce := evm.StateDB.GetNonce(caller.Address)
	evm.StateDB.SetNonce(caller.Address, nonce+1)

	// Create new contract
	newContract := &Contract{
		CallerAddress: caller.Address,
		Address:       addr,
		Value:         value,
		Input:         []byte{},
		Code:          code,
		Gas:           caller.Gas / 64 * 63, // 63/64 of gas
	}

	// Execute init code
	evm.depth++
	result := evm.Execute(newContract)
	evm.depth--

	if result.Err != nil {
		return result
	}

	// Check code size
	if len(result.ReturnData) > MaxCodeSize {
		return &ExecutionResult{Err: ErrMaxCodeSizeExceeded}
	}

	// Store code
	evm.StateDB.SetCode(addr, result.ReturnData)

	return &ExecutionResult{ReturnData: addr[:], GasUsed: result.GasUsed}
}

// --- Call Operations ---

func (evm *EVM) opCall(stack *Stack, memory *Memory, contract *Contract) *ExecutionResult {
	gas, _ := stack.Pop()
	addr, _ := stack.Pop()
	value, _ := stack.Pop()
	inOffset, _ := stack.Pop()
	inSize, _ := stack.Pop()
	retOffset, _ := stack.Pop()
	retSize, _ := stack.Pop()

	toAddr := core.AddressFromBytes(addr.Bytes())
	input, _ := memory.Get(inOffset.Uint64(), inSize.Uint64())

	// Create call contract
	callContract := &Contract{
		CallerAddress: contract.Address,
		Address:       toAddr,
		Value:         value,
		Input:         input,
		Code:          evm.StateDB.GetCode(toAddr),
		Gas:           gas.Uint64(),
	}

	// Transfer value
	if value.Sign() > 0 {
		if !evm.StateDB.SubBalance(contract.Address, value) {
			return &ExecutionResult{Err: errors.New("insufficient balance")}
		}
		evm.StateDB.AddBalance(toAddr, value)
	}

	// Execute
	evm.depth++
	result := evm.Execute(callContract)
	evm.depth--

	// Copy return data to memory
	if len(result.ReturnData) > 0 {
		memory.Set(retOffset.Uint64(), retSize.Uint64(), result.ReturnData)
	}

	return result
}

func (evm *EVM) opCallCode(stack *Stack, memory *Memory, contract *Contract) *ExecutionResult {
	gas, _ := stack.Pop()
	addr, _ := stack.Pop()
	value, _ := stack.Pop()
	inOffset, _ := stack.Pop()
	inSize, _ := stack.Pop()
	retOffset, _ := stack.Pop()
	retSize, _ := stack.Pop()

	toAddr := core.AddressFromBytes(addr.Bytes())
	input, _ := memory.Get(inOffset.Uint64(), inSize.Uint64())

	// CALLCODE executes code in caller's context
	callContract := &Contract{
		CallerAddress: contract.CallerAddress,
		Address:       contract.Address, // Uses own address
		Value:         value,
		Input:         input,
		Code:          evm.StateDB.GetCode(toAddr), // But uses target's code
		Gas:           gas.Uint64(),
	}

	evm.depth++
	result := evm.Execute(callContract)
	evm.depth--

	if len(result.ReturnData) > 0 {
		memory.Set(retOffset.Uint64(), retSize.Uint64(), result.ReturnData)
	}

	return result
}

func (evm *EVM) opDelegateCall(stack *Stack, memory *Memory, contract *Contract) *ExecutionResult {
	gas, _ := stack.Pop()
	addr, _ := stack.Pop()
	inOffset, _ := stack.Pop()
	inSize, _ := stack.Pop()
	retOffset, _ := stack.Pop()
	retSize, _ := stack.Pop()

	toAddr := core.AddressFromBytes(addr.Bytes())
	input, _ := memory.Get(inOffset.Uint64(), inSize.Uint64())

	// DELEGATECALL preserves caller and value
	callContract := &Contract{
		CallerAddress: contract.CallerAddress,
		Address:       contract.Address,
		Value:         contract.Value,
		Input:         input,
		Code:          evm.StateDB.GetCode(toAddr),
		Gas:           gas.Uint64(),
	}

	evm.depth++
	result := evm.Execute(callContract)
	evm.depth--

	if len(result.ReturnData) > 0 {
		memory.Set(retOffset.Uint64(), retSize.Uint64(), result.ReturnData)
	}

	return result
}

func (evm *EVM) opStaticCall(stack *Stack, memory *Memory, contract *Contract) *ExecutionResult {
	gas, _ := stack.Pop()
	addr, _ := stack.Pop()
	inOffset, _ := stack.Pop()
	inSize, _ := stack.Pop()
	retOffset, _ := stack.Pop()
	retSize, _ := stack.Pop()

	toAddr := core.AddressFromBytes(addr.Bytes())
	input, _ := memory.Get(inOffset.Uint64(), inSize.Uint64())

	callContract := &Contract{
		CallerAddress: contract.Address,
		Address:       toAddr,
		Value:         big.NewInt(0),
		Input:         input,
		Code:          evm.StateDB.GetCode(toAddr),
		Gas:           gas.Uint64(),
	}

	// Set read-only mode
	prevReadOnly := evm.readOnly
	evm.readOnly = true

	evm.depth++
	result := evm.Execute(callContract)
	evm.depth--

	evm.readOnly = prevReadOnly

	if len(result.ReturnData) > 0 {
		memory.Set(retOffset.Uint64(), retSize.Uint64(), result.ReturnData)
	}

	return result
}

// --- Self Destruct ---

func (evm *EVM) opSelfDestruct(stack *Stack, contract *Contract) error {
	beneficiary, err := stack.Pop()
	if err != nil {
		return err
	}

	benefAddr := core.AddressFromBytes(beneficiary.Bytes())
	balance := evm.StateDB.GetBalance(contract.Address)

	// Transfer balance to beneficiary
	evm.StateDB.AddBalance(benefAddr, balance)
	evm.StateDB.SetBalance(contract.Address, big.NewInt(0))

	// Mark account as destroyed (simplified - just clear code)
	evm.StateDB.SetCode(contract.Address, nil)

	return nil
}

// --- Helper Functions ---

func createAddress(caller core.Address, nonce uint64) core.Address {
	data := append(caller[:], big.NewInt(int64(nonce)).Bytes()...)
	hash := wallet.Keccak256(data)
	return core.AddressFromBytes(hash[12:])
}

func create2Address(caller core.Address, salt []byte, code []byte) core.Address {
	// Create2: keccak256(0xff ++ address ++ salt ++ keccak256(init_code))
	codeHash := wallet.Keccak256(code)

	data := make([]byte, 1+20+32+32)
	data[0] = 0xff
	copy(data[1:], caller[:])
	copy(data[21:], salt)
	copy(data[53:], codeHash)

	hash := wallet.Keccak256(data)
	return core.AddressFromBytes(hash[12:])
}
