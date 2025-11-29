package storage

import (
	"encoding/json"
	"errors"
	"sync"

	"github.com/bywise/go-bywise/src/core"
	"github.com/syndtr/goleveldb/leveldb"
	"github.com/syndtr/goleveldb/leveldb/util"
)

var (
	ErrNotFound     = errors.New("not found")
	ErrAlreadyExists = errors.New("already exists")
)

// Database prefixes for different data types
const (
	prefixState       = "s:" // State data (accounts, storage, code)
	prefixBlock       = "b:" // Blocks by hash
	prefixBlockNumber = "n:" // Block hash by number
	prefixTx          = "t:" // Transactions by ID
	prefixMeta        = "m:" // Metadata (latest block, etc)
)

// Metadata keys
const (
	metaLatestBlock = "latest_block"
	metaChainID     = "chain_id"
	metaChainParams = "chain_params"
)

// Storage provides persistent storage for blockchain data
type Storage struct {
	db   *leveldb.DB
	path string
	mu   sync.RWMutex
}

// NewStorage creates a new storage instance
func NewStorage(path string) (*Storage, error) {
	db, err := leveldb.OpenFile(path, nil)
	if err != nil {
		return nil, err
	}

	return &Storage{
		db:   db,
		path: path,
	}, nil
}

// Close closes the database
func (s *Storage) Close() error {
	return s.db.Close()
}

// --- State Operations ---

// GetState retrieves a state value by key
func (s *Storage) GetState(key core.StateKey) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	dbKey := append([]byte(prefixState), key...)
	value, err := s.db.Get(dbKey, nil)
	if err == leveldb.ErrNotFound {
		return nil, ErrNotFound
	}
	return value, err
}

// SetState sets a state value
func (s *Storage) SetState(key core.StateKey, value []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dbKey := append([]byte(prefixState), key...)
	return s.db.Put(dbKey, value, nil)
}

// DeleteState deletes a state value
func (s *Storage) DeleteState(key core.StateKey) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dbKey := append([]byte(prefixState), key...)
	return s.db.Delete(dbKey, nil)
}

// GetAccount retrieves an account from storage
func (s *Storage) GetAccount(address core.Address) (*core.Account, error) {
	key := core.MakeAccountKey(address)
	data, err := s.GetState(key)
	if err != nil {
		if err == ErrNotFound {
			return core.NewAccount(address), nil
		}
		return nil, err
	}
	return core.DeserializeAccount(data)
}

// SetAccount stores an account
func (s *Storage) SetAccount(account *core.Account) error {
	key := core.MakeAccountKey(account.Address)
	data, err := account.Serialize()
	if err != nil {
		return err
	}
	return s.SetState(key, data)
}

// GetContractCode retrieves contract code
func (s *Storage) GetContractCode(address core.Address) ([]byte, error) {
	key := core.MakeCodeKey(address)
	return s.GetState(key)
}

// SetContractCode stores contract code
func (s *Storage) SetContractCode(address core.Address, code []byte) error {
	key := core.MakeCodeKey(address)
	return s.SetState(key, code)
}

// GetStorageSlot retrieves a contract storage slot value
func (s *Storage) GetStorageSlot(contract core.Address, slot core.Hash) ([]byte, error) {
	key := core.MakeStorageKey(contract, slot)
	return s.GetState(key)
}

// SetStorageSlot sets a contract storage slot value
func (s *Storage) SetStorageSlot(contract core.Address, slot core.Hash, value []byte) error {
	key := core.MakeStorageKey(contract, slot)
	return s.SetState(key, value)
}

// --- Block Operations ---

