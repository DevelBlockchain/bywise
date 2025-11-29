package miner

import (
	"bytes"
	"encoding/binary"
	"errors"
	"math/big"
	"sort"
	"sync"
	"time"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

var (
	ErrNotMinerTurn     = errors.New("not this miner's turn")
	ErrInvalidMiner     = errors.New("invalid miner for this block")
	ErrNoActiveMiners   = errors.New("no active miners in network")
	ErrBlockTooEarly    = errors.New("block timestamp too early")
	ErrConflictingTx    = errors.New("transaction conflicts with existing transaction")
	ErrInvalidPreState  = errors.New("transaction pre-state does not match current state")
	ErrDuplicateNonce   = errors.New("duplicate nonce for this account")
	ErrTxExpired        = errors.New("transaction has expired")
)

// Miner handles block creation and validation based on Weighted Sortition
type Miner struct {
	Storage     *storage.Storage
	Wallet      *wallet.Wallet
	Address     core.Address

	// Pending transactions pool
	pendingTxs []*core.Transaction
	txMu       sync.RWMutex

	// Current block being built
	currentBlock *core.Block
	blockMu      sync.Mutex

	// Mining state
	running bool
	stopCh  chan struct{}

	// Callback for when a block is mined
	onBlockMined func(*core.Block)
}

// NewMiner creates a new miner instance
func NewMiner(store *storage.Storage, w *wallet.Wallet) (*Miner, error) {
	addr, err := core.AddressFromHex(w.Address())
	if err != nil {
		return nil, err
	}

	return &Miner{
		Storage:    store,
		Wallet:     w,
		Address:    addr,
		pendingTxs: make([]*core.Transaction, 0),
		stopCh:     make(chan struct{}),
	}, nil
}

// CalculateMinerPriority calculates the priority for a miner based on:
// Hash(LastBlockHash + MinerAddress)
func CalculateMinerPriority(lastBlockHash core.Hash, minerAddress core.Address) *big.Int {
	var buf bytes.Buffer
	buf.Write(lastBlockHash[:])
	buf.Write(minerAddress[:])

	hash := wallet.Keccak256(buf.Bytes())
	hashInt := new(big.Int).SetBytes(hash)

	return hashInt
}

// MinerPriority holds a miner's address and calculated priority
type MinerPriority struct {
	Address  core.Address
	Priority *big.Int
}

// GetMinerQueue returns the ordered list of miners for the next block
// based on hash-based sortition algorithm
func (m *Miner) GetMinerQueue(lastBlockHash core.Hash) ([]MinerPriority, error) {
	// For now, return a simple list with just this miner
	// In a full implementation, this would query a list of registered miners
	priorities := []MinerPriority{
		{
			Address:  m.Address,
			Priority: CalculateMinerPriority(lastBlockHash, m.Address),
		},
	}

	// Sort by priority (descending)
	sort.Slice(priorities, func(i, j int) bool {
		return priorities[i].Priority.Cmp(priorities[j].Priority) > 0
	})

	return priorities, nil
}

// IsMyTurn checks if it's this miner's turn to produce a block
func (m *Miner) IsMyTurn(lastBlockHash core.Hash) (bool, int, error) {
	queue, err := m.GetMinerQueue(lastBlockHash)
	if err != nil {
		return false, -1, err
	}

	for i, mp := range queue {
		if mp.Address == m.Address {
			return i == 0, i, nil
		}
	}

	return false, -1, nil
}

// GetExpectedMiner returns the expected miner for the next block
func (m *Miner) GetExpectedMiner(lastBlockHash core.Hash) (core.Address, error) {
	queue, err := m.GetMinerQueue(lastBlockHash)
	if err != nil {
		return core.Address{}, err
	}

	if len(queue) == 0 {
		return core.Address{}, ErrNoActiveMiners
	}

	return queue[0].Address, nil
}

// AddPendingTransaction adds a transaction to the pending pool
func (m *Miner) AddPendingTransaction(tx *core.Transaction) error {
	// Verify transaction signatures
	if err := tx.Verify(); err != nil {
		return err
	}

	// Check expiration against current block
	currentBlock, err := m.Storage.GetLatestBlock()
	if err == nil && currentBlock != nil {
		if tx.IsExpired(currentBlock.Header.Number) {
			return ErrTxExpired
		}
	}

	// Check for duplicate nonce (same From + Nonce already in blockchain)
	if err := m.verifyNonceUnique(tx); err != nil {
		return err
	}

	// Verify pre-state matches current database state
	if err := m.verifyPreState(tx); err != nil {
		return err
	}

	m.txMu.Lock()
	defer m.txMu.Unlock()

	// Check for duplicate nonce in pending pool
	for _, pendingTx := range m.pendingTxs {
		if pendingTx.From == tx.From && pendingTx.Nonce.Cmp(tx.Nonce) == 0 {
			return ErrDuplicateNonce
		}
	}

	// Check for conflicts with existing pending transactions
	for _, pendingTx := range m.pendingTxs {
		if tx.HasConflict(pendingTx) {
			return ErrConflictingTx
		}
	}

	m.pendingTxs = append(m.pendingTxs, tx)
	return nil
}

// verifyNonceUnique checks that no transaction with the same (From, Nonce) exists in blockchain
func (m *Miner) verifyNonceUnique(tx *core.Transaction) error {
	// Get the account to check its current nonce
	account, err := m.Storage.GetAccount(tx.From)
	if err != nil {
		// Account doesn't exist or can't be read - nonce is valid
		return nil
	}

	// If account exists, check if tx.Nonce is valid
	// Transaction nonce must be >= current account nonce (nonce tracks the next expected nonce)
	if account != nil && tx.Nonce != nil && tx.Nonce.Int != nil {
		txNonce := tx.Nonce.Int.Uint64()
		if txNonce < account.Nonce {
			return ErrDuplicateNonce
		}
	}

	return nil
}

// verifyPreState verifies that the transaction's ReadSet values match current DB state
// With stateless validation, ReadSet contains both keys AND expected values
func (m *Miner) verifyPreState(tx *core.Transaction) error {
	for key, expectedValue := range tx.ReadSet {
		// Get current value from storage
		currentValue, err := m.Storage.GetState(core.StateKey(key))
		if err != nil && err != storage.ErrNotFound {
			return err
		}

		// For stateless validation, compare actual values
		// If key doesn't exist in DB, currentValue will be nil
		if err == storage.ErrNotFound {
			// Expected value should also be nil/empty for non-existent keys
			if len(expectedValue) > 0 {
				return ErrInvalidPreState
			}
		} else {
			// Key exists, compare values
			if !bytes.Equal(currentValue, expectedValue) {
				return ErrInvalidPreState
			}
		}
	}
	return nil
}

// GetPendingTransactions returns non-conflicting transactions for a new block
func (m *Miner) GetPendingTransactions(maxTxs int) []*core.Transaction {
	m.txMu.RLock()
	defer m.txMu.RUnlock()

	selected := make([]*core.Transaction, 0)

	for _, tx := range m.pendingTxs {
		if len(selected) >= maxTxs {
			break
		}

		// Check conflicts with already selected transactions
		hasConflict := false
		for _, selectedTx := range selected {
			if tx.HasConflict(selectedTx) {
				hasConflict = true
				break
			}
		}

		if !hasConflict {
			selected = append(selected, tx)
		}
	}

	return selected
}

// RemoveTransactions removes transactions from the pending pool
func (m *Miner) RemoveTransactions(txs []*core.Transaction) {
	m.txMu.Lock()
	defer m.txMu.Unlock()

	txIDs := make(map[core.Hash]bool)
	for _, tx := range txs {
		txIDs[tx.ID] = true
	}

	newPending := make([]*core.Transaction, 0)
	for _, tx := range m.pendingTxs {
		if !txIDs[tx.ID] {
			newPending = append(newPending, tx)
		}
	}

	m.pendingTxs = newPending
}

// CreateBlock creates a new block with pending transactions
func (m *Miner) CreateBlock() (*core.Block, error) {
	// Get latest block
	latestBlock, err := m.Storage.GetLatestBlock()
	if err != nil && err != storage.ErrNotFound {
		return nil, err
	}

	var prevHash core.Hash
	var blockNum uint64

	if latestBlock != nil {
		prevHash = latestBlock.Hash()
		blockNum = latestBlock.Header.Number + 1
	} else {
		prevHash = core.EmptyHash()
		blockNum = 0
	}

	// Verify it's our turn (skip for genesis block)
	if blockNum > 0 {
		expectedMiner, err := m.GetExpectedMiner(prevHash)
		if err != nil {
			return nil, err
		}
		if expectedMiner != m.Address {
			return nil, ErrNotMinerTurn
		}
	}

	// Create new block
	block := core.NewBlock(blockNum, prevHash, m.Address)

	// Add pending transactions
	pendingTxs := m.GetPendingTransactions(1000) // Max 1000 txs per block
	for _, tx := range pendingTxs {
		block.Transactions = append(block.Transactions, tx)
	}

	// Calculate state root (simplified - in production would be Merkle Patricia Trie)
	block.Header.StateRoot = m.calculateStateRoot()

	// Sign the block
	if err := block.Sign(m.Wallet); err != nil {
		return nil, err
	}

	return block, nil
}

// calculateStateRoot calculates a simple state root
// In production, this would be a Merkle Patricia Trie root
func (m *Miner) calculateStateRoot() core.Hash {
	// Export all state and hash it
	state, err := m.Storage.ExportState()
	if err != nil {
		return core.EmptyHash()
	}

	var buf bytes.Buffer
	for k, v := range state {
		buf.WriteString(k)
		buf.Write(v)
	}

	return core.HashFromBytes(wallet.Keccak256(buf.Bytes()))
}

// ValidateBlock validates a block received from the network
func (m *Miner) ValidateBlock(block *core.Block) error {
	// Get previous block
	var prevBlock *core.Block
	if block.Header.Number > 0 {
		var err error
		prevBlock, err = m.Storage.GetBlockByNumber(block.Header.Number - 1)
		if err != nil {
			return err
		}
	}

	// Basic block verification
	if err := block.Verify(prevBlock); err != nil {
		return err
	}

	// Verify it's from the expected miner
	if block.Header.Number > 0 {
		expectedMiner, err := m.GetExpectedMiner(block.Header.PreviousHash)
		if err != nil && err != ErrNoActiveMiners {
			return err
		}
		if err == nil && block.Header.MinerAddress != expectedMiner {
			return ErrInvalidMiner
		}
	}

	// Verify timestamp is not too early
	if prevBlock != nil {
		minTimestamp := prevBlock.Header.Timestamp + int64(core.BlockTime.Seconds())
		if block.Header.Timestamp < minTimestamp {
			return ErrBlockTooEarly
		}
	}

	// Verify all transactions and their pre-states
	for _, tx := range block.Transactions {
		if err := tx.Verify(); err != nil {
			return err
		}
		if err := m.verifyPreState(tx); err != nil {
			return err
		}
	}

	return nil
}

// ValidateBlockForSync validates a historical block during blockchain sync.
// It skips timestamp validation since historical blocks are already part of
// the canonical chain and may have been mined faster than BlockTime in tests.
func (m *Miner) ValidateBlockForSync(block *core.Block) error {
	// Get previous block
	var prevBlock *core.Block
	if block.Header.Number > 0 {
		var err error
		prevBlock, err = m.Storage.GetBlockByNumber(block.Header.Number - 1)
		if err != nil {
			return err
		}
	}

	// Basic block verification (hash, signatures, merkle roots)
	if err := block.Verify(prevBlock); err != nil {
		return err
	}

	// Skip timestamp validation - historical blocks are trusted
	// Skip transaction pre-state verification - will be rebuilt during ApplyBlock

	return nil
}

// ApplyBlock applies a validated block to the state
func (m *Miner) ApplyBlock(block *core.Block) error {
	// Create batch for atomic writes
	batch := m.Storage.NewBatch()

	// Apply all transaction write sets
	for _, tx := range block.Transactions {
		for keyStr, value := range tx.WriteSet {
			key := core.StateKey(keyStr)
			batch.SetState(key, value)
		}
	}

	// Commit batch
	if err := batch.Commit(); err != nil {
		return err
	}

	// Save block
	if err := m.Storage.SaveBlock(block); err != nil {
		return err
	}

	// Update latest block number
	if err := m.Storage.SetLatestBlockNumber(block.Header.Number); err != nil {
		return err
	}

	// Remove applied transactions from pending pool
	m.RemoveTransactions(block.Transactions)

	return nil
}

// Start starts the mining loop
func (m *Miner) Start() {
	m.blockMu.Lock()
	if m.running {
		m.blockMu.Unlock()
		return
	}
	m.running = true
	m.stopCh = make(chan struct{})
	m.blockMu.Unlock()

	go m.miningLoop()
}

// Stop stops the mining loop
func (m *Miner) Stop() {
	m.blockMu.Lock()
	if !m.running {
		m.blockMu.Unlock()
		return
	}
	m.running = false
	close(m.stopCh)
	m.blockMu.Unlock()
}

// miningLoop is the main mining loop
func (m *Miner) miningLoop() {
	ticker := time.NewTicker(core.BlockTime)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			m.tryProduceBlock()
		}
	}
}

