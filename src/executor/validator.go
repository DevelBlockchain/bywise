package executor

import (
	"errors"
	"math/big"
	"sync"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

var (
	ErrInsufficientBalance = errors.New("insufficient balance")
	ErrInvalidTransaction  = errors.New("invalid transaction")
	ErrContractExecution   = errors.New("contract execution failed")
)

// Validator handles transaction validation and execution
// According to Bywise protocol, validators execute EVM and generate ReadSet/WriteSet
type Validator struct {
	storage *storage.Storage
	wallet  *wallet.Wallet
	address core.Address
	mu      sync.Mutex

	// Chain configuration
	chainID *big.Int
}

// NewValidator creates a new validator instance
func NewValidator(store *storage.Storage, w *wallet.Wallet, chainID uint64) (*Validator, error) {
	addr, err := core.AddressFromHex(w.Address())
	if err != nil {
		return nil, err
	}

	return &Validator{
		storage: store,
		wallet:  w,
		address: addr,
		chainID: big.NewInt(int64(chainID)),
	}, nil
}

// TransactionProposal contains the user's signed transaction proposal
// This is the input for the new 2-step flow where user signs first
type TransactionProposal struct {
	TxType     uint8        // Transaction type (0 = transfer, 1 = contract call, etc)
	Validator  core.Address // Validator chosen to process
	From       core.Address
	To         core.Address // Empty for contract creation
	Value      *big.Int
	Nonce      *big.Int
	BlockLimit uint64 // Transaction expires after this block (0 = no limit)
	Data       []byte // EVM calldata or init code for contract creation
	UserSig    []byte // User's signature on the proposal
}

// ExecutionRequest contains the user's transaction intent (legacy/internal use)
type ExecutionRequest struct {
	From  core.Address
	To    core.Address // Empty for contract creation
	Value *big.Int
	Data  []byte // EVM calldata or init code for contract creation
}

// ExecutionResponse contains the execution result with ReadSet/WriteSet
type ExecutionResponse struct {
	ReadSet      map[string][]byte // Now includes values for stateless validation
	WriteSet     map[string][]byte
	ReturnData   []byte
	GasUsed      uint64
	ContractAddr core.Address // Set if this was a contract creation
	Error        error
	Reverted     bool
}

// Execute simulates the transaction and returns the execution evidence
// This is the core function according to Bywise protocol:
// 1. Validator receives user intent
// 2. Executes EVM in-memory
// 3. Generates ReadSet and WriteSet
// 4. Returns result for user to sign
func (v *Validator) Execute(req *ExecutionRequest) *ExecutionResponse {
	v.mu.Lock()
	defer v.mu.Unlock()

	// Create state wrapper to track reads/writes
	stateDB := NewStateDB(v.storage)

	// Build execution context
	latestBlock, err := v.storage.GetLatestBlock()
	blockNum := big.NewInt(0)
	blockTime := big.NewInt(0)
	coinbase := core.Address{}

	if err == nil && latestBlock != nil {
		blockNum = big.NewInt(int64(latestBlock.Header.Number + 1))
		blockTime = big.NewInt(latestBlock.Header.Timestamp)
		coinbase = latestBlock.Header.MinerAddress
	}

	ctx := &Context{
		Origin:      req.From,
		GasPrice:    big.NewInt(1), // Bywise doesn't use gas pricing
		Coinbase:    coinbase,
		GasLimit:    DefaultGasLimit,
		BlockNumber: blockNum,
		Time:        blockTime,
		Difficulty:  big.NewInt(1),
		ChainID:     v.chainID,
	}

	// Create EVM instance
	evm := NewEVM(ctx, stateDB)

	// Determine if this is a contract creation or call
	var result *ExecutionResult
	var contractAddr core.Address

	if req.To.IsEmpty() {
		// Contract creation
		result, contractAddr = v.executeCreate(evm, stateDB, req)
	} else {
		// Contract call or simple transfer
		result = v.executeCall(evm, stateDB, req)
	}

	// Build response with ReadSet/WriteSet
	response := &ExecutionResponse{
		ReadSet:      stateDB.GetReadSet(),
		WriteSet:     stateDB.GetWriteSet(),
		ReturnData:   result.ReturnData,
		GasUsed:      result.GasUsed,
		ContractAddr: contractAddr,
		Error:        result.Err,
		Reverted:     result.Reverted,
	}

	return response
}

// executeCreate handles contract creation
func (v *Validator) executeCreate(evm *EVM, stateDB *StateDB, req *ExecutionRequest) (*ExecutionResult, core.Address) {
	return v.executeCreateWithEVM(evm, stateDB, req.From, req.To, req.Value, req.Data)
}

// executeCreateWithEVM handles contract creation with explicit parameters
func (v *Validator) executeCreateWithEVM(evm *EVM, stateDB *StateDB, from, to core.Address, value *big.Int, data []byte) (*ExecutionResult, core.Address) {
	// Check sender balance
	senderBalance := stateDB.GetBalance(from)
	if value != nil && senderBalance.Cmp(value) < 0 {
		return &ExecutionResult{Err: ErrInsufficientBalance}, core.Address{}
	}

	// Calculate new contract address
	nonce := stateDB.GetNonce(from)
	contractAddr := createAddress(from, nonce)

	// Increment sender nonce
	stateDB.SetNonce(from, nonce+1)

	// Transfer value
	if value != nil && value.Sign() > 0 {
		stateDB.SubBalance(from, value)
		stateDB.AddBalance(contractAddr, value)
	}

	// Create contract
	contract := &Contract{
		CallerAddress: from,
		Address:       contractAddr,
		Value:         value,
		Input:         []byte{},
		Code:          data, // Init code
		Gas:           DefaultGasLimit,
	}

	// Execute init code
	result := evm.Execute(contract)

	if result.Err == nil && !result.Reverted {
		// Check code size
		if len(result.ReturnData) > MaxCodeSize {
			return &ExecutionResult{Err: ErrMaxCodeSizeExceeded}, core.Address{}
		}

		// Store contract code
		stateDB.SetCode(contractAddr, result.ReturnData)

		// Return contract address as return data
		result.ReturnData = contractAddr[:]
	}

	return result, contractAddr
}

// executeCall handles contract calls and simple transfers
func (v *Validator) executeCall(evm *EVM, stateDB *StateDB, req *ExecutionRequest) *ExecutionResult {
	return v.executeCallWithEVM(evm, stateDB, req.From, req.To, req.Value, req.Data)
}

// executeCallWithEVM handles contract calls and simple transfers with explicit parameters
func (v *Validator) executeCallWithEVM(evm *EVM, stateDB *StateDB, from, to core.Address, value *big.Int, data []byte) *ExecutionResult {
	// Check sender balance for value transfer
	if value != nil && value.Sign() > 0 {
		senderBalance := stateDB.GetBalance(from)
		if senderBalance.Cmp(value) < 0 {
			return &ExecutionResult{Err: ErrInsufficientBalance}
		}
	}

	// Increment sender nonce
	nonce := stateDB.GetNonce(from)
	stateDB.SetNonce(from, nonce+1)

	// Transfer value
	if value != nil && value.Sign() > 0 {
		stateDB.SubBalance(from, value)
		stateDB.AddBalance(to, value)
	}

	// Check if target has code
	code := stateDB.GetCode(to)
	if len(code) == 0 {
		// Simple value transfer, no code to execute
		return &ExecutionResult{GasUsed: 21000}
	}

	// Execute contract call
	contract := &Contract{
		CallerAddress: from,
		Address:       to,
		Value:         value,
		Input:         data,
		Code:          code,
		Gas:           DefaultGasLimit,
	}

	return evm.Execute(contract)
}

// ProcessProposal processes a user's signed proposal and returns a fully signed transaction.
// This is the new 2-step flow:
// 1. User signs proposal and sends to validator
// 2. Validator executes, fills ReadSet/WriteSet, signs, and propagates
// If the transaction fails execution, it returns an error and the proposal is discarded.
func (v *Validator) ProcessProposal(proposal *core.TransactionProposal, sequenceID uint64) (*core.Transaction, error) {
	// Create transaction from proposal
	tx := core.NewTransactionProposal(
		proposal.TxType,
		proposal.Validator,
		proposal.From,
		proposal.To,
		proposal.Value,
		proposal.Nonce,
		proposal.BlockLimit,
		proposal.Data,
	)
	tx.UserSig = proposal.UserSig

	// Verify the user signature matches the proposal
	if !tx.VerifyUserSignature() {
		return nil, errors.New("invalid user signature on proposal")
	}

	// Verify this validator is the one specified in the proposal
	if proposal.Validator != v.address {
		return nil, errors.New("proposal specifies a different validator")
	}

	// Execute the transaction
	req := &ExecutionRequest{
		From:  proposal.From,
		To:    proposal.To,
		Value: proposal.Value.Int,
		Data:  proposal.Data,
	}

	resp := v.Execute(req)

	// If execution fails, discard the proposal by returning an error
	if resp.Error != nil {
		return nil, resp.Error
	}

	// If transaction was reverted, discard it
	if resp.Reverted {
		return nil, errors.New("transaction reverted")
	}

	// Set execution evidence
	tx.SetExecutionEvidence(sequenceID, resp.ReadSet, resp.WriteSet)

	// Sign as validator (this also computes the transaction ID)
	if err := tx.SignAsValidator(v.wallet); err != nil {
		return nil, err
	}

	return tx, nil
}

// ValidateAndSign validates execution and signs the transaction as validator
// Deprecated: Use ProcessProposal for the new 2-step flow
func (v *Validator) ValidateAndSign(
	req *ExecutionRequest,
	resp *ExecutionResponse,
	sequenceID uint64,
) (*core.Transaction, error) {
	if resp.Error != nil {
		return nil, resp.Error
	}

	// Create transaction with execution evidence (legacy mode without validator field)
	tx := core.NewTransaction(req.From, req.To, core.BigIntFromBytes(req.Value.Bytes()), req.Data)
	tx.Validator = v.address // Set validator for the new flow
	tx.SetExecutionEvidence(sequenceID, resp.ReadSet, resp.WriteSet)

	// Sign as validator
	if err := tx.SignAsValidator(v.wallet); err != nil {
		return nil, err
	}

	return tx, nil
}

// SimulateTransaction simulates a transaction without signing
// Useful for gas estimation and checking if transaction would succeed
func (v *Validator) SimulateTransaction(req *ExecutionRequest) *ExecutionResponse {
	return v.Execute(req)
}

// VerifyExecution re-executes a transaction to verify ReadSet/WriteSet
// Used for fraud detection - this is stateless validation
func (v *Validator) VerifyExecution(tx *core.Transaction) (bool, error) {
	// Re-execute the transaction
	req := &ExecutionRequest{
		From:  tx.From,
		To:    tx.To,
		Value: tx.Value.Int,
		Data:  tx.Data,
	}

	resp := v.Execute(req)

	if resp.Error != nil {
		return false, resp.Error
	}

	// Compare ReadSet (now both are map[string][]byte)
	if len(resp.ReadSet) != len(tx.ReadSet) {
		return false, nil
	}
	for k, respVal := range resp.ReadSet {
		txVal, ok := tx.ReadSet[k]
		if !ok {
			return false, nil
		}
		if !bytesEqual(respVal, txVal) {
			return false, nil
		}
	}

	// Compare WriteSet
	if len(resp.WriteSet) != len(tx.WriteSet) {
		return false, nil
	}
	for k, respVal := range resp.WriteSet {
		txVal, ok := tx.WriteSet[k]
		if !ok {
			return false, nil
		}
		if !bytesEqual(respVal, txVal) {
			return false, nil
		}
	}

	return true, nil
}

// VerifyExecutionStateless verifies a transaction using only its embedded ReadSet values.
// This is the core stateless validation - can be run in parallel without state access.
func (v *Validator) VerifyExecutionStateless(tx *core.Transaction) (bool, error) {
	// Create a state DB that uses the transaction's ReadSet as the data source
	stateDB := NewStateDBFromReadSet(tx.ReadSet)

	// Build execution context
	ctx := &Context{
		Origin:      tx.From,
		GasPrice:    big.NewInt(1),
		Coinbase:    core.Address{},
		GasLimit:    DefaultGasLimit,
		BlockNumber: big.NewInt(0),
		Time:        big.NewInt(0),
		Difficulty:  big.NewInt(1),
		ChainID:     v.chainID,
	}

	// Create EVM instance
	evm := NewEVM(ctx, stateDB)

	// Execute based on transaction type
	var result *ExecutionResult
	if tx.To.IsEmpty() {
		// Contract creation
		result, _ = v.executeCreateWithEVM(evm, stateDB, tx.From, tx.To, tx.Value.Int, tx.Data)
	} else {
		// Contract call or transfer
		result = v.executeCallWithEVM(evm, stateDB, tx.From, tx.To, tx.Value.Int, tx.Data)
	}

	if result.Err != nil {
		return false, result.Err
	}

	// Compare computed WriteSet with transaction's WriteSet
	computedWriteSet := stateDB.GetWriteSet()
	if len(computedWriteSet) != len(tx.WriteSet) {
		return false, nil
	}
	for k, computedVal := range computedWriteSet {
		txVal, ok := tx.WriteSet[k]
		if !ok {
			return false, nil
		}
		if !bytesEqual(computedVal, txVal) {
			return false, nil
		}
	}

	return true, nil
}

// bytesEqual compares two byte slices
func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// GetAddress returns the validator's address
func (v *Validator) GetAddress() core.Address {
	return v.address
}

// GetStorage returns the validator's storage instance
func (v *Validator) GetStorage() *storage.Storage {
	return v.storage
}

// GetWallet returns the validator's wallet instance
func (v *Validator) GetWallet() *wallet.Wallet {
	return v.wallet
}

// ProcessProposalsFromMempool processes proposals addressed to this validator from the mempool.
// Returns successfully processed transactions and a list of proposals to remove.
// This should be called periodically by validators to process pending proposals.
func (v *Validator) ProcessProposalsFromMempool(
	proposals []*core.TransactionProposal,
	onTransactionSigned func(*core.Transaction),
) {
	v.mu.Lock()
	defer v.mu.Unlock()

	sequenceID := uint64(0) // TODO: implement proper sequence tracking

	for _, proposal := range proposals {
		// Only process proposals addressed to this validator
		if proposal.Validator != v.address {
			continue
		}

		// Process the proposal
		tx, err := v.ProcessProposal(proposal, sequenceID)
		if err != nil {
			// Proposal failed execution - it will be discarded
			// Log but don't propagate failed transactions
			continue
		}

		// Successfully signed transaction - call callback to broadcast it
		if onTransactionSigned != nil {
			onTransactionSigned(tx)
		}

		sequenceID++
	}
}
