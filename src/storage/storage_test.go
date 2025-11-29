package storage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/wallet"
)

func setupTestStorage(t *testing.T) (*Storage, func()) {
	tmpDir, err := os.MkdirTemp("", "storage-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "testdb")
	storage, err := NewStorage(dbPath)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create storage: %v", err)
	}

	cleanup := func() {
		storage.Close()
		os.RemoveAll(tmpDir)
	}

	return storage, cleanup
}

func TestStorageCreateAndClose(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	if storage == nil {
		t.Fatal("Storage should not be nil")
	}
}

func TestStateOperations(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	addr := core.Address{0x01, 0x02, 0x03}
	key := core.MakeAccountKey(addr)
	value := []byte("test value")

	// Set state
	err := storage.SetState(key, value)
	if err != nil {
		t.Fatalf("Failed to set state: %v", err)
	}

	// Get state
	retrieved, err := storage.GetState(key)
	if err != nil {
		t.Fatalf("Failed to get state: %v", err)
	}

	if string(retrieved) != string(value) {
		t.Errorf("Value mismatch: got %s, expected %s", retrieved, value)
	}

	// Delete state
	err = storage.DeleteState(key)
	if err != nil {
		t.Fatalf("Failed to delete state: %v", err)
	}

	// Verify deleted
	_, err = storage.GetState(key)
	if err != ErrNotFound {
		t.Error("Should return ErrNotFound after deletion")
	}
}

func TestAccountOperations(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	addr := core.Address{0x01, 0x02, 0x03}

	// Get non-existent account (should return new empty account)
	acc, err := storage.GetAccount(addr)
	if err != nil {
		t.Fatalf("Failed to get account: %v", err)
	}

	if !acc.Balance.IsZero() {
		t.Error("New account should have zero balance")
	}

	// Modify and save account
	acc.AddBalance(core.NewBigInt(1000))
	acc.IncrementNonce()

	err = storage.SetAccount(acc)
	if err != nil {
		t.Fatalf("Failed to save account: %v", err)
	}

	// Retrieve and verify
	retrieved, err := storage.GetAccount(addr)
	if err != nil {
		t.Fatalf("Failed to get account: %v", err)
	}

	if retrieved.Balance.Cmp(core.NewBigInt(1000)) != 0 {
		t.Error("Balance mismatch")
	}

	if retrieved.Nonce != 1 {
		t.Errorf("Nonce should be 1, got %d", retrieved.Nonce)
	}
}

func TestContractCodeOperations(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	contractAddr := core.Address{0xCA, 0xFE}
	code := []byte{0x60, 0x80, 0x60, 0x40, 0x52} // Sample bytecode

	// Set code
	err := storage.SetContractCode(contractAddr, code)
	if err != nil {
		t.Fatalf("Failed to set contract code: %v", err)
	}

	// Get code
	retrieved, err := storage.GetContractCode(contractAddr)
	if err != nil {
		t.Fatalf("Failed to get contract code: %v", err)
	}

	if string(retrieved) != string(code) {
		t.Error("Code mismatch")
	}
}

func TestStorageSlotOperations(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	contractAddr := core.Address{0xCA, 0xFE}
	slot := core.Hash{0x01}
	value := []byte("slot value")

	// Set slot
	err := storage.SetStorageSlot(contractAddr, slot, value)
	if err != nil {
		t.Fatalf("Failed to set storage slot: %v", err)
	}

	// Get slot
	retrieved, err := storage.GetStorageSlot(contractAddr, slot)
	if err != nil {
		t.Fatalf("Failed to get storage slot: %v", err)
	}

	if string(retrieved) != string(value) {
		t.Error("Slot value mismatch")
	}
}

func createTestBlock(t *testing.T, number uint64, prevHash core.Hash) *core.Block {
	minerWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create miner wallet: %v", err)
	}

	minerAddr, _ := core.AddressFromHex(minerWallet.Address())
	block := core.NewBlock(number, prevHash, minerAddr)
	block.Header.StateRoot = core.Hash{byte(number)}

	if err := block.Sign(minerWallet); err != nil {
		t.Fatalf("Failed to sign block: %v", err)
	}

	return block
}

