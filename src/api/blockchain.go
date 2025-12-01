package api

import (
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/miner"
	"github.com/bywise/go-bywise/src/storage"
)

// TransactionBroadcaster is a callback for broadcasting transactions to the network
type TransactionBroadcaster func(tx *core.Transaction)

// BlockchainAPI provides HTTP API for blockchain operations
type BlockchainAPI struct {
	storage     *storage.Storage
	miner       *miner.Miner
	broadcaster TransactionBroadcaster
}

// NewBlockchainAPI creates a new blockchain API handler
func NewBlockchainAPI(store *storage.Storage, m *miner.Miner) *BlockchainAPI {
	return &BlockchainAPI{
		storage: store,
		miner:   m,
	}
}

// SetBroadcaster sets the transaction broadcaster callback
func (b *BlockchainAPI) SetBroadcaster(broadcaster TransactionBroadcaster) {
	b.broadcaster = broadcaster
}

// RegisterRoutes registers blockchain routes on the given mux
func (b *BlockchainAPI) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/blockchain/info", b.handleBlockchainInfo)
	mux.HandleFunc("/blockchain/block", b.handleGetBlock)
	mux.HandleFunc("/blockchain/blocks", b.handleGetBlocks)
	mux.HandleFunc("/blockchain/tx", b.handleGetTransaction)
	mux.HandleFunc("/blockchain/tx/proposal", b.handleSubmitProposal)
	mux.HandleFunc("/blockchain/tx/submit", b.handleSubmitTransaction)
	mux.HandleFunc("/blockchain/account", b.handleGetAccount)
	mux.HandleFunc("/miner/info", b.handleMinerInfo)
	mux.HandleFunc("/miner/pending", b.handlePendingTransactions)
	mux.HandleFunc("/miner/proposals", b.handlePendingProposals)
}

// RegisterRoutesWithAuth registers blockchain routes with authentication wrapper
func (b *BlockchainAPI) RegisterRoutesWithAuth(mux *http.ServeMux, withAuth AuthWrapper) {
	mux.HandleFunc("/blockchain/info", withAuth(b.handleBlockchainInfo))
	mux.HandleFunc("/blockchain/block", withAuth(b.handleGetBlock))
	mux.HandleFunc("/blockchain/blocks", withAuth(b.handleGetBlocks))
	mux.HandleFunc("/blockchain/tx", withAuth(b.handleGetTransaction))
	mux.HandleFunc("/blockchain/tx/proposal", withAuth(b.handleSubmitProposal))
	mux.HandleFunc("/blockchain/tx/submit", withAuth(b.handleSubmitTransaction))
	mux.HandleFunc("/blockchain/account", withAuth(b.handleGetAccount))
	mux.HandleFunc("/miner/info", withAuth(b.handleMinerInfo))
	mux.HandleFunc("/miner/pending", withAuth(b.handlePendingTransactions))
	mux.HandleFunc("/miner/proposals", withAuth(b.handlePendingProposals))
}

// BlockchainInfoResponse contains blockchain status information
type BlockchainInfoResponse struct {
	LatestBlock uint64 `json:"latestBlock"`
}

// handleBlockchainInfo returns blockchain status
func (b *BlockchainAPI) handleBlockchainInfo(w http.ResponseWriter, r *http.Request) {
	latestBlock, err := b.storage.GetLatestBlockNumber()
	if err != nil {
		latestBlock = 0
	}

	response := BlockchainInfoResponse{
		LatestBlock: latestBlock,
	}

	b.jsonResponse(w, response)
}

// BlockResponse contains block information
type BlockResponse struct {
	Number           uint64   `json:"number"`
	Hash             string   `json:"hash"`
	PreviousHash     string   `json:"previousHash"`
	Timestamp        int64    `json:"timestamp"`
	MinerAddress     string   `json:"minerAddress"`
	TxRoot           string   `json:"txRoot"`
	StateRoot        string   `json:"stateRoot"`
	TransactionCount int      `json:"transactionCount"`
	Transactions     []string `json:"transactions,omitempty"`
	CheckpointCID    string   `json:"checkpointCID,omitempty"`
	CheckpointHash   string   `json:"checkpointHash,omitempty"`
}

