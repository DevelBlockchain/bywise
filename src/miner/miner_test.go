package miner

import (
	"math/big"
	"os"
	"path/filepath"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

func setupTestMiner(t *testing.T) (*Miner, *storage.Storage, func()) {
	tmpDir, err := os.MkdirTemp("", "miner-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "testdb")
	store, err := storage.NewStorage(dbPath)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create storage: %v", err)
	}

	minerWallet, err := wallet.NewWallet()
	if err != nil {
		store.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create wallet: %v", err)
	}

	miner, err := NewMiner(store, minerWallet)
	if err != nil {
		store.Close()
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create miner: %v", err)
	}

	cleanup := func() {
		miner.Stop()
		store.Close()
		os.RemoveAll(tmpDir)
	}

	return miner, store, cleanup
}

func TestNewMiner(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	if miner == nil {
		t.Fatal("Miner should not be nil")
	}

	if miner.Address.IsEmpty() {
		t.Error("Miner address should not be empty")
	}
}

func TestCalculateMinerPriority(t *testing.T) {
	lastBlockHash := core.Hash{0x01, 0x02, 0x03}

	addr1 := core.Address{0x01}
	addr2 := core.Address{0x02}

	priority1 := CalculateMinerPriority(lastBlockHash, addr1)
	priority3 := CalculateMinerPriority(lastBlockHash, addr2)

	if priority1.Sign() <= 0 {
		t.Error("Priority should be positive")
	}

	// Different addresses should have different priorities
	if priority1.Cmp(priority3) == 0 {
		t.Error("Different addresses should have different priorities")
	}
}

func TestGetMinerQueue(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	lastBlockHash := core.Hash{0x01}
	queue, err := miner.GetMinerQueue(lastBlockHash)
	if err != nil {
		t.Fatalf("Failed to get miner queue: %v", err)
	}

	// Should return at least the current miner
	if len(queue) < 1 {
		t.Errorf("Expected at least 1 miner in queue, got %d", len(queue))
	}
}

func TestIsMyTurn(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	lastBlockHash := core.Hash{0x01}
	isMyTurn, position, err := miner.IsMyTurn(lastBlockHash)
	if err != nil {
		t.Fatalf("Failed to check turn: %v", err)
	}

	// With only one miner, it should always be their turn
	if !isMyTurn {
		t.Error("Should be miner's turn when they are the only miner")
	}

	if position != 0 {
		t.Errorf("Position should be 0, got %d", position)
	}
}

func TestAddPendingTransaction(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	// Create a signed transaction using 2-step flow
	userWallet, _ := wallet.NewWallet()
	validatorWallet, _ := wallet.NewWallet()

	fromAddr, _ := core.AddressFromHex(userWallet.Address())
	validatorAddr, _ := core.AddressFromHex(validatorWallet.Address())
	toAddr := core.Address{0x02}

	// Create transaction proposal
	tx := core.NewTransactionProposal(validatorAddr, fromAddr, toAddr, core.NewBigInt(100), core.NewBigInt(1), 0, nil)
	// User signs first
	tx.SignAsUser(userWallet)
	// Validator executes and sets evidence
	tx.SetExecutionEvidence(1, map[string][]byte{}, map[string][]byte{})
	// Validator signs
	tx.SignAsValidator(validatorWallet)

	err := miner.AddPendingTransaction(tx)
	if err != nil {
		t.Fatalf("Failed to add pending transaction: %v", err)
	}

	// Verify transaction is in pending pool
	pendingTxs := miner.GetPendingTransactions(10)
	if len(pendingTxs) != 1 {
		t.Errorf("Expected 1 pending transaction, got %d", len(pendingTxs))
	}
}

func TestAddConflictingTransaction(t *testing.T) {
	miner, store, cleanup := setupTestMiner(t)
	defer cleanup()

	// Create two transactions that conflict
	userWallet, _ := wallet.NewWallet()
	validatorWallet, _ := wallet.NewWallet()

	fromAddr, _ := core.AddressFromHex(userWallet.Address())
	validatorAddr, _ := core.AddressFromHex(validatorWallet.Address())
	toAddr := core.Address{0x02}

	conflictKey := core.MakeAccountKey(fromAddr)

	// Seed the storage with initial state so ReadSet validation passes
	initialState := []byte("initial_balance")
	store.SetState(conflictKey, initialState)

	// First transaction using 2-step flow
	tx1 := core.NewTransactionProposal(validatorAddr, fromAddr, toAddr, core.NewBigInt(100), core.NewBigInt(1), 0, nil)
	tx1.SignAsUser(userWallet)
	tx1.SetExecutionEvidence(1, map[string][]byte{
		string(conflictKey): initialState, // Must match DB state
	}, map[string][]byte{
		string(conflictKey): []byte("value1"),
	})
	tx1.SignAsValidator(validatorWallet)

	// Second transaction with same write key using 2-step flow
	tx2 := core.NewTransactionProposal(validatorAddr, fromAddr, toAddr, core.NewBigInt(50), core.NewBigInt(2), 0, nil)
	tx2.SignAsUser(userWallet)
	tx2.SetExecutionEvidence(2, map[string][]byte{
		string(conflictKey): initialState, // Must match DB state
	}, map[string][]byte{
		string(conflictKey): []byte("value2"),
	})
	tx2.SignAsValidator(validatorWallet)

	// Add first transaction
	err := miner.AddPendingTransaction(tx1)
	if err != nil {
		t.Fatalf("Failed to add first transaction: %v", err)
	}

	// Second transaction should fail due to conflict (both write to same key)
	err = miner.AddPendingTransaction(tx2)
	if err != ErrConflictingTx {
		t.Errorf("Expected ErrConflictingTx, got %v", err)
	}
}

func TestCreateGenesisBlock(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	// Setup miner as active

	block, err := miner.CreateBlock()
	if err != nil {
		t.Fatalf("Failed to create genesis block: %v", err)
	}

	if block.Header.Number != 0 {
		t.Errorf("Genesis block number should be 0, got %d", block.Header.Number)
	}

	if !block.Header.PreviousHash.IsEmpty() {
		t.Error("Genesis block should have empty previous hash")
	}

	if block.Header.MinerAddress != miner.Address {
		t.Error("Block miner address should match")
	}

	if !block.VerifySignature() {
		t.Error("Block signature should be valid")
	}
}

func TestCreateSubsequentBlock(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	// Setup miner as active

	// Create and apply genesis block
	genesis, err := miner.CreateBlock()
	if err != nil {
		t.Fatalf("Failed to create genesis block: %v", err)
	}

	err = miner.ApplyBlock(genesis)
	if err != nil {
		t.Fatalf("Failed to apply genesis block: %v", err)
	}

	// Create second block
	block1, err := miner.CreateBlock()
	if err != nil {
		t.Fatalf("Failed to create block 1: %v", err)
	}

	if block1.Header.Number != 1 {
		t.Errorf("Block number should be 1, got %d", block1.Header.Number)
	}

	if block1.Header.PreviousHash != genesis.Hash() {
		t.Error("Block should reference genesis hash")
	}
}

func TestValidateBlock(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	// Setup miner as active

	// Create genesis block
	block, err := miner.CreateBlock()
	if err != nil {
		t.Fatalf("Failed to create block: %v", err)
	}

	// Validate it
	err = miner.ValidateBlock(block)
	if err != nil {
		t.Errorf("Block validation failed: %v", err)
	}
}

func TestApplyBlock(t *testing.T) {
	miner, store, cleanup := setupTestMiner(t)
	defer cleanup()

	// Setup miner as active

	// Create genesis block
	block, err := miner.CreateBlock()
	if err != nil {
		t.Fatalf("Failed to create block: %v", err)
	}

	// Apply block
	err = miner.ApplyBlock(block)
	if err != nil {
		t.Fatalf("Failed to apply block: %v", err)
	}

	// Verify latest block number updated
	latestNum, err := store.GetLatestBlockNumber()
	if err != nil {
		t.Fatalf("Failed to get latest block number: %v", err)
	}

	if latestNum != 0 {
		t.Errorf("Latest block number should be 0, got %d", latestNum)
	}

	// Verify block was saved
	savedBlock, err := store.GetBlock(block.Hash())
	if err != nil {
		t.Fatalf("Failed to get saved block: %v", err)
	}

	if savedBlock.Header.Number != block.Header.Number {
		t.Error("Saved block number mismatch")
	}
}

func TestRemoveTransactions(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	// Add some transactions using 2-step flow
	userWallet, _ := wallet.NewWallet()
	validatorWallet, _ := wallet.NewWallet()
	fromAddr, _ := core.AddressFromHex(userWallet.Address())
	validatorAddr, _ := core.AddressFromHex(validatorWallet.Address())

	txs := make([]*core.Transaction, 3)
	for i := 0; i < 3; i++ {
		toAddr := core.Address{byte(i + 1)}
		tx := core.NewTransactionProposal(validatorAddr, fromAddr, toAddr, core.NewBigInt(int64(i*100)), core.NewBigInt(int64(i+1)), 0, nil)
		tx.SignAsUser(userWallet)
		tx.SetExecutionEvidence(uint64(i), map[string][]byte{}, map[string][]byte{})
		tx.SignAsValidator(validatorWallet)
		txs[i] = tx
		miner.pendingTxs = append(miner.pendingTxs, tx)
	}

	// Remove first and third
	miner.RemoveTransactions([]*core.Transaction{txs[0], txs[2]})

	// Should only have second transaction left
	if len(miner.pendingTxs) != 1 {
		t.Errorf("Expected 1 pending transaction, got %d", len(miner.pendingTxs))
	}

	if miner.pendingTxs[0].ID != txs[1].ID {
		t.Error("Wrong transaction remaining")
	}
}

func TestGetStats(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	// Setup miner as active

	stats, err := miner.GetStats()
	if err != nil {
		t.Fatalf("Failed to get stats: %v", err)
	}

	if stats.Address != miner.Address.Hex() {
		t.Error("Stats address mismatch")
	}

	if !stats.IsActive {
		t.Error("Miner should be active")
	}
}

func TestMinerPriorityDeterminism(t *testing.T) {
	lastBlockHash := core.Hash{0x01, 0x02, 0x03}
	addr := core.Address{0x01}

	// Calculate priority multiple times
	priorities := make([]*big.Int, 10)
	for i := 0; i < 10; i++ {
		priorities[i] = CalculateMinerPriority(lastBlockHash, addr)
	}

	// All should be equal
	for i := 1; i < 10; i++ {
		if priorities[0].Cmp(priorities[i]) != 0 {
			t.Error("Priority calculation should be deterministic")
		}
	}
}

func TestMinerQueueDeterminism(t *testing.T) {
	miner, _, cleanup := setupTestMiner(t)
	defer cleanup()

	// Setup multiple miners
	for i := 0; i < 5; i++ {
		_ = core.Address{byte(i + 1)}
	}

	lastBlockHash := core.Hash{0x01}

	// Get queue multiple times
	queue1, _ := miner.GetMinerQueue(lastBlockHash)
	queue2, _ := miner.GetMinerQueue(lastBlockHash)

	// Should be same order
	for i := range queue1 {
		if queue1[i].Address != queue2[i].Address {
			t.Error("Miner queue should be deterministic")
		}
	}
}
