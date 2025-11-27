package checkpoint

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

func setupTestCheckpointManager(t *testing.T) (*CheckpointManager, *storage.Storage, func()) {
	tmpDir, err := os.MkdirTemp("", "checkpoint-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "testdb")
	store, err := storage.NewStorage(dbPath)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create storage: %v", err)
	}

	mockIPFS := NewMockIPFSClient()
	cm := NewCheckpointManager(store, mockIPFS)

	cleanup := func() {
		store.Close()
		os.RemoveAll(tmpDir)
	}

	return cm, store, cleanup
}

func TestTSONEncodeDecode(t *testing.T) {
	encoder := NewTSONEncoder()

	// Create some test state
	state := map[string][]byte{
		"s:" + string(core.MakeAccountKey(core.Address{0x01})):           []byte(`{"balance":"1000"}`),
		"s:" + string(core.MakeAccountKey(core.Address{0x02})):           []byte(`{"balance":"2000"}`),
		"s:" + string(core.MakeStakeKey(core.Address{0x01})):             []byte(`{"stake":"5000"}`),
		"s:" + string(core.MakeCodeKey(core.Address{0xCA})):              []byte{0x60, 0x80, 0x60, 0x40},
		"s:" + string(core.MakeStorageKey(core.Address{0xCA}, core.Hash{0x01})): []byte("slot_value"),
	}

	blockNumber := uint64(50000)
	blockHash := core.Hash{0x01, 0x02, 0x03}
	stateRoot := core.Hash{0x04, 0x05, 0x06}
	timestamp := int64(1700000000)

	// Encode
	snapshot, err := encoder.Encode(state, blockNumber, blockHash, stateRoot, timestamp)
	if err != nil {
		t.Fatalf("Failed to encode: %v", err)
	}

	if snapshot.BlockNumber != blockNumber {
		t.Errorf("Block number mismatch")
	}

	if snapshot.EntriesCount != len(state) {
		t.Errorf("Entries count mismatch: expected %d, got %d", len(state), snapshot.EntriesCount)
	}

	// Decode
	decodedState, err := encoder.Decode(snapshot)
	if err != nil {
		t.Fatalf("Failed to decode: %v", err)
	}

	if len(decodedState) != len(state) {
		t.Errorf("Decoded state size mismatch: expected %d, got %d", len(state), len(decodedState))
	}

	// Verify values match
	for k, v := range state {
		decodedV, exists := decodedState[k]
		if !exists {
			t.Errorf("Key %s missing from decoded state", k)
			continue
		}
		if string(v) != string(decodedV) {
			t.Errorf("Value mismatch for key %s", k)
		}
	}
}

func TestSnapshotSerialization(t *testing.T) {
	encoder := NewTSONEncoder()

	state := map[string][]byte{
		"s:" + string(core.MakeAccountKey(core.Address{0x01})): []byte(`{"balance":"1000"}`),
	}

	snapshot, _ := encoder.Encode(state, 100, core.Hash{0x01}, core.Hash{0x02}, 1700000000)

	// Serialize
	data, err := SerializeSnapshot(snapshot)
	if err != nil {
		t.Fatalf("Failed to serialize: %v", err)
	}

	// Deserialize
	restored, err := DeserializeSnapshot(data)
	if err != nil {
		t.Fatalf("Failed to deserialize: %v", err)
	}

	if restored.BlockNumber != snapshot.BlockNumber {
		t.Error("Block number mismatch after serialization")
	}

	if restored.EntriesCount != snapshot.EntriesCount {
		t.Error("Entries count mismatch after serialization")
	}
}

func TestSnapshotHash(t *testing.T) {
	encoder := NewTSONEncoder()

	state := map[string][]byte{
		"s:" + string(core.MakeAccountKey(core.Address{0x01})): []byte(`{"balance":"1000"}`),
	}

	snapshot, _ := encoder.Encode(state, 100, core.Hash{0x01}, core.Hash{0x02}, 1700000000)

	// Calculate hash
	hash1, err := CalculateSnapshotHash(snapshot)
	if err != nil {
		t.Fatalf("Failed to calculate hash: %v", err)
	}

	// Hash should be deterministic
	hash2, _ := CalculateSnapshotHash(snapshot)
	if hash1 != hash2 {
		t.Error("Hash should be deterministic")
	}

	// Different snapshot should have different hash
	differentSnapshot, _ := encoder.Encode(state, 101, core.Hash{0x01}, core.Hash{0x02}, 1700000000)
	hash3, _ := CalculateSnapshotHash(differentSnapshot)
	if hash1 == hash3 {
		t.Error("Different snapshots should have different hashes")
	}
}