// handleGetBlock returns a specific block
func (b *BlockchainAPI) handleGetBlock(w http.ResponseWriter, r *http.Request) {
	// Get block by number or hash
	numberStr := r.URL.Query().Get("number")
	hashStr := r.URL.Query().Get("hash")
	includeTxs := r.URL.Query().Get("includeTxs") == "true"

	var block *core.Block
	var err error

	if numberStr != "" {
		number, parseErr := strconv.ParseUint(numberStr, 10, 64)
		if parseErr != nil {
			http.Error(w, "Invalid block number", http.StatusBadRequest)
			return
		}
		block, err = b.storage.GetBlockByNumber(number)
	} else if hashStr != "" {
		hash, parseErr := core.HashFromHex(hashStr)
		if parseErr != nil {
			http.Error(w, "Invalid block hash", http.StatusBadRequest)
			return
		}
		block, err = b.storage.GetBlock(hash)
	} else {
		// Get latest block
		block, err = b.storage.GetLatestBlock()
	}

	if err != nil {
		http.Error(w, "Block not found", http.StatusNotFound)
		return
	}

	response := BlockResponse{
		Number:           block.Header.Number,
		Hash:             block.Hash().Hex(),
		PreviousHash:     block.Header.PreviousHash.Hex(),
		Timestamp:        block.Header.Timestamp,
		MinerAddress:     block.Header.MinerAddress.Hex(),
		TxRoot:           block.Header.TxRoot.Hex(),
		StateRoot:        block.Header.StateRoot.Hex(),
		TransactionCount: len(block.Transactions),
		CheckpointCID:    block.Header.CheckpointCID,
		CheckpointHash:   block.Header.CheckpointHash.Hex(),
	}

	if includeTxs {
		txIDs := make([]string, len(block.Transactions))
		for i, tx := range block.Transactions {
			txIDs[i] = tx.ID.Hex()
		}
		response.Transactions = txIDs
	}

	b.jsonResponse(w, response)
}

// handleGetBlocks returns a range of blocks
func (b *BlockchainAPI) handleGetBlocks(w http.ResponseWriter, r *http.Request) {
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")
	limitStr := r.URL.Query().Get("limit")

	var from, to uint64
	limit := 10

	if fromStr != "" {
		f, err := strconv.ParseUint(fromStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid from parameter", http.StatusBadRequest)
			return
		}
		from = f
	}

	if toStr != "" {
		t, err := strconv.ParseUint(toStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid to parameter", http.StatusBadRequest)
			return
		}
		to = t
	} else {
		latestNum, err := b.storage.GetLatestBlockNumber()
		if err != nil {
			http.Error(w, "No blocks found", http.StatusNotFound)
			return
		}
		to = latestNum
	}

	if limitStr != "" {
		l, err := strconv.Atoi(limitStr)
		if err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	blocks := make([]BlockResponse, 0)
	count := 0

	for i := to; i >= from && count < limit; i-- {
		block, err := b.storage.GetBlockByNumber(i)
		if err != nil {
			continue
		}

		blocks = append(blocks, BlockResponse{
			Number:           block.Header.Number,
			Hash:             block.Hash().Hex(),
			PreviousHash:     block.Header.PreviousHash.Hex(),
			Timestamp:        block.Header.Timestamp,
			MinerAddress:     block.Header.MinerAddress.Hex(),
			TransactionCount: len(block.Transactions),
		})
		count++

		if i == 0 {
			break
		}
	}

	b.jsonResponse(w, map[string]interface{}{
		"blocks": blocks,
		"count":  len(blocks),
	})
}

// TransactionResponse contains transaction information
type TransactionResponse struct {
	ID            string `json:"id"`
	Validator     string `json:"validator"`
	From          string `json:"from"`
	To            string `json:"to"`
	Value         string `json:"value"`
	Nonce         string `json:"nonce"`
	Data          string `json:"data"`
	SequenceID    uint64 `json:"sequenceId"`
	ReadSetCount  int    `json:"readSetCount"`
	WriteSetCount int    `json:"writeSetCount"`
}

// handleGetTransaction returns a specific transaction
func (b *BlockchainAPI) handleGetTransaction(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "Transaction ID required", http.StatusBadRequest)
		return
	}

	hash, err := core.HashFromHex(idStr)
	if err != nil {
		http.Error(w, "Invalid transaction ID", http.StatusBadRequest)
		return
	}

	tx, err := b.storage.GetTransaction(hash)
	if err != nil {
		http.Error(w, "Transaction not found", http.StatusNotFound)
		return
	}

	dataHex := ""
	if len(tx.Data) > 0 {
		dataHex = "0x"
		for _, b := range tx.Data {
			dataHex += strconv.FormatInt(int64(b), 16)
		}
	}

	nonceStr := "0"
	if tx.Nonce != nil {
		nonceStr = tx.Nonce.String()
	}

	response := TransactionResponse{
		ID:            tx.ID.Hex(),
		Validator:     tx.Validator.Hex(),
		From:          tx.From.Hex(),
		To:            tx.To.Hex(),
		Value:         tx.Value.String(),
		Nonce:         nonceStr,
		Data:          dataHex,
		SequenceID:    tx.SequenceID,
		ReadSetCount:  len(tx.ReadSet),
		WriteSetCount: len(tx.WriteSet),
	}

	b.jsonResponse(w, response)
}

