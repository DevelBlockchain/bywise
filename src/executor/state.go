package executor

import (
	"math/big"
	"sync"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
)

// StateDB wraps storage to track ReadSet and WriteSet during EVM execution
type StateDB struct {
	storage *storage.Storage
	mu      sync.RWMutex

	// Track reads and writes for transaction evidence
	readSet  map[string][]byte // key -> value read
	writeSet map[string][]byte // key -> new value

	// Account cache
	accounts map[core.Address]*AccountState

	// Storage cache
	storageCache map[string][]byte // contract:slot -> value

	// Code cache
	codeCache map[core.Address][]byte

	// Original values for revert
	originalStorage map[string][]byte
}

// AccountState holds in-memory account data
type AccountState struct {
	Balance *big.Int
	Nonce   uint64
	Code    []byte
}

// NewStateDB creates a new StateDB wrapper
func NewStateDB(store *storage.Storage) *StateDB {
	return &StateDB{
		storage:         store,
		readSet:         make(map[string][]byte),
		writeSet:        make(map[string][]byte),
		accounts:        make(map[core.Address]*AccountState),
		storageCache:    make(map[string][]byte),
		codeCache:       make(map[core.Address][]byte),
		originalStorage: make(map[string][]byte),
	}
}

// NewStateDBFromReadSet creates a StateDB that uses pre-populated data from a ReadSet.
// This enables stateless validation - executing transactions without external state access.
func NewStateDBFromReadSet(readSet map[string][]byte) *StateDB {
	sdb := &StateDB{
		storage:         nil, // No storage access in stateless mode
		readSet:         make(map[string][]byte),
		writeSet:        make(map[string][]byte),
		accounts:        make(map[core.Address]*AccountState),
		storageCache:    make(map[string][]byte),
		codeCache:       make(map[core.Address][]byte),
		originalStorage: make(map[string][]byte),
	}

	// Pre-populate caches from the ReadSet
	for keyStr, value := range readSet {
		key := core.StateKey(keyStr)
		if len(key) == 0 {
			continue
		}

		switch key[0] {
		case core.KeyTypeAccount:
			if len(key) >= 21 {
				var addr core.Address
				copy(addr[:], key[1:21])
				if value != nil {
					acc := deserializeAccountState(value)
					sdb.accounts[addr] = acc
				} else {
					sdb.accounts[addr] = &AccountState{
						Balance: big.NewInt(0),
						Nonce:   0,
					}
				}
			}
		case core.KeyTypeStorage:
			sdb.storageCache[keyStr] = value
		case core.KeyTypeCode:
			if len(key) >= 21 {
				var addr core.Address
				copy(addr[:], key[1:21])
				sdb.codeCache[addr] = value
			}
		}

		// Also store in readSet for tracking
		sdb.readSet[keyStr] = value
	}

	return sdb
}

// deserializeAccountState deserializes account state from bytes (JSON format)
func deserializeAccountState(data []byte) *AccountState {
	if len(data) == 0 {
		return &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
	}

	// Use the same JSON deserialization as core.Account
	account, err := core.DeserializeAccount(data)
	if err != nil {
		return &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
	}

	balance := big.NewInt(0)
	if account.Balance != nil && account.Balance.Int != nil {
		balance = account.Balance.Int
	}

	return &AccountState{
		Balance: balance,
		Nonce:   account.Nonce,
	}
}

// IsStateless returns true if this StateDB is in stateless mode (no storage access)
func (s *StateDB) IsStateless() bool {
	return s.storage == nil
}

// GetReadSet returns the ReadSet with keys AND values for stateless validation
func (s *StateDB) GetReadSet() map[string][]byte {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string][]byte)
	for k, v := range s.readSet {
		result[k] = v
	}
	return result
}

// GetReadSetKeys returns only the keys from the ReadSet (for conflict detection)
func (s *StateDB) GetReadSetKeys() []core.StateKey {
	s.mu.RLock()
	defer s.mu.RUnlock()

	keys := make([]core.StateKey, 0, len(s.readSet))
	for k := range s.readSet {
		keys = append(keys, core.StateKey(k))
	}
	return keys
}