func TestValidateSnapshot(t *testing.T) {
	encoder := NewTSONEncoder()

	state := map[string][]byte{
		"s:" + string(core.MakeAccountKey(core.Address{0x01})): []byte(`{"balance":"1000"}`),
	}

	snapshot, _ := encoder.Encode(state, 100, core.Hash{0x01}, core.Hash{0x02}, 1700000000)
	hash, _ := CalculateSnapshotHash(snapshot)

	// Valid snapshot should pass
	err := ValidateSnapshot(snapshot, hash)
	if err != nil {
		t.Errorf("Valid snapshot failed validation: %v", err)
	}

	// Wrong hash should fail
	wrongHash := core.Hash{0xFF}
	err = ValidateSnapshot(snapshot, wrongHash)
	if err == nil {
		t.Error("Should fail with wrong hash")
	}

	// Tampered snapshot should fail
	tamperedSnapshot := *snapshot
	tamperedSnapshot.EntriesCount = 999
	err = ValidateSnapshot(&tamperedSnapshot, hash)
	if err == nil {
		t.Error("Should fail with tampered entries count")
	}
}

func TestMockIPFSClient(t *testing.T) {
	ipfs := NewMockIPFSClient()

	data := []byte("test data")

	// Add
	cid, err := ipfs.Add(data)
	if err != nil {
		t.Fatalf("Failed to add: %v", err)
	}

	if cid == "" {
		t.Error("CID should not be empty")
	}

	// Get
	retrieved, err := ipfs.Get(cid)
	if err != nil {
		t.Fatalf("Failed to get: %v", err)
	}

	if string(retrieved) != string(data) {
		t.Error("Retrieved data doesn't match")
	}

	// Pin
	err = ipfs.Pin(cid)
	if err != nil {
		t.Errorf("Failed to pin: %v", err)
	}

	// Get non-existent
	_, err = ipfs.Get("nonexistent")
	if err == nil {
		t.Error("Should fail for non-existent CID")
	}
}

func TestShouldCreateCheckpoint(t *testing.T) {
	testCases := []struct {
		blockNumber uint64
		shouldCreate bool
	}{
		{0, false},
		{1, false},
		{50000, true},
		{50001, false},
		{100000, true},
		{99999, false},
	}

	for _, tc := range testCases {
		result := ShouldCreateCheckpoint(tc.blockNumber)
		if result != tc.shouldCreate {
			t.Errorf("ShouldCreateCheckpoint(%d) = %v, expected %v",
				tc.blockNumber, result, tc.shouldCreate)
		}
	}
}

func TestGetCheckpointStateBlockNumber(t *testing.T) {
	testCases := []struct {
		checkpointBlock uint64
		stateBlock      uint64
	}{
		{50000, 0},
		{100000, 50000},
		{150000, 100000},
	}

	for _, tc := range testCases {
		result := GetCheckpointStateBlockNumber(tc.checkpointBlock)
		if result != tc.stateBlock {
			t.Errorf("GetCheckpointStateBlockNumber(%d) = %d, expected %d",
				tc.checkpointBlock, result, tc.stateBlock)
		}
	}
}

func TestCreateAndValidateCheckpoint(t *testing.T) {
	cm, store, cleanup := setupTestCheckpointManager(t)
	defer cleanup()

	// Create some accounts
	for i := 0; i < 5; i++ {
		addr := core.Address{byte(i)}
		acc := core.NewAccount(addr)
		acc.AddBalance(core.NewBigInt(int64((i + 1) * 1000)))
		store.SetAccount(acc)
	}

	// Create a mock wallet for signing
	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := core.AddressFromHex(minerWallet.Address())

	// Create genesis block (block 0) - need this for state reference
	genesis := core.NewBlock(0, core.EmptyHash(), minerAddr)
	genesis.Header.StateRoot = core.Hash{0x01}
	genesis.Sign(minerWallet)
	store.SaveBlock(genesis)
	store.SetLatestBlockNumber(0)

	// Create checkpoint block (block 50000)
	checkpointBlock := core.NewBlock(core.CheckpointInterval, genesis.Hash(), minerAddr)
	checkpointBlock.Header.StateRoot = core.Hash{0x02}

	// Create checkpoint
	cid, hash, err := cm.CreateCheckpoint(checkpointBlock)
	if err != nil {
		t.Fatalf("Failed to create checkpoint: %v", err)
	}

	if cid == "" {
		t.Error("CID should not be empty")
	}

	if hash.IsEmpty() {
		t.Error("Hash should not be empty")
	}

	// Set checkpoint info on block
	checkpointBlock.SetCheckpoint(cid, hash)
	checkpointBlock.Sign(minerWallet)
	store.SaveBlock(checkpointBlock)

	// Validate checkpoint
	err = cm.ValidateCheckpoint(checkpointBlock)
	if err != nil {
		t.Errorf("Checkpoint validation failed: %v", err)
	}
}