// AccountResponse contains account information
type AccountResponse struct {
	Address string `json:"address"`
	Balance string `json:"balance"`
	Nonce   uint64 `json:"nonce"`
}

// handleGetAccount returns account information
func (b *BlockchainAPI) handleGetAccount(w http.ResponseWriter, r *http.Request) {
	addressStr := r.URL.Query().Get("address")
	if addressStr == "" {
		http.Error(w, "Address required", http.StatusBadRequest)
		return
	}

	address, err := core.AddressFromHex(addressStr)
	if err != nil {
		http.Error(w, "Invalid address", http.StatusBadRequest)
		return
	}

	account, err := b.storage.GetAccount(address)
	if err != nil {
		http.Error(w, "Account not found", http.StatusNotFound)
		return
	}

	response := AccountResponse{
		Address: account.Address.Hex(),
		Balance: account.Balance.String(),
		Nonce:   account.Nonce,
	}

	b.jsonResponse(w, response)
}

// handleMinerInfo returns miner information
func (b *BlockchainAPI) handleMinerInfo(w http.ResponseWriter, r *http.Request) {
	if b.miner == nil {
		http.Error(w, "Mining not enabled", http.StatusNotFound)
		return
	}

	stats, err := b.miner.GetStats()
	if err != nil {
		http.Error(w, "Failed to get miner stats", http.StatusInternalServerError)
		return
	}

	b.jsonResponse(w, stats)
}

// handlePendingTransactions returns pending transactions
func (b *BlockchainAPI) handlePendingTransactions(w http.ResponseWriter, r *http.Request) {
	if b.miner == nil {
		http.Error(w, "Mining not enabled", http.StatusNotFound)
		return
	}

	pendingTxs := b.miner.GetPendingTransactions(100)

	txs := make([]TransactionResponse, len(pendingTxs))
	for i, tx := range pendingTxs {
		nonceStr := "0"
		if tx.Nonce != nil {
			nonceStr = tx.Nonce.String()
		}
		txs[i] = TransactionResponse{
			ID:        tx.ID.Hex(),
			Validator: tx.Validator.Hex(),
			From:      tx.From.Hex(),
			To:        tx.To.Hex(),
			Value:     tx.Value.String(),
			Nonce:     nonceStr,
		}
	}

	b.jsonResponse(w, map[string]interface{}{
		"count":        len(txs),
		"transactions": txs,
	})
}

// SubmitProposalRequest represents a proposal submission request
type SubmitProposalRequest struct {
	TxType     uint8  `json:"txType"`
	Validator  string `json:"validator"`
	From       string `json:"from"`
	To         string `json:"to"`
	Value      string `json:"value"`
	Nonce      string `json:"nonce"`
	BlockLimit uint64 `json:"blockLimit"`
	Data       string `json:"data"`    // hex encoded
	UserSig    string `json:"userSig"` // hex encoded
}

// SubmitProposalResponse represents the response to a proposal submission
type SubmitProposalResponse struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// SubmitTransactionRequest represents a transaction submission request
type SubmitTransactionRequest struct {
	Validator    string            `json:"validator"`
	From         string            `json:"from"`
	To           string            `json:"to"`
	Value        string            `json:"value"`
	Nonce        string            `json:"nonce"`
	BlockLimit   uint64            `json:"blockLimit"`   // Block expiration limit
	Data         string            `json:"data"`         // hex encoded
	UserSig      string            `json:"userSig"`      // hex encoded
	SequenceID   uint64            `json:"sequenceId"`
	ReadSet      map[string]string `json:"readSet"`      // key -> hex value
	WriteSet     map[string]string `json:"writeSet"`     // key -> hex value
	ValidatorSig string            `json:"validatorSig"` // hex encoded
}

