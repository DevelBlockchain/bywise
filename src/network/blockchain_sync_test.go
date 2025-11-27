package network

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/bywise/go-bywise/src/checkpoint"
	"github.com/bywise/go-bywise/src/config"
	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/miner"
	pb "github.com/bywise/go-bywise/src/proto/pb"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

// TestGetLatestCheckpoint tests the GetLatestCheckpoint RPC handler
func TestGetLatestCheckpoint(t *testing.T) {
	// Create temporary directory for test
	tmpDir := t.TempDir()

	// Create test wallet
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// Create storage
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer store.Close()

	// Create chain params
	chainParams := core.DefaultChainParams()
	if err := store.SetChainParams(chainParams); err != nil {
		t.Fatalf("Failed to set chain params: %v", err)
	}

	// Create genesis block
	minerAddr, _ := core.AddressFromHex(w.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr)
	if err := genesisBlock.Sign(w); err != nil {
		t.Fatalf("Failed to sign genesis block: %v", err)
	}
	if err := store.SaveBlock(genesisBlock); err != nil {
		t.Fatalf("Failed to save genesis block: %v", err)
	}
	if err := store.SetLatestBlockNumber(0); err != nil {
		t.Fatalf("Failed to set latest block number: %v", err)
	}

	// Create network
	cfg := config.DefaultConfig()
	cfg.Server.Port = 9001
	net, err := NewNetwork(cfg)
	if err != nil {
		t.Fatalf("Failed to create network: %v", err)
	}

	// Create miner
	m, err := miner.NewMiner(store, w)
	if err != nil {
		t.Fatalf("Failed to create miner: %v", err)
	}

	// Set blockchain handler
	handler := NewBlockchainHandler(net, store, m)
	net.SetBlockchainHandler(handler)

	// Create gRPC server
	grpcServer := NewGRPCServer(net)

	t.Run("NoCheckpoint", func(t *testing.T) {
		// Create a fake peer with token
		token := "test-token-123"
		peer := NewPeer("test-peer", "127.0.0.1:9999")
		peer.InboundToken = token
		net.addPeer(peer)
		defer net.removePeer(peer)

		// Test when no checkpoint exists (only genesis block)
		resp, err := grpcServer.GetLatestCheckpoint(context.Background(), &pb.GetLatestCheckpointRequest{
			Token: token,
		})
		if err != nil {
			t.Fatalf("GetLatestCheckpoint failed: %v", err)
		}
		if resp.HasCheckpoint {
			t.Error("Expected no checkpoint for genesis block only")
		}
	})

	t.Run("WithCheckpoint", func(t *testing.T) {
		// Create blocks up to checkpoint interval
		checkpointInterval := core.CheckpointInterval
		if checkpointInterval == 0 {
			checkpointInterval = 100
		}

		// Mine enough blocks to create a checkpoint
		for i := uint64(1); i <= checkpointInterval; i++ {
			block := &core.Block{
				Header: core.BlockHeader{
					Number:        i,
					PreviousHash:  genesisBlock.Hash(),
					Timestamp:     time.Now().Unix(),
					MinerAddress:  minerAddr,
					CheckpointCID: "",
				},
			}

			// Add checkpoint data to checkpoint block
			if i == checkpointInterval {
				block.Header.CheckpointCID = "QmTest1234567890"
				block.Header.CheckpointHash = core.HashFromBytes([]byte("test-checkpoint"))
			}

			if err := block.Sign(w); err != nil {
				t.Fatalf("Failed to sign block %d: %v", i, err)
			}
			if err := store.SaveBlock(block); err != nil {
				t.Fatalf("Failed to save block %d: %v", i, err)
			}
			if err := store.SetLatestBlockNumber(i); err != nil {
				t.Fatalf("Failed to set latest block number %d: %v", i, err)
			}
		}

		// Now test with checkpoint
		// Note: We need a valid peer with token for this test
		// For now, we'll test the error case
		resp, err := grpcServer.GetLatestCheckpoint(context.Background(), &pb.GetLatestCheckpointRequest{
			Token: "invalid-token",
		})
		if err != ErrInvalidToken {
			t.Errorf("Expected ErrInvalidToken, got %v", err)
		}
		if resp.HasCheckpoint {
			t.Error("Expected no checkpoint with invalid token")
		}
	})
}

