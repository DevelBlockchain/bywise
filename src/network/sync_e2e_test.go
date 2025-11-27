package network

import (
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/bywise/go-bywise/src/checkpoint"
	"github.com/bywise/go-bywise/src/config"
	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/miner"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

// TestE2EFullSync tests complete end-to-end blockchain synchronization
// This simulates a real-world scenario where a new node joins the network
func TestE2EFullSync(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping E2E test in short mode")
	}

	// Setup: Create bootstrap node with blockchain data
	t.Log("=== Setting up bootstrap node ===")
	bootstrapNode := setupBootstrapNode(t)
	defer bootstrapNode.Cleanup()

	if err := bootstrapNode.Start(); err != nil {
		t.Fatalf("Failed to start bootstrap node: %v", err)
	}
	defer bootstrapNode.Stop()

	// Mine some blocks on bootstrap node
	numBlocks := 25
	t.Logf("Mining %d blocks on bootstrap node...", numBlocks)
	for i := 0; i < numBlocks; i++ {
		if _, err := bootstrapNode.MineBlock(); err != nil {
			t.Fatalf("Failed to mine block %d: %v", i+1, err)
		}
	}

	latestBlock, _ := bootstrapNode.Store.GetLatestBlock()
	t.Logf("Bootstrap node at block %d", latestBlock.Header.Number)

	// Setup: Create new node that will sync
	t.Log("=== Setting up new node ===")
	newNode := setupNewNode(t, bootstrapNode.GetAddress())
	defer newNode.Cleanup()

	// Verify new node has no blockchain data
	_, err := newNode.Store.GetLatestBlock()
	if err != storage.ErrNotFound {
		t.Fatalf("Expected new node to have no blockchain data, got: %v", err)
	}
	t.Log("Confirmed: New node has no blockchain data")

	// Start new node
	if err := newNode.Start(); err != nil {
		t.Fatalf("Failed to start new node: %v", err)
	}
	defer newNode.Stop()

	// Connect to bootstrap node manually
	t.Log("Connecting to bootstrap node...")
	if err := newNode.Network.Connect(bootstrapNode.GetAddress()); err != nil {
		t.Fatalf("Failed to connect to bootstrap: %v", err)
	}

	// Wait for connection to be established
	if !waitForConnection(newNode.Network, 5*time.Second) {
		t.Fatal("Connection failed to establish")
	}
	t.Logf("Nodes connected! Peers: %d", newNode.Network.ConnectedPeerCount())

	// Perform sync
	t.Log("=== Starting blockchain synchronization ===")
	mockIPFS := checkpoint.NewMockIPFSClient()
	if err := newNode.Network.SyncBlockchainFromNetwork(mockIPFS); err != nil {
		t.Fatalf("Blockchain sync failed: %v", err)
	}

	// Verify sync completed successfully
	t.Log("=== Verifying synchronization ===")
	newNodeLatest, err := newNode.Store.GetLatestBlock()
	if err != nil {
		t.Fatalf("Failed to get latest block from new node: %v", err)
	}

	if newNodeLatest.Header.Number != latestBlock.Header.Number {
		t.Errorf("Block height mismatch: bootstrap=%d, new=%d",
			latestBlock.Header.Number, newNodeLatest.Header.Number)
	}

	// Verify block integrity
	t.Log("Verifying block integrity...")
	for i := uint64(0); i <= latestBlock.Header.Number; i++ {
		bootstrapBlock, err := bootstrapNode.Store.GetBlockByNumber(i)
		if err != nil {
			t.Fatalf("Failed to get block %d from bootstrap: %v", i, err)
		}

		newBlock, err := newNode.Store.GetBlockByNumber(i)
		if err != nil {
			t.Fatalf("Failed to get block %d from new node: %v", i, err)
		}

		if bootstrapBlock.Hash() != newBlock.Hash() {
			t.Errorf("Block %d hash mismatch:\n  bootstrap: %s\n  new:       %s",
				i, bootstrapBlock.Hash().Hex(), newBlock.Hash().Hex())
		}
	}

	t.Logf("✓ Successfully synced and verified %d blocks", latestBlock.Header.Number+1)
}

