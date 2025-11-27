package api

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/executor"
)

// ValidatorAPI provides HTTP API for validator operations
// This handles the Bywise flow where validators execute EVM and generate ReadSet/WriteSet
type ValidatorAPI struct {
	validator   *executor.Validator
	miner       Miner
	broadcaster func(*core.Transaction)
}

// Miner interface for adding transactions to mempool
type Miner interface {
	AddPendingTransaction(tx *core.Transaction) error
}

// NewValidatorAPI creates a new validator API handler
func NewValidatorAPI(v *executor.Validator, m Miner) *ValidatorAPI {
	return &ValidatorAPI{
		validator: v,
		miner:     m,
	}
}

// SetTransactionBroadcaster sets the transaction broadcaster callback
func (v *ValidatorAPI) SetTransactionBroadcaster(broadcaster func(*core.Transaction)) {
	v.broadcaster = broadcaster
}

// RegisterRoutes registers validator routes on the given mux
func (v *ValidatorAPI) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/validator/info", v.handleValidatorInfo)
	mux.HandleFunc("/validator/execute", v.handleExecute)
	mux.HandleFunc("/validator/simulate", v.handleSimulate)
	mux.HandleFunc("/validator/sign", v.handleSignTransaction)
	mux.HandleFunc("/validator/proposal", v.handleProcessProposal)
	mux.HandleFunc("/validator/send", v.handleSendTransaction)
}

// RegisterRoutesWithAuth registers validator routes with authentication wrapper
func (v *ValidatorAPI) RegisterRoutesWithAuth(mux *http.ServeMux, withAuth AuthWrapper) {
	mux.HandleFunc("/validator/info", withAuth(v.handleValidatorInfo))
	mux.HandleFunc("/validator/execute", withAuth(v.handleExecute))
	mux.HandleFunc("/validator/simulate", withAuth(v.handleSimulate))
	mux.HandleFunc("/validator/sign", withAuth(v.handleSignTransaction))
	mux.HandleFunc("/validator/proposal", withAuth(v.handleProcessProposal))
	mux.HandleFunc("/validator/send", withAuth(v.handleSendTransaction))
}

// ValidatorInfoResponse contains validator information
type ValidatorInfoResponse struct {
	Address        string `json:"address"`
	IsValidator    bool   `json:"isValidator"`
	IsMiner        bool   `json:"isMiner"`
	ValidatorStake string `json:"validatorStake"`
	MinerStake     string `json:"minerStake"`
	TotalStake     string `json:"totalStake"`
	IsActive       bool   `json:"isActive"`
}

// handleValidatorInfo returns validator information
func (v *ValidatorAPI) handleValidatorInfo(w http.ResponseWriter, r *http.Request) {
	if v.validator == nil {
		http.Error(w, "Validator not enabled", http.StatusNotFound)
		return
	}

	info, err := v.validator.GetStakeInfo()
	if err != nil {
		http.Error(w, "Failed to get validator info", http.StatusInternalServerError)
		return
	}

	response := ValidatorInfoResponse{
		Address:        v.validator.GetAddress().Hex(),
		IsValidator:    info.IsValidator,
		IsMiner:        info.IsMiner,
		ValidatorStake: info.GetValidatorStake().String(),
		MinerStake:     info.GetMinerStake().String(),
		TotalStake:     info.TotalStake().String(),
		IsActive:       info.IsActive,
	}

	v.jsonResponse(w, response)
}

// ExecuteRequest represents a transaction execution request
type ExecuteRequest struct {
	From  string `json:"from"`  // Sender address
	To    string `json:"to"`    // Recipient (empty for contract creation)
	Value string `json:"value"` // Amount to transfer
	Data  string `json:"data"`  // Hex-encoded calldata or init code
}

// ExecuteResponse represents the execution result
type ExecuteResponse struct {
	Success      bool              `json:"success"`
	ReadSet      map[string]string `json:"readSet"`              // Hex-encoded key -> value read (for stateless validation)
	WriteSet     map[string]string `json:"writeSet"`             // Hex-encoded key -> value written
	ReturnData   string            `json:"returnData,omitempty"` // Hex-encoded return data
	GasUsed      uint64            `json:"gasUsed"`
	ContractAddr string            `json:"contractAddr,omitempty"` // Set if contract was created
	Error        string            `json:"error,omitempty"`
	Reverted     bool              `json:"reverted"`
}