func TestLoadCheckpoint(t *testing.T) {
	cm1, store1, cleanup1 := setupTestCheckpointManager(t)
	defer cleanup1()

	// Create some state
	for i := 0; i < 3; i++ {
		addr := core.Address{byte(i)}
		acc := core.NewAccount(addr)
		acc.AddBalance(core.NewBigInt(int64((i + 1) * 1000)))
		store1.SetAccount(acc)
	}

	// Create mock wallet
	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := core.AddressFromHex(minerWallet.Address())

	// Create genesis block
	genesis := core.NewBlock(0, core.EmptyHash(), minerAddr)
	genesis.Sign(minerWallet)
	store1.SaveBlock(genesis)
	store1.SetLatestBlockNumber(0)

	// Create checkpoint
	checkpointBlock := core.NewBlock(core.CheckpointInterval, genesis.Hash(), minerAddr)
	cid, hash, err := cm1.CreateCheckpoint(checkpointBlock)
	if err != nil {
		t.Fatalf("Failed to create checkpoint: %v", err)
	}

	// Create second checkpoint manager with shared IPFS (simulating another node)
	// In real scenario, both would connect to same IPFS network
	cm2, store2, cleanup2 := setupTestCheckpointManager(t)
	defer cleanup2()

	// Copy IPFS data (simulating network fetch)
	mockIPFS1 := cm1.ipfs.(*MockIPFSClient)
	mockIPFS2 := cm2.ipfs.(*MockIPFSClient)
	data, _ := mockIPFS1.Get(cid)
	mockIPFS2.Add(data)

	// Load checkpoint into second storage
	err = cm2.LoadCheckpoint(cid, hash)
	if err != nil {
		t.Fatalf("Failed to load checkpoint: %v", err)
	}

	// Verify state was imported
	for i := 0; i < 3; i++ {
		addr := core.Address{byte(i)}
		acc, err := store2.GetAccount(addr)
		if err != nil {
			t.Fatalf("Failed to get account %d: %v", i, err)
		}

		expectedBalance := core.NewBigInt(int64((i + 1) * 1000))
		if acc.Balance.Cmp(expectedBalance) != 0 {
			t.Errorf("Balance mismatch for account %d", i)
		}
	}
}

func TestCreateCheckpointNonCheckpointBlock(t *testing.T) {
	cm, _, cleanup := setupTestCheckpointManager(t)
	defer cleanup()

	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := core.AddressFromHex(minerWallet.Address())

	// Block 100 is not a checkpoint block
	block := core.NewBlock(100, core.EmptyHash(), minerAddr)

	_, _, err := cm.CreateCheckpoint(block)
	if err != ErrNotCheckpointBlock {
		t.Errorf("Expected ErrNotCheckpointBlock, got %v", err)
	}
}

func TestGetCheckpointInfo(t *testing.T) {
	cm, store, cleanup := setupTestCheckpointManager(t)
	defer cleanup()

	// Create some state
	addr := core.Address{0x01}
	acc := core.NewAccount(addr)
	acc.AddBalance(core.NewBigInt(1000))
	store.SetAccount(acc)

	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := core.AddressFromHex(minerWallet.Address())

	genesis := core.NewBlock(0, core.EmptyHash(), minerAddr)
	genesis.Sign(minerWallet)
	store.SaveBlock(genesis)
	store.SetLatestBlockNumber(0)

	checkpointBlock := core.NewBlock(core.CheckpointInterval, genesis.Hash(), minerAddr)
	cid, _, _ := cm.CreateCheckpoint(checkpointBlock)

	// Get info
	info, err := cm.GetCheckpointInfo(cid)
	if err != nil {
		t.Fatalf("Failed to get info: %v", err)
	}

	if info.CID != cid {
		t.Error("CID mismatch")
	}

	if info.BlockNumber != 0 {
		t.Errorf("Block number should be 0, got %d", info.BlockNumber)
	}

	if info.EntriesCount < 1 {
		t.Error("Should have at least 1 entry")
	}
}