// TestE2ECheckpointSync tests synchronization with checkpoint
func TestE2ECheckpointSync(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping E2E test in short mode")
	}

	// Set checkpoint interval for testing
	originalInterval := core.CheckpointInterval
	core.SetCheckpointInterval(10) // Create checkpoint every 10 blocks
	defer core.SetCheckpointInterval(originalInterval)

	t.Log("=== Setting up bootstrap node with checkpoint ===")
	bootstrapNode := setupBootstrapNode(t)
	defer bootstrapNode.Cleanup()

	if err := bootstrapNode.Start(); err != nil {
		t.Fatalf("Failed to start bootstrap node: %v", err)
	}
	defer bootstrapNode.Stop()

	// Mine blocks to create checkpoints
	numBlocks := 25
	mockIPFS := checkpoint.NewMockIPFSClient()
	checkpointMgr := checkpoint.NewCheckpointManager(bootstrapNode.Store, mockIPFS)

	t.Logf("Mining %d blocks with checkpoints...", numBlocks)
	for i := 0; i < numBlocks; i++ {
		if _, err := bootstrapNode.MineBlock(); err != nil {
			t.Fatalf("Failed to mine block %d: %v", i+1, err)
		}

		// Create checkpoint at checkpoint intervals
		blockNum := uint64(i + 1)
		if checkpoint.ShouldCreateCheckpoint(blockNum) {
			block, _ := bootstrapNode.Store.GetBlockByNumber(blockNum)
			cid, hash, err := checkpointMgr.CreateCheckpoint(block)
			if err != nil {
				t.Fatalf("Failed to create checkpoint at block %d: %v", blockNum, err)
			}

			// Update block with checkpoint info
			block.Header.CheckpointCID = cid
			block.Header.CheckpointHash = hash
			if err := bootstrapNode.Store.SaveBlock(block); err != nil {
				t.Fatalf("Failed to update checkpoint block: %v", err)
			}

			t.Logf("Created checkpoint at block %d (CID: %s)", blockNum, cid)
		}
	}

	latestBlock, _ := bootstrapNode.Store.GetLatestBlock()
	t.Logf("Bootstrap node at block %d", latestBlock.Header.Number)

	// Setup new node
	t.Log("=== Setting up new node for checkpoint sync ===")
	newNode := setupNewNode(t, bootstrapNode.GetAddress())
	defer newNode.Cleanup()

	if err := newNode.Start(); err != nil {
		t.Fatalf("Failed to start new node: %v", err)
	}
	defer newNode.Stop()

	// Connect to bootstrap
	if err := newNode.Network.Connect(bootstrapNode.GetAddress()); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	// Wait for connection
	if !waitForConnection(newNode.Network, 5*time.Second) {
		t.Fatal("Nodes failed to connect")
	}

	// Perform sync with checkpoint support
	t.Log("=== Starting sync with checkpoint support ===")
	if err := newNode.Network.SyncBlockchainFromNetwork(mockIPFS); err != nil {
		t.Fatalf("Sync failed: %v", err)
	}

	// Verify sync
	newNodeLatest, err := newNode.Store.GetLatestBlock()
	if err != nil {
		t.Fatalf("Failed to get latest block: %v", err)
	}

	if newNodeLatest.Header.Number != latestBlock.Header.Number {
		t.Errorf("Block height mismatch: expected %d, got %d",
			latestBlock.Header.Number, newNodeLatest.Header.Number)
	}

	t.Logf("✓ Successfully synced %d blocks using checkpoints", newNodeLatest.Header.Number+1)
}

// TestE2EContinuousSync tests that new blocks are synced continuously
func TestE2EContinuousSync(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping E2E test in short mode")
	}

	t.Log("=== Setting up nodes for continuous sync test ===")
	bootstrapNode := setupBootstrapNode(t)
	defer bootstrapNode.Cleanup()

	if err := bootstrapNode.Start(); err != nil {
		t.Fatalf("Failed to start bootstrap node: %v", err)
	}
	defer bootstrapNode.Stop()

	// Mine initial blocks
	for i := 0; i < 5; i++ {
		if _, err := bootstrapNode.MineBlock(); err != nil {
			t.Fatalf("Failed to mine block: %v", err)
		}
	}

	newNode := setupNewNode(t, bootstrapNode.GetAddress())
	defer newNode.Cleanup()

	if err := newNode.Start(); err != nil {
		t.Fatalf("Failed to start new node: %v", err)
	}
	defer newNode.Stop()

	// Connect to bootstrap
	if err := newNode.Network.Connect(bootstrapNode.GetAddress()); err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	// Wait for connection and initial sync
	if !waitForConnection(newNode.Network, 5*time.Second) {
		t.Fatal("Nodes failed to connect")
	}

	mockIPFS := checkpoint.NewMockIPFSClient()
	newNode.Network.SyncBlockchainFromNetwork(mockIPFS)

	initialHeight, _ := newNode.Store.GetLatestBlock()
	t.Logf("Initial sync complete at block %d", initialHeight.Header.Number)

	// Mine more blocks on bootstrap
	t.Log("Mining additional blocks...")
	for i := 0; i < 5; i++ {
		block, err := bootstrapNode.MineBlock()
		if err != nil {
			t.Fatalf("Failed to mine block: %v", err)
		}

		// Broadcast block to network
		bootstrapNode.Network.BroadcastBlock(block)
		time.Sleep(100 * time.Millisecond) // Give time for propagation
	}

	// Give time for blocks to propagate
	time.Sleep(2 * time.Second)

	// Verify new node received new blocks
	finalHeight, err := newNode.Store.GetLatestBlock()
	if err != nil {
		t.Fatalf("Failed to get latest block: %v", err)
	}

	bootstrapHeight, _ := bootstrapNode.Store.GetLatestBlock()
	if finalHeight.Header.Number < initialHeight.Header.Number+3 {
		t.Errorf("New node didn't receive enough new blocks: initial=%d, final=%d, expected>=%d",
			initialHeight.Header.Number, finalHeight.Header.Number, initialHeight.Header.Number+3)
	}

	t.Logf("✓ Continuous sync working: %d -> %d (bootstrap at %d)",
		initialHeight.Header.Number, finalHeight.Header.Number, bootstrapHeight.Header.Number)
}