func TestBlockOperations(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	// Create and save genesis block
	genesis := createTestBlock(t, 0, core.EmptyHash())

	err := storage.SaveBlock(genesis)
	if err != nil {
		t.Fatalf("Failed to save block: %v", err)
	}

	// Get by hash
	retrieved, err := storage.GetBlock(genesis.Hash())
	if err != nil {
		t.Fatalf("Failed to get block by hash: %v", err)
	}

	if retrieved.Header.Number != 0 {
		t.Error("Block number mismatch")
	}

	// Get by number
	retrievedByNum, err := storage.GetBlockByNumber(0)
	if err != nil {
		t.Fatalf("Failed to get block by number: %v", err)
	}

	if retrievedByNum.Hash() != genesis.Hash() {
		t.Error("Block hash mismatch when getting by number")
	}
}

func TestLatestBlockNumber(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	// Initially should return error
	_, err := storage.GetLatestBlockNumber()
	if err != ErrNotFound {
		t.Error("Should return ErrNotFound initially")
	}

	// Set latest block number
	err = storage.SetLatestBlockNumber(100)
	if err != nil {
		t.Fatalf("Failed to set latest block number: %v", err)
	}

	// Retrieve
	number, err := storage.GetLatestBlockNumber()
	if err != nil {
		t.Fatalf("Failed to get latest block number: %v", err)
	}

	if number != 100 {
		t.Errorf("Latest block number should be 100, got %d", number)
	}
}

func TestBatchOperations(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	addr1 := core.Address{0x01}
	addr2 := core.Address{0x02}
	key1 := core.MakeAccountKey(addr1)
	key2 := core.MakeAccountKey(addr2)

	// Create batch
	batch := storage.NewBatch()
	batch.SetState(key1, []byte("value1"))
	batch.SetState(key2, []byte("value2"))

	// Commit batch
	err := batch.Commit()
	if err != nil {
		t.Fatalf("Failed to commit batch: %v", err)
	}

	// Verify both values exist
	val1, err := storage.GetState(key1)
	if err != nil {
		t.Fatalf("Failed to get key1: %v", err)
	}
	if string(val1) != "value1" {
		t.Error("Value1 mismatch")
	}

	val2, err := storage.GetState(key2)
	if err != nil {
		t.Fatalf("Failed to get key2: %v", err)
	}
	if string(val2) != "value2" {
		t.Error("Value2 mismatch")
	}
}

func TestIterateState(t *testing.T) {
	storage, cleanup := setupTestStorage(t)
	defer cleanup()

	// Create some accounts
	for i := 0; i < 5; i++ {
		addr := core.Address{byte(i)}
		acc := core.NewAccount(addr)
		acc.AddBalance(core.NewBigInt(int64(i * 100)))
		storage.SetAccount(acc)
	}

	// Iterate over accounts
	count := 0
	err := storage.IterateState(core.KeyTypeAccount, func(key core.StateKey, value []byte) error {
		count++
		return nil
	})

	if err != nil {
		t.Fatalf("Failed to iterate: %v", err)
	}

	if count != 5 {
		t.Errorf("Should iterate 5 accounts, got %d", count)
	}
}

func TestExportImportState(t *testing.T) {
	storage1, cleanup1 := setupTestStorage(t)
	defer cleanup1()

	// Create some state
	for i := 0; i < 3; i++ {
		addr := core.Address{byte(i)}
		acc := core.NewAccount(addr)
		acc.AddBalance(core.NewBigInt(int64((i + 1) * 100)))
		storage1.SetAccount(acc)
	}

	// Export state
	exported, err := storage1.ExportState()
	if err != nil {
		t.Fatalf("Failed to export state: %v", err)
	}

	// Create new storage and import
	storage2, cleanup2 := setupTestStorage(t)
	defer cleanup2()

	err = storage2.ImportState(exported)
	if err != nil {
		t.Fatalf("Failed to import state: %v", err)
	}

	// Verify imported data
	for i := 0; i < 3; i++ {
		addr := core.Address{byte(i)}
		acc, err := storage2.GetAccount(addr)
		if err != nil {
			t.Fatalf("Failed to get imported account: %v", err)
		}

		expectedBalance := core.NewBigInt(int64((i + 1) * 100))
		if acc.Balance.Cmp(expectedBalance) != 0 {
			t.Errorf("Balance mismatch for account %d", i)
		}
	}
}

func TestUint64Conversion(t *testing.T) {
	testCases := []uint64{0, 1, 255, 256, 65535, 4294967295, 18446744073709551615}

	for _, tc := range testCases {
		bytes := uint64ToBytes(tc)
		result := bytesToUint64(bytes)
		if result != tc {
			t.Errorf("Conversion failed for %d: got %d", tc, result)
		}
	}
}