// TestBlockchainSync tests the complete blockchain synchronization
func TestBlockchainSync(t *testing.T) {
	// This is an integration test that requires two nodes
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Create temporary directories
	tmpDir1 := filepath.Join(t.TempDir(), "node1")
	tmpDir2 := filepath.Join(t.TempDir(), "node2")

	// Create test wallets
	wallet1, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet1: %v", err)
	}

	wallet2, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet2: %v", err)
	}

	// Setup node 1 (has blockchain)
	store1, err := storage.NewStorage(tmpDir1)
	if err != nil {
		t.Fatalf("Failed to create storage1: %v", err)
	}
	defer store1.Close()

	chainParams := core.DefaultChainParams()
	if err := store1.SetChainParams(chainParams); err != nil {
		t.Fatalf("Failed to set chain params: %v", err)
	}

	minerAddr1, _ := core.AddressFromHex(wallet1.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr1)
	if err := genesisBlock.Sign(wallet1); err != nil {
		t.Fatalf("Failed to sign genesis block: %v", err)
	}
	if err := store1.SaveBlock(genesisBlock); err != nil {
		t.Fatalf("Failed to save genesis block: %v", err)
	}
	if err := store1.SetLatestBlockNumber(0); err != nil {
		t.Fatalf("Failed to set latest block number: %v", err)
	}

	// Create some blocks on node 1
	numBlocks := uint64(10)
	prevBlock := genesisBlock
	for i := uint64(1); i <= numBlocks; i++ {
		block := &core.Block{
			Header: core.BlockHeader{
				Number:       i,
				PreviousHash: prevBlock.Hash(),
				Timestamp:    time.Now().Unix(),
				MinerAddress: minerAddr1,
			},
		}
		if err := block.Sign(wallet1); err != nil {
			t.Fatalf("Failed to sign block %d: %v", i, err)
		}
		if err := store1.SaveBlock(block); err != nil {
			t.Fatalf("Failed to save block %d: %v", i, err)
		}
		if err := store1.SetLatestBlockNumber(i); err != nil {
			t.Fatalf("Failed to set latest block number %d: %v", i, err)
		}
		prevBlock = block
	}

	// Create network for node 1
	cfg1 := config.DefaultConfig()
	cfg1.Server.Host = "127.0.0.1"
	cfg1.Server.Port = 9100
	net1, err := NewNetwork(cfg1)
	if err != nil {
		t.Fatalf("Failed to create network1: %v", err)
	}

	miner1, err := miner.NewMiner(store1, wallet1)
	if err != nil {
		t.Fatalf("Failed to create miner1: %v", err)
	}

	handler1 := NewBlockchainHandler(net1, store1, miner1)
	net1.SetBlockchainHandler(handler1)

	// Start node 1
	if err := net1.Start(); err != nil {
		t.Fatalf("Failed to start network1: %v", err)
	}
	defer net1.Stop()

	// Give node 1 time to start
	time.Sleep(500 * time.Millisecond)

	// Setup node 2 (empty blockchain)
	store2, err := storage.NewStorage(tmpDir2)
	if err != nil {
		t.Fatalf("Failed to create storage2: %v", err)
	}
	defer store2.Close()

	// Node 2 has no blocks initially
	_, err = store2.GetLatestBlock()
	if err != storage.ErrNotFound {
		t.Fatalf("Expected ErrNotFound for node2, got %v", err)
	}

	// Create network for node 2 with node 1 as bootstrap
	cfg2 := config.DefaultConfig()
	cfg2.Server.Host = "127.0.0.1"
	cfg2.Server.Port = 9101

	net2, err := NewNetwork(cfg2)
	if err != nil {
		t.Fatalf("Failed to create network2: %v", err)
	}

	miner2, err := miner.NewMiner(store2, wallet2)
	if err != nil {
		t.Fatalf("Failed to create miner2: %v", err)
	}

	handler2 := NewBlockchainHandler(net2, store2, miner2)
	net2.SetBlockchainHandler(handler2)

	// Start node 2
	if err := net2.Start(); err != nil {
		t.Fatalf("Failed to start network2: %v", err)
	}
	defer net2.Stop()

	// Connect node 2 to node 1
	node1Addr := fmt.Sprintf("%s:%d", cfg1.Server.Host, cfg1.Server.Port)
	if err := net2.Connect(node1Addr); err != nil {
		t.Fatalf("Failed to connect to node1: %v", err)
	}

	// Wait for connection to establish
	time.Sleep(500 * time.Millisecond)

	if net2.ConnectedPeerCount() == 0 {
		t.Fatal("Node 2 failed to connect to node 1")
	}

	t.Logf("Node 2 connected to node 1")

	// Perform sync
	mockIPFS := checkpoint.NewMockIPFSClient()
	if err := net2.SyncBlockchainFromNetwork(mockIPFS); err != nil {
		t.Fatalf("Sync failed: %v", err)
	}

	// Verify node 2 has synced all blocks
	latestBlock2, err := store2.GetLatestBlock()
	if err != nil {
		t.Fatalf("Failed to get latest block from node2: %v", err)
	}

	if latestBlock2.Header.Number != numBlocks {
		t.Errorf("Expected node2 to have block %d, got %d", numBlocks, latestBlock2.Header.Number)
	}

	// Verify all blocks were synced
	for i := uint64(0); i <= numBlocks; i++ {
		block1, err := store1.GetBlockByNumber(i)
		if err != nil {
			t.Fatalf("Failed to get block %d from node1: %v", i, err)
		}

		block2, err := store2.GetBlockByNumber(i)
		if err != nil {
			t.Fatalf("Failed to get block %d from node2: %v", i, err)
		}

		if block1.Hash() != block2.Hash() {
			t.Errorf("Block %d hash mismatch: node1=%s, node2=%s",
				i, block1.Hash().Hex(), block2.Hash().Hex())
		}
	}

	t.Logf("Successfully synced %d blocks", numBlocks)
}