// GetWriteSet returns the WriteSet
func (s *StateDB) GetWriteSet() map[string][]byte {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string][]byte)
	for k, v := range s.writeSet {
		result[k] = v
	}
	return result
}

// --- Balance Operations ---

// GetBalance returns the balance of an account
func (s *StateDB) GetBalance(addr core.Address) *big.Int {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check cache first
	if acc, ok := s.accounts[addr]; ok {
		return new(big.Int).Set(acc.Balance)
	}

	// Load from storage using raw GetState to detect non-existent accounts
	key := core.MakeAccountKey(addr)
	keyStr := string(key)

	data, err := s.storage.GetState(key)
	if err != nil || len(data) == 0 {
		// Account doesn't exist - record nil read
		s.readSet[keyStr] = nil
		// Cache empty account
		s.accounts[addr] = &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
		return big.NewInt(0)
	}

	// Record the read with actual stored data
	s.readSet[keyStr] = data

	// Deserialize and cache account
	account, err := core.DeserializeAccount(data)
	if err != nil {
		// Invalid data, treat as empty
		s.accounts[addr] = &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
		return big.NewInt(0)
	}

	s.accounts[addr] = &AccountState{
		Balance: account.Balance.Int,
		Nonce:   account.Nonce,
	}

	return new(big.Int).Set(account.Balance.Int)
}

// SetBalance sets the balance of an account
func (s *StateDB) SetBalance(addr core.Address, amount *big.Int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Ensure account is loaded
	if _, ok := s.accounts[addr]; !ok {
		s.accounts[addr] = &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
	}

	s.accounts[addr].Balance = new(big.Int).Set(amount)

	// Record write
	key := core.MakeAccountKey(addr)
	keyStr := string(key)
	s.writeSet[keyStr] = s.serializeAccount(addr, s.accounts[addr])
}

// AddBalance adds to the balance of an account
func (s *StateDB) AddBalance(addr core.Address, amount *big.Int) {
	balance := s.GetBalance(addr)
	s.SetBalance(addr, new(big.Int).Add(balance, amount))
}

// SubBalance subtracts from the balance of an account
func (s *StateDB) SubBalance(addr core.Address, amount *big.Int) bool {
	balance := s.GetBalance(addr)
	if balance.Cmp(amount) < 0 {
		return false
	}
	s.SetBalance(addr, new(big.Int).Sub(balance, amount))
	return true
}

// --- Nonce Operations ---

// GetNonce returns the nonce of an account
func (s *StateDB) GetNonce(addr core.Address) uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()

	if acc, ok := s.accounts[addr]; ok {
		return acc.Nonce
	}

	// Load from storage using raw GetState to detect non-existent accounts
	key := core.MakeAccountKey(addr)
	keyStr := string(key)

	data, err := s.storage.GetState(key)
	if err != nil || len(data) == 0 {
		// Account doesn't exist - record nil read
		s.readSet[keyStr] = nil
		s.accounts[addr] = &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
		return 0
	}

	// Record the read with actual stored data
	s.readSet[keyStr] = data

	// Deserialize and cache account
	account, err := core.DeserializeAccount(data)
	if err != nil {
		s.accounts[addr] = &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
		return 0
	}

	s.accounts[addr] = &AccountState{
		Balance: account.Balance.Int,
		Nonce:   account.Nonce,
	}

	return account.Nonce
}

// SetNonce sets the nonce of an account
func (s *StateDB) SetNonce(addr core.Address, nonce uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.accounts[addr]; !ok {
		s.accounts[addr] = &AccountState{
			Balance: big.NewInt(0),
			Nonce:   0,
		}
	}

	s.accounts[addr].Nonce = nonce

	key := core.MakeAccountKey(addr)
	keyStr := string(key)
	s.writeSet[keyStr] = s.serializeAccount(addr, s.accounts[addr])
}

// --- Storage Operations ---

// GetState reads from contract storage
func (s *StateDB) GetState(addr core.Address, slot core.Hash) core.Hash {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := core.MakeStorageKey(addr, slot)
	keyStr := string(key)

	// Check cache
	if val, ok := s.storageCache[keyStr]; ok {
		return core.HashFromBytes(val)
	}

	// Load from storage
	val, err := s.storage.GetStorageSlot(addr, slot)
	if err != nil {
		s.readSet[keyStr] = nil
		s.storageCache[keyStr] = make([]byte, 32)
		return core.Hash{}
	}

	s.readSet[keyStr] = val
	s.storageCache[keyStr] = val

	return core.HashFromBytes(val)
}