// GetBlock retrieves a block by its hash
func (s *Storage) GetBlock(hash core.Hash) (*core.Block, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	dbKey := append([]byte(prefixBlock), hash[:]...)
	data, err := s.db.Get(dbKey, nil)
	if err == leveldb.ErrNotFound {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	var block core.Block
	if err := json.Unmarshal(data, &block); err != nil {
		return nil, err
	}
	return &block, nil
}

// GetBlockByNumber retrieves a block by its number
func (s *Storage) GetBlockByNumber(number uint64) (*core.Block, error) {
	s.mu.RLock()
	dbKey := append([]byte(prefixBlockNumber), uint64ToBytes(number)...)
	hashBytes, err := s.db.Get(dbKey, nil)
	s.mu.RUnlock()

	if err == leveldb.ErrNotFound {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	hash := core.HashFromBytes(hashBytes)
	return s.GetBlock(hash)
}

// SaveBlock stores a block
func (s *Storage) SaveBlock(block *core.Block) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := block.Hash()

	// Serialize block
	data, err := json.Marshal(block)
	if err != nil {
		return err
	}

	// Create batch for atomic writes
	batch := new(leveldb.Batch)

	// Store block by hash
	blockKey := append([]byte(prefixBlock), hash[:]...)
	batch.Put(blockKey, data)

	// Store block hash by number
	numberKey := append([]byte(prefixBlockNumber), uint64ToBytes(block.Header.Number)...)
	batch.Put(numberKey, hash[:])

	// Store all transactions
	for _, tx := range block.Transactions {
		txData, err := json.Marshal(tx)
		if err != nil {
			return err
		}
		txKey := append([]byte(prefixTx), tx.ID[:]...)
		batch.Put(txKey, txData)
	}

	return s.db.Write(batch, nil)
}

// --- Transaction Operations ---

// GetTransaction retrieves a transaction by its ID
func (s *Storage) GetTransaction(id core.Hash) (*core.Transaction, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	dbKey := append([]byte(prefixTx), id[:]...)
	data, err := s.db.Get(dbKey, nil)
	if err == leveldb.ErrNotFound {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	var tx core.Transaction
	if err := json.Unmarshal(data, &tx); err != nil {
		return nil, err
	}
	return &tx, nil
}

// --- Metadata Operations ---

// GetLatestBlockNumber returns the latest block number
func (s *Storage) GetLatestBlockNumber() (uint64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := []byte(prefixMeta + metaLatestBlock)
	data, err := s.db.Get(key, nil)
	if err == leveldb.ErrNotFound {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, err
	}

	return bytesToUint64(data), nil
}

// SetLatestBlockNumber sets the latest block number
func (s *Storage) SetLatestBlockNumber(number uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := []byte(prefixMeta + metaLatestBlock)
	return s.db.Put(key, uint64ToBytes(number), nil)
}

// GetLatestBlock returns the latest block
func (s *Storage) GetLatestBlock() (*core.Block, error) {
	number, err := s.GetLatestBlockNumber()
	if err != nil {
		return nil, err
	}
	return s.GetBlockByNumber(number)
}

// --- Iteration Operations ---

// IterateState iterates over all state with a given prefix
func (s *Storage) IterateState(prefix byte, fn func(key core.StateKey, value []byte) error) error {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Create prefix to iterate
	iterPrefix := append([]byte(prefixState), prefix)
	iter := s.db.NewIterator(util.BytesPrefix(iterPrefix), nil)
	defer iter.Release()

	for iter.Next() {
		// Remove the state prefix to get the actual key
		key := core.StateKey(iter.Key()[len(prefixState):])
		if err := fn(key, iter.Value()); err != nil {
			return err
		}
	}

	return iter.Error()
}

// --- Batch Operations ---

// Batch represents a batch of operations
type Batch struct {
	storage *Storage
	batch   *leveldb.Batch
}

// NewBatch creates a new batch
func (s *Storage) NewBatch() *Batch {
	return &Batch{
		storage: s,
		batch:   new(leveldb.Batch),
	}
}

// SetState adds a state set operation to the batch
func (b *Batch) SetState(key core.StateKey, value []byte) {
	dbKey := append([]byte(prefixState), key...)
	b.batch.Put(dbKey, value)
}

// DeleteState adds a state delete operation to the batch
func (b *Batch) DeleteState(key core.StateKey) {
	dbKey := append([]byte(prefixState), key...)
	b.batch.Delete(dbKey)
}

// Commit commits the batch
func (b *Batch) Commit() error {
	b.storage.mu.Lock()
	defer b.storage.mu.Unlock()
	return b.storage.db.Write(b.batch, nil)
}

// --- Snapshot Operations (for checkpoints) ---

// ExportState exports all state to a map
func (s *Storage) ExportState() (map[string][]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	state := make(map[string][]byte)
	iter := s.db.NewIterator(util.BytesPrefix([]byte(prefixState)), nil)
	defer iter.Release()

	for iter.Next() {
		key := string(iter.Key())
		value := make([]byte, len(iter.Value()))
		copy(value, iter.Value())
		state[key] = value
	}

	return state, iter.Error()
}

// ImportState imports state from a map
func (s *Storage) ImportState(state map[string][]byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	batch := new(leveldb.Batch)
	for key, value := range state {
		batch.Put([]byte(key), value)
	}

	return s.db.Write(batch, nil)
}

// --- Helper Functions ---

func uint64ToBytes(n uint64) []byte {
	b := make([]byte, 8)
	b[0] = byte(n >> 56)
	b[1] = byte(n >> 48)
	b[2] = byte(n >> 40)
	b[3] = byte(n >> 32)
	b[4] = byte(n >> 24)
	b[5] = byte(n >> 16)
	b[6] = byte(n >> 8)
	b[7] = byte(n)
	return b
}

func bytesToUint64(b []byte) uint64 {
	if len(b) < 8 {
		return 0
	}
	return uint64(b[0])<<56 | uint64(b[1])<<48 | uint64(b[2])<<40 | uint64(b[3])<<32 |
		uint64(b[4])<<24 | uint64(b[5])<<16 | uint64(b[6])<<8 | uint64(b[7])
}

// GetChainParams retrieves the chain parameters from storage
func (s *Storage) GetChainParams() (*core.ChainParams, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	key := prefixMeta + metaChainParams
	data, err := s.db.Get([]byte(key), nil)
	if err != nil {
		if err == leveldb.ErrNotFound {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return core.DeserializeChainParams(data)
}

// SetChainParams stores the chain parameters
func (s *Storage) SetChainParams(params *core.ChainParams) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := params.Serialize()
	if err != nil {
		return err
	}

	key := prefixMeta + metaChainParams
	return s.db.Put([]byte(key), data, nil)
}