// SubmitTransactionResponse represents the response to a transaction submission
type SubmitTransactionResponse struct {
	Success bool   `json:"success"`
	TxID    string `json:"txId,omitempty"`
	Error   string `json:"error,omitempty"`
}

// handleSubmitProposal handles proposal submission
func (b *BlockchainAPI) handleSubmitProposal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if b.miner == nil {
		b.jsonResponse(w, SubmitProposalResponse{
			Success: false,
			Error:   "mining not enabled",
		})
		return
	}

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		b.jsonResponse(w, SubmitProposalResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var req SubmitProposalRequest
	if err := json.Unmarshal(body, &req); err != nil {
		b.jsonResponse(w, SubmitProposalResponse{
			Success: false,
			Error:   "invalid JSON: " + err.Error(),
		})
		return
	}

	// Parse addresses
	validator, err := core.AddressFromHex(req.Validator)
	if err != nil {
		b.jsonResponse(w, SubmitProposalResponse{
			Success: false,
			Error:   "invalid validator address: " + err.Error(),
		})
		return
	}

	from, err := core.AddressFromHex(req.From)
	if err != nil {
		b.jsonResponse(w, SubmitProposalResponse{
			Success: false,
			Error:   "invalid from address: " + err.Error(),
		})
		return
	}

	// Parse 'to' address - empty for contract creation
	var to core.Address
	if req.To != "" {
		to, err = core.AddressFromHex(req.To)
		if err != nil {
			b.jsonResponse(w, SubmitProposalResponse{
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
			b.jsonResponse(w, SubmitProposalResponse{
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
			b.jsonResponse(w, SubmitProposalResponse{
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
			b.jsonResponse(w, SubmitProposalResponse{
				Success: false,
				Error:   "invalid data hex: " + err.Error(),
			})
			return
		}
	}

	// Parse user signature
	userSig, err := hex.DecodeString(req.UserSig)
	if err != nil {
		b.jsonResponse(w, SubmitProposalResponse{
			Success: false,
			Error:   "invalid user signature hex: " + err.Error(),
		})
		return
	}

	// Create proposal
	proposal := &core.TransactionProposal{
		TxType:     req.TxType,
		Validator:  validator,
		From:       from,
		To:         to,
		Value:      value,
		Nonce:      nonce,
		BlockLimit: req.BlockLimit,
		Data:       data,
		UserSig:    userSig,
	}

	// Add to proposals mempool
	if err := b.miner.AddPendingProposal(proposal); err != nil {
		b.jsonResponse(w, SubmitProposalResponse{
			Success: false,
			Error:   "failed to add proposal: " + err.Error(),
		})
		return
	}

	// Proposal will be automatically broadcasted via callback

	b.jsonResponse(w, SubmitProposalResponse{
		Success: true,
	})
}

// handlePendingProposals returns pending proposals
func (b *BlockchainAPI) handlePendingProposals(w http.ResponseWriter, r *http.Request) {
	if b.miner == nil {
		b.jsonResponse(w, map[string]interface{}{
			"count":     0,
			"proposals": []interface{}{},
		})
		return
	}

	proposals := b.miner.GetPendingProposals()

	proposalInfos := make([]map[string]interface{}, len(proposals))
	for i, p := range proposals {
		proposalInfos[i] = map[string]interface{}{
			"validator":  p.Validator.Hex(),
			"from":       p.From.Hex(),
			"to":         p.To.Hex(),
			"value":      p.Value.String(),
			"nonce":      p.Nonce.String(),
			"blockLimit": p.BlockLimit,
		}
	}

	b.jsonResponse(w, map[string]interface{}{
		"count":     len(proposals),
		"proposals": proposalInfos,
	})
}

// handleSubmitTransaction handles transaction submission
func (b *BlockchainAPI) handleSubmitTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if b.miner == nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "mining not enabled",
		})
		return
	}

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	var req SubmitTransactionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "invalid JSON: " + err.Error(),
		})
		return
	}

	// Parse addresses
	validator, err := core.AddressFromHex(req.Validator)
	if err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "invalid validator address: " + err.Error(),
		})
		return
	}

	from, err := core.AddressFromHex(req.From)
	if err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "invalid from address: " + err.Error(),
		})
		return
	}

	// Parse 'to' address - empty for contract creation
	var to core.Address
	if req.To != "" {
		to, err = core.AddressFromHex(req.To)
		if err != nil {
			b.jsonResponse(w, SubmitTransactionResponse{
				Success: false,
				Error:   "invalid to address: " + err.Error(),
			})
			return
		}
	}
	// If req.To is empty, 'to' remains as zero address (contract creation)

	// Parse value
	value := core.NewBigInt(0)
	if req.Value != "" {
		var ok bool
		value, ok = core.NewBigIntFromString(req.Value, 10)
		if !ok {
			b.jsonResponse(w, SubmitTransactionResponse{
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
			b.jsonResponse(w, SubmitTransactionResponse{
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
			b.jsonResponse(w, SubmitTransactionResponse{
				Success: false,
				Error:   "invalid data hex: " + err.Error(),
			})
			return
		}
	}

	// Parse signatures
	userSig, err := hex.DecodeString(req.UserSig)
	if err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "invalid user signature hex: " + err.Error(),
		})
		return
	}

	validatorSig, err := hex.DecodeString(req.ValidatorSig)
	if err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "invalid validator signature hex: " + err.Error(),
		})
		return
	}

	// Parse ReadSet (both keys and values are hex-encoded)
	readSet := make(map[string][]byte)
	for keyHex, valueHex := range req.ReadSet {
		keyBytes, err := hex.DecodeString(keyHex)
		if err != nil {
			b.jsonResponse(w, SubmitTransactionResponse{
				Success: false,
				Error:   "invalid readSet key hex: " + err.Error(),
			})
			return
		}
		valueBytes, err := hex.DecodeString(valueHex)
		if err != nil {
			b.jsonResponse(w, SubmitTransactionResponse{
				Success: false,
				Error:   "invalid readSet value hex for key " + keyHex + ": " + err.Error(),
			})
			return
		}
		readSet[string(keyBytes)] = valueBytes
	}

	// Parse WriteSet (both keys and values are hex-encoded)
	writeSet := make(map[string][]byte)
	for keyHex, valueHex := range req.WriteSet {
		keyBytes, err := hex.DecodeString(keyHex)
		if err != nil {
			b.jsonResponse(w, SubmitTransactionResponse{
				Success: false,
				Error:   "invalid writeSet key hex: " + err.Error(),
			})
			return
		}
		valueBytes, err := hex.DecodeString(valueHex)
		if err != nil {
			b.jsonResponse(w, SubmitTransactionResponse{
				Success: false,
				Error:   "invalid writeSet value hex for key " + keyHex + ": " + err.Error(),
			})
			return
		}
		writeSet[string(keyBytes)] = valueBytes
	}

	// Create transaction
	tx := &core.Transaction{
		Validator:    validator,
		From:         from,
		To:           to,
		Value:        value,
		Nonce:        nonce,
		BlockLimit:   req.BlockLimit,
		Data:         data,
		UserSig:      userSig,
		SequenceID:   req.SequenceID,
		ReadSet:      readSet,
		WriteSet:     writeSet,
		ValidatorSig: validatorSig,
	}

	// Compute transaction ID
	tx.ComputeID()

	// Verify transaction
	if err := tx.Verify(); err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			TxID:    tx.ID.Hex(),
			Error:   "transaction verification failed: " + err.Error(),
		})
		return
	}

	// Add to pending pool
	if err := b.miner.AddPendingTransaction(tx); err != nil {
		b.jsonResponse(w, SubmitTransactionResponse{
			Success: false,
			Error:   "failed to add transaction: " + err.Error(),
		})
		return
	}

	// Broadcast to network
	if b.broadcaster != nil {
		b.broadcaster(tx)
	}

	b.jsonResponse(w, SubmitTransactionResponse{
		Success: true,
		TxID:    tx.ID.Hex(),
	})
}

// jsonResponse writes a JSON response
func (b *BlockchainAPI) jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}