// SetState writes to contract storage
func (s *StateDB) SetState(addr core.Address, slot core.Hash, value core.Hash) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := core.MakeStorageKey(addr, slot)
	keyStr := string(key)

	// Store original if first write
	if _, ok := s.originalStorage[keyStr]; !ok {
		if current, ok := s.storageCache[keyStr]; ok {
			s.originalStorage[keyStr] = current
		}
	}

	s.storageCache[keyStr] = value[:]
	s.writeSet[keyStr] = value[:]
}

// --- Code Operations ---

// GetCode returns the contract code
func (s *StateDB) GetCode(addr core.Address) []byte {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check cache
	if code, ok := s.codeCache[addr]; ok {
		return code
	}

	key := core.MakeCodeKey(addr)
	keyStr := string(key)

	code, err := s.storage.GetContractCode(addr)
	if err != nil {
		s.readSet[keyStr] = nil
		s.codeCache[addr] = nil
		return nil
	}

	s.readSet[keyStr] = code
	s.codeCache[addr] = code

	return code
}

// SetCode sets the contract code
func (s *StateDB) SetCode(addr core.Address, code []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := core.MakeCodeKey(addr)
	keyStr := string(key)

	s.codeCache[addr] = code
	s.writeSet[keyStr] = code
}

// GetCodeHash returns the hash of the contract code
func (s *StateDB) GetCodeHash(addr core.Address) core.Hash {
	code := s.GetCode(addr)
	if code == nil {
		return core.Hash{}
	}
	return core.HashData(code)
}

// GetCodeSize returns the size of the contract code
func (s *StateDB) GetCodeSize(addr core.Address) int {
	return len(s.GetCode(addr))
}

// --- Account Existence ---

// Exist checks if an account exists
func (s *StateDB) Exist(addr core.Address) bool {
	balance := s.GetBalance(addr)
	nonce := s.GetNonce(addr)
	code := s.GetCode(addr)
	return balance.Sign() > 0 || nonce > 0 || len(code) > 0
}

// Empty checks if an account is empty
func (s *StateDB) Empty(addr core.Address) bool {
	return !s.Exist(addr)
}

// --- Snapshot and Revert ---

// Snapshot creates a snapshot of current state
func (s *StateDB) Snapshot() int {
	// Simple implementation - return current write count
	return len(s.writeSet)
}

// RevertToSnapshot reverts state changes to a snapshot
func (s *StateDB) RevertToSnapshot(snap int) {
	// This is a simplified implementation
	// A full implementation would track changes per snapshot
}

// --- Helper Functions ---

func (s *StateDB) serializeAccount(addr core.Address, acc *AccountState) []byte {
	// Use the same JSON serialization as core.Account for consistency with storage
	account := &core.Account{
		Address: addr,
		Balance: core.BigIntFromBytes(acc.Balance.Bytes()),
		Nonce:   acc.Nonce,
	}
	data, err := account.Serialize()
	if err != nil {
		// Fallback to empty account on error
		return []byte("{}")
	}
	return data
}

// Reset clears all cached state
func (s *StateDB) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.readSet = make(map[string][]byte)
	s.writeSet = make(map[string][]byte)
	s.accounts = make(map[core.Address]*AccountState)
	s.storageCache = make(map[string][]byte)
	s.codeCache = make(map[core.Address][]byte)
	s.originalStorage = make(map[string][]byte)
}

// ClearSets clears only the read and write sets, preserving cached state
func (s *StateDB) ClearSets() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.readSet = make(map[string][]byte)
	s.writeSet = make(map[string][]byte)
}

// Commit applies all changes to the underlying storage
func (s *StateDB) Commit() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	batch := s.storage.NewBatch()

	for keyStr, value := range s.writeSet {
		key := core.StateKey(keyStr)
		batch.SetState(key, value)
	}

	return batch.Commit()
}