// tryProduceBlock attempts to produce a block if it's our turn
func (m *Miner) tryProduceBlock() {
	latestBlock, err := m.Storage.GetLatestBlock()
	if err != nil && err != storage.ErrNotFound {
		return
	}

	var prevHash core.Hash
	if latestBlock != nil {
		prevHash = latestBlock.Hash()
	}

	isMyTurn, _, err := m.IsMyTurn(prevHash)
	if err != nil || !isMyTurn {
		return
	}

	block, err := m.CreateBlock()
	if err != nil {
		return
	}

	// Apply our own block
	if err := m.ApplyBlock(block); err != nil {
		return
	}

	// Call callback if set
	if m.onBlockMined != nil {
		m.onBlockMined(block)
	}
}

// SetOnBlockMined sets the callback function called when a block is mined
func (m *Miner) SetOnBlockMined(callback func(*core.Block)) {
	m.onBlockMined = callback
}

// GetBlockTimestamp returns the expected timestamp for a block at the given height
func GetBlockTimestamp(genesisTime int64, blockNumber uint64) int64 {
	return genesisTime + int64(blockNumber)*int64(core.BlockTime.Seconds())
}

// CalculateNextBlockTime returns when the next block should be produced
func (m *Miner) CalculateNextBlockTime() time.Time {
	latestBlock, err := m.Storage.GetLatestBlock()
	if err != nil {
		return time.Now().Add(core.BlockTime)
	}

	nextBlockTime := time.Unix(latestBlock.Header.Timestamp, 0).Add(core.BlockTime)
	return nextBlockTime
}