// Helper types and functions

type TestNode struct {
	TempDir string
	Wallet  *wallet.Wallet
	Store   *storage.Storage
	Network *Network
	Miner   *miner.Miner
	Handler *BlockchainHandler
}

func (n *TestNode) Start() error {
	return n.Network.Start()
}

func (n *TestNode) Stop() error {
	return n.Network.Stop()
}

func (n *TestNode) Cleanup() {
	if n.Store != nil {
		n.Store.Close()
	}
	if n.Network != nil {
		n.Network.Stop()
	}
}

func (n *TestNode) GetAddress() string {
	return n.Network.GetAddress()
}

func (n *TestNode) MineBlock() (*core.Block, error) {
	latestBlock, err := n.Store.GetLatestBlock()
	if err != nil && err != storage.ErrNotFound {
		return nil, err
	}

	var blockNum uint64 = 0
	var prevHash core.Hash
	if latestBlock != nil {
		blockNum = latestBlock.Header.Number + 1
		prevHash = latestBlock.Hash()
	}

	minerAddr, _ := core.AddressFromHex(n.Wallet.Address())
	block := &core.Block{
		Header: core.BlockHeader{
			Number:       blockNum,
			PreviousHash: prevHash,
			Timestamp:    time.Now().Unix(),
			MinerAddress: minerAddr,
		},
		Transactions: []*core.Transaction{},
	}

	if err := block.Sign(n.Wallet); err != nil {
		return nil, err
	}

	if err := n.Store.SaveBlock(block); err != nil {
		return nil, err
	}

	if err := n.Store.SetLatestBlockNumber(blockNum); err != nil {
		return nil, err
	}

	return block, nil
}

func setupBootstrapNode(t *testing.T) *TestNode {
	tmpDir := filepath.Join(t.TempDir(), "bootstrap")
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	chainParams := core.DefaultChainParams()
	if err := store.SetChainParams(chainParams); err != nil {
		t.Fatalf("Failed to set chain params: %v", err)
	}

	minerAddr, _ := core.AddressFromHex(w.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr)
	if err := genesisBlock.Sign(w); err != nil {
		t.Fatalf("Failed to sign genesis: %v", err)
	}
	if err := store.SaveBlock(genesisBlock); err != nil {
		t.Fatalf("Failed to save genesis: %v", err)
	}
	if err := store.SetLatestBlockNumber(0); err != nil {
		t.Fatalf("Failed to set latest block: %v", err)
	}

	cfg := config.DefaultConfig()
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 19000
	cfg.TLS.AutoGenerate = true

	net, err := NewNetwork(cfg)
	if err != nil {
		t.Fatalf("Failed to create network: %v", err)
	}

	m, err := miner.NewMiner(store, w)
	if err != nil {
		t.Fatalf("Failed to create miner: %v", err)
	}

	handler := NewBlockchainHandler(net, store, m)
	net.SetBlockchainHandler(handler)

	return &TestNode{
		TempDir: tmpDir,
		Wallet:  w,
		Store:   store,
		Network: net,
		Miner:   m,
		Handler: handler,
	}
}