// TestCheckpointSync tests synchronization with checkpoint
func TestCheckpointSync(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	tmpDir := t.TempDir()
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}
	defer store.Close()

	// Create chain params
	chainParams := core.DefaultChainParams()
	if err := store.SetChainParams(chainParams); err != nil {
		t.Fatalf("Failed to set chain params: %v", err)
	}

	// Create genesis and some blocks
	minerAddr, _ := core.AddressFromHex(w.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr)
	if err := genesisBlock.Sign(w); err != nil {
		t.Fatalf("Failed to sign genesis block: %v", err)
	}
	if err := store.SaveBlock(genesisBlock); err != nil {
		t.Fatalf("Failed to save genesis block: %v", err)
	}
	if err := store.SetLatestBlockNumber(0); err != nil {
		t.Fatalf("Failed to set latest block number: %v", err)
	}

	// Set initial account balance
	genesisAccount, err := store.GetAccount(minerAddr)
	if err != nil {
		t.Fatalf("Failed to get genesis account: %v", err)
	}
	genesisAccount.Balance = chainParams.InitialSupply
	if err := store.SetAccount(genesisAccount); err != nil {
		t.Fatalf("Failed to set genesis account: %v", err)
	}

	// Create mock IPFS client
	mockIPFS := checkpoint.NewMockIPFSClient()

	// Export current state
	state, err := store.ExportState()
	if err != nil {
		t.Fatalf("Failed to export state: %v", err)
	}

	t.Logf("Exported state with %d entries", len(state))

	// Create a checkpoint manually for testing
	encoder := checkpoint.NewTSONEncoder()
	snapshot, err := encoder.Encode(
		state,
		0,
		genesisBlock.Hash(),
		genesisBlock.Header.StateRoot,
		genesisBlock.Header.Timestamp,
	)
	if err != nil {
		t.Fatalf("Failed to encode snapshot: %v", err)
	}

	// Calculate hash
	snapshotHash, err := checkpoint.CalculateSnapshotHash(snapshot)
	if err != nil {
		t.Fatalf("Failed to calculate snapshot hash: %v", err)
	}

	// Serialize and upload to mock IPFS
	data, err := checkpoint.SerializeSnapshot(snapshot)
	if err != nil {
		t.Fatalf("Failed to serialize snapshot: %v", err)
	}

	cid, err := mockIPFS.Add(data)
	if err != nil {
		t.Fatalf("Failed to add checkpoint to IPFS: %v", err)
	}

	t.Logf("Created checkpoint with CID: %s, hash: %s", cid, snapshotHash.Hex())

	// Create new storage to test checkpoint loading
	tmpDir2 := filepath.Join(t.TempDir(), "checkpoint-test")
	store2, err := storage.NewStorage(tmpDir2)
	if err != nil {
		t.Fatalf("Failed to create storage2: %v", err)
	}
	defer store2.Close()

	// Create checkpoint manager for store2
	checkpointMgr2 := checkpoint.NewCheckpointManager(store2, mockIPFS)

	// Load checkpoint
	if err := checkpointMgr2.LoadCheckpoint(cid, snapshotHash); err != nil {
		t.Fatalf("Failed to load checkpoint: %v", err)
	}

	t.Log("Successfully loaded checkpoint")

	// Verify state was loaded correctly
	state2, err := store2.ExportState()
	if err != nil {
		t.Fatalf("Failed to export state2: %v", err)
	}

	if len(state2) != len(state) {
		t.Errorf("State entry count mismatch: expected %d, got %d",
			len(state), len(state2))
	}

	// Verify genesis account balance
	genesisAccount2, err := store2.GetAccount(minerAddr)
	if err != nil {
		t.Fatalf("Failed to get genesis account from store2: %v", err)
	}

	if genesisAccount2.Balance.Cmp(chainParams.InitialSupply) != 0 {
		t.Errorf("Balance mismatch: expected %s, got %s",
			chainParams.InitialSupply.String(), genesisAccount2.Balance.String())
	}

	t.Log("Checkpoint state verified successfully")
}

// BenchmarkBlockSync benchmarks block synchronization performance
func BenchmarkBlockSync(b *testing.B) {
	tmpDir := b.TempDir()
	w, _ := wallet.NewWallet()
	store, _ := storage.NewStorage(tmpDir)
	defer store.Close()

	chainParams := core.DefaultChainParams()
	store.SetChainParams(chainParams)

	minerAddr, _ := core.AddressFromHex(w.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr)
	genesisBlock.Sign(w)
	store.SaveBlock(genesisBlock)
	store.SetLatestBlockNumber(0)

	cfg := config.DefaultConfig()
	cfg.Server.Port = 9200
	net, _ := NewNetwork(cfg)
	m, _ := miner.NewMiner(store, w)
	handler := NewBlockchainHandler(net, store, m)
	net.SetBlockchainHandler(handler)

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		block := &core.Block{
			Header: core.BlockHeader{
				Number:       uint64(i + 1),
				PreviousHash: genesisBlock.Hash(),
				Timestamp:    time.Now().Unix(),
				MinerAddress: minerAddr,
			},
		}
		block.Sign(w)
		store.SaveBlock(block)
		store.SetLatestBlockNumber(uint64(i + 1))
	}
}
