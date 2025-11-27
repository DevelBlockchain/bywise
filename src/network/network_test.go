package network

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/bywise/go-bywise/src/config"
)

// Helper function to create test config
func createTestConfig(t *testing.T, port int) *config.NetworkConfig {
	tmpDir, err := os.MkdirTemp("", "bywise-network-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	t.Cleanup(func() { os.RemoveAll(tmpDir) })

	cfg := config.DefaultConfig()
	cfg.Server.Host = "127.0.0.1"
	cfg.Server.Port = port
	cfg.TLS.CertFile = filepath.Join(tmpDir, "server.crt")
	cfg.TLS.KeyFile = filepath.Join(tmpDir, "server.key")
	cfg.TLS.AutoGenerate = true
	cfg.Connection.MinConnections = 1
	cfg.Connection.MaxConnections = 10
	cfg.Connection.ConnectionTimeout = 5 * time.Second
	cfg.Connection.HandshakeTimeout = 3 * time.Second
	cfg.Discovery.Enabled = false // Disable discovery for tests
	cfg.RateLimit.Enabled = true
	cfg.RateLimit.RequestsPerSecond = 100
	cfg.RateLimit.BurstSize = 200

	return cfg
}

func TestNetworkCreation(t *testing.T) {
	cfg := createTestConfig(t, 19001)

	network, err := NewNetwork(cfg)
	if err != nil {
		t.Fatalf("Failed to create network: %v", err)
	}

	if network.GetNodeID() == "" {
		t.Error("Node ID should not be empty")
	}

	if network.GetAddress() != "127.0.0.1:19001" {
		t.Errorf("Expected address 127.0.0.1:19001, got %s", network.GetAddress())
	}
}

func TestNetworkStartStop(t *testing.T) {
	cfg := createTestConfig(t, 19002)

	network, err := NewNetwork(cfg)
	if err != nil {
		t.Fatalf("Failed to create network: %v", err)
	}

	// Start network
	err = network.Start()
	if err != nil {
		t.Fatalf("Failed to start network: %v", err)
	}

	// Verify it's running
	if network.ConnectedPeerCount() != 0 {
		t.Error("Should have 0 connected peers initially")
	}

	// Stop network
	err = network.Stop()
	if err != nil {
		t.Fatalf("Failed to stop network: %v", err)
	}
}

func TestNetworkConnectTwoPeers(t *testing.T) {
	// Create two networks
	cfg1 := createTestConfig(t, 19003)
	cfg2 := createTestConfig(t, 19004)

	network1, err := NewNetwork(cfg1)
	if err != nil {
		t.Fatalf("Failed to create network1: %v", err)
	}

	network2, err := NewNetwork(cfg2)
	if err != nil {
		t.Fatalf("Failed to create network2: %v", err)
	}

	// Track connection events
	var connected1, connected2 bool
	var mu sync.Mutex

	network1.OnPeerConnected(func(p *Peer) {
		mu.Lock()
		connected1 = true
		mu.Unlock()
	})

	network2.OnPeerConnected(func(p *Peer) {
		mu.Lock()
		connected2 = true
		mu.Unlock()
	})

	// Start both networks
	if err := network1.Start(); err != nil {
		t.Fatalf("Failed to start network1: %v", err)
	}
	defer network1.Stop()

	if err := network2.Start(); err != nil {
		t.Fatalf("Failed to start network2: %v", err)
	}
	defer network2.Stop()

	// Connect network2 to network1
	err = network2.Connect("127.0.0.1:19003")
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	// Wait for connection to be established
	time.Sleep(100 * time.Millisecond)

	// Network2 should have 1 peer
	if network2.ConnectedPeerCount() != 1 {
		t.Errorf("Network2 should have 1 peer, got %d", network2.ConnectedPeerCount())
	}

	// Network1 should also have 1 peer (inbound)
	if network1.ConnectedPeerCount() != 1 {
		t.Errorf("Network1 should have 1 peer, got %d", network1.ConnectedPeerCount())
	}

	// Check callbacks were called
	mu.Lock()
	if !connected1 {
		t.Error("OnPeerConnected callback was not called on network1")
	}
	if !connected2 {
		t.Error("OnPeerConnected callback was not called on network2")
	}
	mu.Unlock()
}

func TestNetworkSelfConnection(t *testing.T) {
	cfg := createTestConfig(t, 19005)

	network, err := NewNetwork(cfg)
	if err != nil {
		t.Fatalf("Failed to create network: %v", err)
	}

	if err := network.Start(); err != nil {
		t.Fatalf("Failed to start network: %v", err)
	}
	defer network.Stop()

	// Try to connect to self
	err = network.Connect("127.0.0.1:19005")
	if err == nil {
		t.Error("Should not be able to connect to self")
	}
}

func TestNetworkMaxConnections(t *testing.T) {
	// Create main network with max 2 connections
	cfg1 := createTestConfig(t, 19006)
	cfg1.Connection.MaxConnections = 2

	network1, err := NewNetwork(cfg1)
	if err != nil {
		t.Fatalf("Failed to create network1: %v", err)
	}

	if err := network1.Start(); err != nil {
		t.Fatalf("Failed to start network1: %v", err)
	}
	defer network1.Stop()

	// Create 3 client networks
	clients := make([]*Network, 3)
	for i := 0; i < 3; i++ {
		cfg := createTestConfig(t, 19007+i)
		client, err := NewNetwork(cfg)
		if err != nil {
			t.Fatalf("Failed to create client %d: %v", i, err)
		}
		if err := client.Start(); err != nil {
			t.Fatalf("Failed to start client %d: %v", i, err)
		}
		defer client.Stop()
		clients[i] = client
	}

	// Connect first two clients
	for i := 0; i < 2; i++ {
		err := clients[i].Connect("127.0.0.1:19006")
		if err != nil {
			t.Fatalf("Client %d should connect: %v", i, err)
		}
	}

	time.Sleep(100 * time.Millisecond)

	// Third client should be rejected
	err = clients[2].Connect("127.0.0.1:19006")
	if err == nil {
		t.Error("Third client should be rejected due to max connections")
	}
}

func TestNetworkPing(t *testing.T) {
	cfg1 := createTestConfig(t, 19010)
	cfg2 := createTestConfig(t, 19011)

	network1, _ := NewNetwork(cfg1)
	network2, _ := NewNetwork(cfg2)

	network1.Start()
	defer network1.Stop()

	network2.Start()
	defer network2.Stop()

	// Connect
	err := network2.Connect("127.0.0.1:19010")
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Get peer and ping
	peers := network2.GetConnectedPeers()
	if len(peers) == 0 {
		t.Fatal("No peers connected")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := peers[0].Ping(ctx)
	if err != nil {
		t.Fatalf("Ping failed: %v", err)
	}

	if resp.ServerTimestamp == 0 {
		t.Error("Server timestamp should not be 0")
	}
}

func TestNetworkGetPeers(t *testing.T) {
	// Create 3 networks in a chain
	cfg1 := createTestConfig(t, 19012)
	cfg2 := createTestConfig(t, 19013)
	cfg3 := createTestConfig(t, 19014)

	network1, _ := NewNetwork(cfg1)
	network2, _ := NewNetwork(cfg2)
	network3, _ := NewNetwork(cfg3)

	network1.Start()
	defer network1.Stop()

	network2.Start()
	defer network2.Stop()

	network3.Start()
	defer network3.Stop()

	// Connect network2 to network1
	err := network2.Connect("127.0.0.1:19012")
	if err != nil {
		t.Fatalf("Failed to connect network2 to network1: %v", err)
	}

	// Connect network3 to network2
	err = network3.Connect("127.0.0.1:19013")
	if err != nil {
		t.Fatalf("Failed to connect network3 to network2: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Network2 should be able to list peers
	peers := network2.GetConnectedPeers()
	if len(peers) != 2 {
		t.Errorf("Network2 should have 2 peers, got %d", len(peers))
	}

	// Get peers from network2's connection to network1
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for _, peer := range peers {
		peerInfos, err := peer.GetPeers(ctx, 10)
		if err != nil {
			t.Logf("GetPeers failed for peer %s: %v", peer.NodeID, err)
			continue
		}
		t.Logf("Peer %s returned %d peers", peer.NodeID, len(peerInfos))
	}
}

func TestNetworkDisconnect(t *testing.T) {
	cfg1 := createTestConfig(t, 19015)
	cfg2 := createTestConfig(t, 19016)

	network1, _ := NewNetwork(cfg1)
	network2, _ := NewNetwork(cfg2)

	var disconnected bool
	var mu sync.Mutex

	network1.OnPeerDisconnected(func(p *Peer) {
		mu.Lock()
		disconnected = true
		mu.Unlock()
	})

	network1.Start()
	defer network1.Stop()

	network2.Start()

	// Connect
	err := network2.Connect("127.0.0.1:19015")
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Verify connection
	if network1.ConnectedPeerCount() != 1 {
		t.Error("Network1 should have 1 peer")
	}

	// Stop network2 (should disconnect gracefully)
	network2.Stop()

	// Wait for disconnect to propagate - may take longer due to reverse connections
	// and TCP connection cleanup
	time.Sleep(500 * time.Millisecond)

	// Network1 should have 0 peers now
	if network1.ConnectedPeerCount() != 0 {
		t.Errorf("Network1 should have 0 peers after disconnect, got %d", network1.ConnectedPeerCount())
	}

	mu.Lock()
	if !disconnected {
		t.Error("OnPeerDisconnected callback was not called")
	}
	mu.Unlock()
}

func TestNetworkRequestHandler(t *testing.T) {
	cfg1 := createTestConfig(t, 19017)
	cfg2 := createTestConfig(t, 19018)

	network1, _ := NewNetwork(cfg1)
	network2, _ := NewNetwork(cfg2)

	// Register a test handler
	network1.RegisterRequestHandler("echo", func(ctx context.Context, peer *Peer, payload []byte) ([]byte, error) {
		return payload, nil
	})

	network1.Start()
	defer network1.Stop()

	network2.Start()
	defer network2.Stop()

	// Connect
	err := network2.Connect("127.0.0.1:19017")
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Send request
	peers := network2.GetConnectedPeers()
	if len(peers) == 0 {
		t.Fatal("No peers connected")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	testData := []byte("hello world")
	response, err := network2.SendRequest(ctx, peers[0], "echo", testData)
	if err != nil {
		t.Fatalf("SendRequest failed: %v", err)
	}

	if string(response) != string(testData) {
		t.Errorf("Expected %s, got %s", testData, response)
	}
}

func TestNetworkBroadcast(t *testing.T) {
	// Create hub network that will receive broadcasts
	cfgHub := createTestConfig(t, 19019)
	hub, _ := NewNetwork(cfgHub)

	receivedCount := 0
	var mu sync.Mutex

	// Register handler on hub
	hub.RegisterRequestHandler("broadcast", func(ctx context.Context, peer *Peer, payload []byte) ([]byte, error) {
		mu.Lock()
		receivedCount++
		mu.Unlock()
		return nil, nil
	})

	hub.Start()
	defer hub.Stop()

	// Create sender network that will connect to hub and broadcast
	cfgSender := createTestConfig(t, 19020)
	sender, _ := NewNetwork(cfgSender)
	sender.Start()
	defer sender.Stop()

	// Connect sender to hub
	err := sender.Connect("127.0.0.1:19019")
	if err != nil {
		t.Fatalf("Sender failed to connect to hub: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Verify connection
	if sender.ConnectedPeerCount() != 1 {
		t.Fatalf("Sender should have 1 connection, got %d", sender.ConnectedPeerCount())
	}

	// Broadcast from sender to hub
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	results := sender.Broadcast(ctx, "broadcast", []byte("test"))

	// Check results
	for nodeID, err := range results {
		if err != nil {
			t.Errorf("Broadcast to %s failed: %v", nodeID, err)
		}
	}

	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	if receivedCount != 1 {
		t.Errorf("Expected 1 broadcast received, got %d", receivedCount)
	}
	mu.Unlock()
}

func TestNetworkAlreadyConnected(t *testing.T) {
	cfg1 := createTestConfig(t, 19023)
	cfg2 := createTestConfig(t, 19024)

	network1, _ := NewNetwork(cfg1)
	network2, _ := NewNetwork(cfg2)

	network1.Start()
	defer network1.Stop()

	network2.Start()
	defer network2.Stop()

	// First connection should succeed
	err := network2.Connect("127.0.0.1:19023")
	if err != nil {
		t.Fatalf("First connection failed: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Second connection should fail with already connected error
	err = network2.Connect("127.0.0.1:19023")
	if err != ErrAlreadyConnected {
		t.Errorf("Expected ErrAlreadyConnected, got %v", err)
	}
}