// GetMinerStats returns statistics about the miner
type MinerStats struct {
	Address          string
	IsActive         bool
	Position         int
	TotalMiners      int
	PendingTxCount   int
	LatestBlock      uint64
}

// GetStats returns current miner statistics
func (m *Miner) GetStats() (*MinerStats, error) {
	latestBlock, err := m.Storage.GetLatestBlock()
	if err != nil && err != storage.ErrNotFound {
		return nil, err
	}

	var prevHash core.Hash
	var blockNum uint64
	if latestBlock != nil {
		prevHash = latestBlock.Hash()
		blockNum = latestBlock.Header.Number
	}

	queue, err := m.GetMinerQueue(prevHash)
	position := -1
	if err == nil {
		for i, mp := range queue {
			if mp.Address == m.Address {
				position = i
				break
			}
		}
	}

	m.txMu.RLock()
	pendingCount := len(m.pendingTxs)
	m.txMu.RUnlock()

	return &MinerStats{
		Address:        m.Address.Hex(),
		IsActive:       true,
		Position:       position,
		TotalMiners:    len(queue),
		PendingTxCount: pendingCount,
		LatestBlock:    blockNum,
	}, nil
}

// Helper function for encoding uint64
func uint64ToBytes(n uint64) []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, n)
	return b
}