func setupNewNode(t *testing.T, bootstrapAddr string) *TestNode {
	tmpDir := filepath.Join(t.TempDir(), "newnode")
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	// Initialize with chain params but no genesis block
	// The node will sync the genesis from the network
	chainParams := core.DefaultChainParams()
	if err := store.SetChainParams(chainParams); err != nil {
		t.Fatalf("Failed to set chain params: %v", err)
	}

	cfg := config.DefaultConfig()
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 19001
	cfg.TLS.AutoGenerate = true

	net, err := NewNetwork(cfg)
	if err != nil {
		t.Fatalf("Failed to create network: %v", err)
	}

	m, err := miner.NewMiner(store, w)
	if err != nil {
		t.Fatalf("Failed to create miner: %v", err)
	}

	handler := NewBlockchainHandler(net, store, m)
	net.SetBlockchainHandler(handler)

	return &TestNode{
		TempDir: tmpDir,
		Wallet:  w,
		Store:   store,
		Network: net,
		Miner:   m,
		Handler: handler,
	}
}

func waitForConnection(net *Network, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if net.ConnectedPeerCount() > 0 {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return false
}

// TestE2EMultipleNodes tests sync with multiple bootstrap nodes
func TestE2EMultipleNodes(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping E2E test in short mode")
	}

	t.Log("=== Setting up multiple bootstrap nodes ===")

	// Setup 3 bootstrap nodes
	nodes := make([]*TestNode, 3)
	for i := 0; i < 3; i++ {
		nodes[i] = setupBootstrapNodeWithPort(t, 19100+i)
		defer nodes[i].Cleanup()

		if err := nodes[i].Start(); err != nil {
			t.Fatalf("Failed to start node %d: %v", i, err)
		}
		defer nodes[i].Stop()

		// Mine some blocks on each
		for j := 0; j < 5+i*2; j++ {
			if _, err := nodes[i].MineBlock(); err != nil {
				t.Fatalf("Failed to mine block on node %d: %v", i, err)
			}
		}

		latest, _ := nodes[i].Store.GetLatestBlock()
		t.Logf("Node %d at block %d", i, latest.Header.Number)
	}

	// Find node with highest block
	var maxHeight uint64
	var maxNode int
	for i, node := range nodes {
		latest, _ := node.Store.GetLatestBlock()
		if latest.Header.Number > maxHeight {
			maxHeight = latest.Header.Number
			maxNode = i
		}
	}
	t.Logf("Node %d has highest block: %d", maxNode, maxHeight)

	// Setup new node with all 3 as bootstrap
	tmpDir := filepath.Join(t.TempDir(), "multinode")
	w, _ := wallet.NewWallet()
	store, _ := storage.NewStorage(tmpDir)
	defer store.Close()

	cfg := config.DefaultConfig()
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = 19200
	cfg.TLS.AutoGenerate = true

	net, _ := NewNetwork(cfg)
	m, _ := miner.NewMiner(store, w)
	handler := NewBlockchainHandler(net, store, m)
	net.SetBlockchainHandler(handler)

	if err := net.Start(); err != nil {
		t.Fatalf("Failed to start new node: %v", err)
	}
	defer net.Stop()

	// Connect to all bootstrap nodes
	for i := range nodes {
		addr := fmt.Sprintf("127.0.0.1:%d", 19100+i)
		if err := net.Connect(addr); err != nil {
			t.Logf("Failed to connect to node %d: %v", i, err)
		}
	}

	// Wait for connections
	time.Sleep(2 * time.Second)
	t.Logf("Connected to %d peers", net.ConnectedPeerCount())

	// Sync
	mockIPFS := checkpoint.NewMockIPFSClient()
	if err := net.SyncBlockchainFromNetwork(mockIPFS); err != nil {
		t.Fatalf("Sync failed: %v", err)
	}

	// Verify synced to highest
	latest, _ := store.GetLatestBlock()
	if latest.Header.Number != maxHeight {
		t.Errorf("Expected to sync to block %d, got %d", maxHeight, latest.Header.Number)
	}

	t.Logf("✓ Successfully synced from multiple nodes to block %d", latest.Header.Number)
}

func setupBootstrapNodeWithPort(t *testing.T, port int) *TestNode {
	tmpDir := filepath.Join(t.TempDir(), fmt.Sprintf("node-%d", port))
	w, _ := wallet.NewWallet()
	store, _ := storage.NewStorage(tmpDir)

	chainParams := core.DefaultChainParams()
	store.SetChainParams(chainParams)

	minerAddr, _ := core.AddressFromHex(w.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr)
	genesisBlock.Sign(w)
	store.SaveBlock(genesisBlock)
	store.SetLatestBlockNumber(0)

	cfg := config.DefaultConfig()
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = port
	cfg.TLS.AutoGenerate = true

	net, _ := NewNetwork(cfg)
	m, _ := miner.NewMiner(store, w)
	handler := NewBlockchainHandler(net, store, m)
	net.SetBlockchainHandler(handler)

	return &TestNode{
		TempDir: tmpDir,
		Wallet:  w,
		Store:   store,
		Network: net,
		Miner:   m,
		Handler: handler,
	}
}