// handleExecute executes a transaction and returns ReadSet/WriteSet
// This is the core Bywise validator function
func (v *ValidatorAPI) handleExecute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if v.validator == nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   "validator not enabled",
		})
		return
	}

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var req ExecuteRequest
	if err := json.Unmarshal(body, &req); err != nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   "invalid JSON: " + err.Error(),
		})
		return
	}

	// Parse the request into ExecutionRequest
	execReq, err := v.parseExecuteRequest(&req)
	if err != nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Execute the transaction
	result := v.validator.Execute(execReq)

	// Build response
	response := v.buildExecuteResponse(result)
	v.jsonResponse(w, response)
}

// handleSimulate simulates a transaction without signing
func (v *ValidatorAPI) handleSimulate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if v.validator == nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   "validator not enabled",
		})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var req ExecuteRequest
	if err := json.Unmarshal(body, &req); err != nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   "invalid JSON: " + err.Error(),
		})
		return
	}

	execReq, err := v.parseExecuteRequest(&req)
	if err != nil {
		v.jsonResponse(w, ExecuteResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Simulate the transaction
	result := v.validator.SimulateTransaction(execReq)

	response := v.buildExecuteResponse(result)
	v.jsonResponse(w, response)
}

// SignTransactionRequest represents a request to sign a transaction
type SignTransactionRequest struct {
	From       string            `json:"from"`
	To         string            `json:"to"`
	Value      string            `json:"value"`
	Data       string            `json:"data"`
	SequenceID uint64            `json:"sequenceId"`
	ReadSet    map[string]string `json:"readSet"`  // key -> hex value
	WriteSet   map[string]string `json:"writeSet"` // key -> hex value
}

// SignTransactionResponse represents the signed transaction
type SignTransactionResponse struct {
	Success      bool   `json:"success"`
	Validator    string `json:"validator,omitempty"`
	ValidatorSig string `json:"validatorSig,omitempty"`
	TxHash       string `json:"txHash,omitempty"`
	Error        string `json:"error,omitempty"`
}

// handleSignTransaction signs a transaction as the validator
// Called after user reviews the execution result
func (v *ValidatorAPI) handleSignTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if v.validator == nil {
		v.jsonResponse(w, SignTransactionResponse{
			Success: false,
			Error:   "validator not enabled",
		})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		v.jsonResponse(w, SignTransactionResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var req SignTransactionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		v.jsonResponse(w, SignTransactionResponse{
			Success: false,
			Error:   "invalid JSON: " + err.Error(),
		})
		return
	}

	// Parse addresses
	from, err := core.AddressFromHex(req.From)
	if err != nil {
		v.jsonResponse(w, SignTransactionResponse{
			Success: false,
			Error:   "invalid from address: " + err.Error(),
		})
		return
	}

	to, err := core.AddressFromHex(req.To)
	if err != nil {
		v.jsonResponse(w, SignTransactionResponse{
			Success: false,
			Error:   "invalid to address: " + err.Error(),
		})
		return
	}

	// Parse value
	value := core.NewBigInt(0)
	if req.Value != "" {
		var ok bool
		value, ok = core.NewBigIntFromString(req.Value, 10)
		if !ok {
			v.jsonResponse(w, SignTransactionResponse{
				Success: false,
				Error:   "invalid value",
			})
			return
		}
	}

	// Parse data
	var data []byte
	if req.Data != "" {
		data, err = hex.DecodeString(req.Data)
		if err != nil {
			v.jsonResponse(w, SignTransactionResponse{
				Success: false,
				Error:   "invalid data hex: " + err.Error(),
			})
			return
		}
	}

	// Parse ReadSet (now map[string]string with key -> value)
	readSet := make(map[string][]byte)
	for keyHex, valueHex := range req.ReadSet {
		keyBytes, err := hex.DecodeString(keyHex)
		if err != nil {
			v.jsonResponse(w, SignTransactionResponse{
				Success: false,
				Error:   "invalid readSet key hex: " + err.Error(),
			})
			return
		}
		valueBytes, err := hex.DecodeString(valueHex)
		if err != nil {
			v.jsonResponse(w, SignTransactionResponse{
				Success: false,
				Error:   "invalid readSet value hex: " + err.Error(),
			})
			return
		}
		readSet[string(keyBytes)] = valueBytes
	}

	// Parse WriteSet
	writeSet := make(map[string][]byte)
	for keyHex, valueHex := range req.WriteSet {
		keyBytes, err := hex.DecodeString(keyHex)
		if err != nil {
			v.jsonResponse(w, SignTransactionResponse{
				Success: false,
				Error:   "invalid writeSet key hex: " + err.Error(),
			})
			return
		}
		valueBytes, err := hex.DecodeString(valueHex)
		if err != nil {
			v.jsonResponse(w, SignTransactionResponse{
				Success: false,
				Error:   "invalid writeSet value hex: " + err.Error(),
			})
			return
		}
		writeSet[string(keyBytes)] = valueBytes
	}

	// Build execution request
	execReq := &executor.ExecutionRequest{
		From:  from,
		To:    to,
		Value: value.Int,
		Data:  data,
	}

	// Build execution response (from request data)
	execResp := &executor.ExecutionResponse{
		ReadSet:  readSet,
		WriteSet: writeSet,
	}

	// Sign the transaction
	tx, err := v.validator.ValidateAndSign(execReq, execResp, req.SequenceID)
	if err != nil {
		v.jsonResponse(w, SignTransactionResponse{
			Success: false,
			Error:   "failed to sign transaction: " + err.Error(),
		})
		return
	}

	response := SignTransactionResponse{
		Success:      true,
		Validator:    tx.Validator.Hex(),
		ValidatorSig: hex.EncodeToString(tx.ValidatorSig),
		TxHash:       hex.EncodeToString(tx.HashForValidatorSigning()),
	}

	v.jsonResponse(w, response)
}

// parseExecuteRequest parses an ExecuteRequest into an executor.ExecutionRequest
func (v *ValidatorAPI) parseExecuteRequest(req *ExecuteRequest) (*executor.ExecutionRequest, error) {
	if req.From == "" {
		return nil, fmt.Errorf("from address is required")
	}

	from, err := core.AddressFromHex(req.From)
	if err != nil {
		return nil, fmt.Errorf("invalid from address: %w", err)
	}

	var to core.Address
	if req.To != "" {
		to, err = core.AddressFromHex(req.To)
		if err != nil {
			return nil, fmt.Errorf("invalid to address: %w", err)
		}
	}

	value := core.NewBigInt(0)
	if req.Value != "" {
		var ok bool
		value, ok = core.NewBigIntFromString(req.Value, 10)
		if !ok {
			return nil, fmt.Errorf("invalid value format")
		}
	}

	var data []byte
	if req.Data != "" {
		data, err = hex.DecodeString(req.Data)
		if err != nil {
			return nil, fmt.Errorf("invalid data hex: %w", err)
		}
	}

	return &executor.ExecutionRequest{
		From:  from,
		To:    to,
		Value: value.Int,
		Data:  data,
	}, nil
}

// buildExecuteResponse builds an ExecuteResponse from executor.ExecutionResponse
func (v *ValidatorAPI) buildExecuteResponse(result *executor.ExecutionResponse) ExecuteResponse {
	response := ExecuteResponse{
		Success:  result.Error == nil && !result.Reverted,
		GasUsed:  result.GasUsed,
		Reverted: result.Reverted,
	}

	if result.Error != nil {
		response.Error = result.Error.Error()
	}

	// Encode ReadSet (now map[string][]byte with values)
	response.ReadSet = make(map[string]string)
	for key, value := range result.ReadSet {
		response.ReadSet[hex.EncodeToString([]byte(key))] = hex.EncodeToString(value)
	}

	// Encode WriteSet
	response.WriteSet = make(map[string]string)
	for key, value := range result.WriteSet {
		response.WriteSet[hex.EncodeToString([]byte(key))] = hex.EncodeToString(value)
	}

	// Encode ReturnData
	if len(result.ReturnData) > 0 {
		response.ReturnData = hex.EncodeToString(result.ReturnData)
	}

	// Contract address if created
	if !result.ContractAddr.IsEmpty() {
		response.ContractAddr = result.ContractAddr.Hex()
	}

	return response
}

// jsonResponse writes a JSON response
func (v *ValidatorAPI) jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// ProcessProposalRequest represents a user-signed proposal for the validator to process
type ProcessProposalRequest struct {
	From       string `json:"from"`       // User's address
	To         string `json:"to"`         // Recipient (empty for contract creation)
	Value      string `json:"value"`      // Amount to transfer
	Nonce      string `json:"nonce"`      // User's nonce for replay protection
	BlockLimit uint64 `json:"blockLimit"` // Optional block limit (0 = no limit)
	Data       string `json:"data"`       // Hex-encoded calldata
	UserSig    string `json:"userSig"`    // User's signature on the proposal
}

// ProcessProposalResponse represents the result of processing a proposal
type ProcessProposalResponse struct {
	Success      bool              `json:"success"`
	TxID         string            `json:"txId,omitempty"`
	Validator    string            `json:"validator,omitempty"`
	ValidatorSig string            `json:"validatorSig,omitempty"`
	SequenceID   uint64            `json:"sequenceId,omitempty"`
	ReadSet      map[string]string `json:"readSet,omitempty"`
	WriteSet     map[string]string `json:"writeSet,omitempty"`
	ContractAddr string            `json:"contractAddr,omitempty"`
	Error        string            `json:"error,omitempty"`
}

// handleProcessProposal processes a user-signed proposal through the validator
// This is the proper 2-step flow:
// 1. User signs proposal and sends to validator
// 2. Validator executes, fills ReadSet/WriteSet, signs, and returns fully signed transaction
func (v *ValidatorAPI) handleProcessProposal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if v.validator == nil {
		v.jsonResponse(w, ProcessProposalResponse{
			Success: false,
			Error:   "validator not enabled",
		})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		v.jsonResponse(w, ProcessProposalResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var req ProcessProposalRequest
	if err := json.Unmarshal(body, &req); err != nil {
		v.jsonResponse(w, ProcessProposalResponse{
			Success: false,
			Error:   "invalid JSON: " + err.Error(),
		})
		return
	}

	// Parse from address
	from, err := core.AddressFromHex(req.From)
	if err != nil {
		v.jsonResponse(w, ProcessProposalResponse{
			Success: false,
			Error:   "invalid from address: " + err.Error(),
		})
		return
	}

	// Parse to address (empty for contract creation)
	var to core.Address
	if req.To != "" {
		to, err = core.AddressFromHex(req.To)
		if err != nil {
			v.jsonResponse(w, ProcessProposalResponse{
				Success: false,
				Error:   "invalid to address: " + err.Error(),
			})
			return
		}
	}

	// Parse value
	value := core.NewBigInt(0)
	if req.Value != "" {
		var ok bool
		value, ok = core.NewBigIntFromString(req.Value, 10)
		if !ok {
			v.jsonResponse(w, ProcessProposalResponse{
				Success: false,
				Error:   "invalid value",
			})
			return
		}
	}

	// Parse nonce
	nonce := core.NewBigInt(0)
	if req.Nonce != "" {
		var ok bool
		nonce, ok = core.NewBigIntFromString(req.Nonce, 10)
		if !ok {
			v.jsonResponse(w, ProcessProposalResponse{
				Success: false,
				Error:   "invalid nonce",
			})
			return
		}
	}

	// Parse data
	var data []byte
	if req.Data != "" {
		data, err = hex.DecodeString(req.Data)
		if err != nil {
			v.jsonResponse(w, ProcessProposalResponse{
				Success: false,
				Error:   "invalid data hex: " + err.Error(),
			})
			return
		}
	}

	// Parse user signature
	userSig, err := hex.DecodeString(req.UserSig)
	if err != nil {
		v.jsonResponse(w, ProcessProposalResponse{
			Success: false,
			Error:   "invalid userSig hex: " + err.Error(),
		})
		return
	}

	// Build the proposal
	proposal := &executor.TransactionProposal{
		Validator:  v.validator.GetAddress(),
		From:       from,
		To:         to,
		Value:      value.Int,
		Nonce:      nonce.Int,
		BlockLimit: req.BlockLimit,
		Data:       data,
		UserSig:    userSig,
	}

	// Use a simple incrementing sequence ID based on timestamp
	// In production this would come from consensus or ordered mempool
	sequenceID := uint64(1)

	// Process the proposal
	tx, err := v.validator.ProcessProposal(proposal, sequenceID)
	if err != nil {
		v.jsonResponse(w, ProcessProposalResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	// Build response with ReadSet/WriteSet
	// Both keys AND values are hex-encoded to avoid JSON encoding issues with binary data
	readSetHex := make(map[string]string)
	for k, val := range tx.ReadSet {
		keyHex := hex.EncodeToString([]byte(k))
		readSetHex[keyHex] = hex.EncodeToString(val)
	}

	writeSetHex := make(map[string]string)
	for k, val := range tx.WriteSet {
		keyHex := hex.EncodeToString([]byte(k))
		writeSetHex[keyHex] = hex.EncodeToString(val)
	}

	response := ProcessProposalResponse{
		Success:      true,
		TxID:         tx.ID.Hex(),
		Validator:    tx.Validator.Hex(),
		ValidatorSig: hex.EncodeToString(tx.ValidatorSig),
		SequenceID:   tx.SequenceID,
		ReadSet:      readSetHex,
		WriteSet:     writeSetHex,
	}

	v.jsonResponse(w, response)
}

// SendTransactionRequest represents a simple send request from the node's wallet
type SendTransactionRequest struct {
	To    string `json:"to"`    // Recipient address
	Value string `json:"value"` // Amount to transfer
	Data  string `json:"data"`  // Optional hex-encoded data
}

// SendTransactionResponse represents the result of sending a transaction
type SendTransactionResponse struct {
	Success bool   `json:"success"`
	TxID    string `json:"txId,omitempty"`
	Error   string `json:"error,omitempty"`
}

// handleSendTransaction handles a simplified send transaction flow
// This endpoint executes, signs with the node's wallet, and submits in one call
func (v *ValidatorAPI) handleSendTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if v.validator == nil {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "this node doesn't have validator capabilities (no stake) - to send transactions, you need to either: 1) Add stake to this node to enable validator role, or 2) Use a node that has validator stake enabled",
		})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var req SendTransactionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "invalid JSON: " + err.Error(),
		})
		return
	}

	// Parse to address
	to, err := core.AddressFromHex(req.To)
	if err != nil {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "invalid to address: " + err.Error(),
		})
		return
	}

	// Parse value
	value := core.NewBigInt(0)
	if req.Value != "" {
		var ok bool
		value, ok = core.NewBigIntFromString(req.Value, 10)
		if !ok {
			v.jsonResponse(w, SendTransactionResponse{
				Success: false,
				Error:   "invalid value",
			})
			return
		}
	}

	// Parse data
	var data []byte
	if req.Data != "" {
		data, err = hex.DecodeString(req.Data)
		if err != nil {
			v.jsonResponse(w, SendTransactionResponse{
				Success: false,
				Error:   "invalid data hex: " + err.Error(),
			})
			return
		}
	}

	// Create execution request
	from := v.validator.GetAddress()
	execReq := &executor.ExecutionRequest{
		From:  from,
		To:    to,
		Value: value.Int,
		Data:  data,
	}

	// Execute to get ReadSet/WriteSet
	result := v.validator.Execute(execReq)
	if result.Error != nil {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "execution failed: " + result.Error.Error(),
		})
		return
	}

	if result.Reverted {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "execution reverted",
		})
		return
	}

	// Get account nonce
	account, err := v.validator.GetStorage().GetAccount(from)
	if err != nil {
		// Account might not exist yet, use nonce 0
		account = &core.Account{
			Address: from,
			Balance: core.NewBigInt(0),
			Nonce:   0,
		}
	}

	nonce := core.NewBigInt(int64(account.Nonce))

	// Create transaction proposal
	tx := core.NewTransactionProposal(
		from,      // Validator
		from,      // From (same as validator for self-send)
		to,        // To
		value,     // Value
		nonce,     // Nonce
		0,         // BlockLimit (0 = no limit)
		data,      // Data
	)

	// Sign as user (using the node's wallet)
	if err := tx.SignAsUser(v.validator.GetWallet()); err != nil {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "failed to sign as user: " + err.Error(),
		})
		return
	}

	// Create proposal with user signature
	proposal := &executor.TransactionProposal{
		Validator:  from,
		From:       from,
		To:         to,
		Value:      value.Int,
		Nonce:      nonce.Int,
		BlockLimit: 0,
		Data:       data,
		UserSig:    tx.UserSig,
	}

	// Use timestamp-based sequence ID
	sequenceID := uint64(1)

	// Process the proposal (this will execute, verify, and sign as validator)
	signedTx, err := v.validator.ProcessProposal(proposal, sequenceID)
	if err != nil {
		v.jsonResponse(w, SendTransactionResponse{
			Success: false,
			Error:   "failed to process proposal: " + err.Error(),
		})
		return
	}

	// Add to pending pool (mempool) first
	if v.miner != nil {
		if err := v.miner.AddPendingTransaction(signedTx); err != nil {
			v.jsonResponse(w, SendTransactionResponse{
				Success: false,
				Error:   "failed to add to mempool: " + err.Error(),
			})
			return
		}
	}

	// Then broadcast to network
	if v.broadcaster != nil {
		v.broadcaster(signedTx)
	}

	v.jsonResponse(w, SendTransactionResponse{
		Success: true,
		TxID:    signedTx.ID.Hex(),
	})
}

// jsonResponse writes a JSON response
