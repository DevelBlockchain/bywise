package network

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/bywise/go-bywise/src/config"
)

func createTestNetworkForDiscovery(t *testing.T, port int) *Network {
	tmpDir, err := os.MkdirTemp("", "bywise-discovery-test")
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
	cfg.Discovery.Enabled = false // Will enable manually for tests
	cfg.Discovery.Interval = 100 * time.Millisecond
	cfg.Discovery.MaxPeersToAsk = 3
	cfg.Discovery.MaxPeersPerQuery = 5

	network, err := NewNetwork(cfg)
	if err != nil {
		t.Fatalf("Failed to create network: %v", err)
	}

	return network
}

func TestDiscoveryAddRemoveKnownPeer(t *testing.T) {
	cfg := config.DiscoveryConfig{
		Enabled:          true,
		Interval:         1 * time.Second,
		MaxPeersToAsk:    5,
		MaxPeersPerQuery: 10,
	}

	// Create a mock network (we won't actually use it)
	network := &Network{
		peers:       make(map[string]*Peer),
		peersByAddr: make(map[string]*Peer),
	}

	discovery := NewDiscovery(cfg, network)

	// Add peers
	discovery.AddKnownPeer("localhost:8081")
	discovery.AddKnownPeer("localhost:8082")
	discovery.AddKnownPeer("localhost:8083")

	peers := discovery.GetKnownPeers()
	if len(peers) != 3 {
		t.Errorf("Expected 3 known peers, got %d", len(peers))
	}

	// Remove a peer
	discovery.RemoveKnownPeer("localhost:8082")

	peers = discovery.GetKnownPeers()
	if len(peers) != 2 {
		t.Errorf("Expected 2 known peers after removal, got %d", len(peers))
	}

	// Check that the removed peer is not in the list
	for _, addr := range peers {
		if addr == "localhost:8082" {
			t.Error("Removed peer should not be in the list")
		}
	}
}

func TestDiscoveryStartStop(t *testing.T) {
	cfg := config.DiscoveryConfig{
		Enabled:          true,
		Interval:         100 * time.Millisecond,
		MaxPeersToAsk:    5,
		MaxPeersPerQuery: 10,
	}

	network := &Network{
		peers:       make(map[string]*Peer),
		peersByAddr: make(map[string]*Peer),
		config: &config.NetworkConfig{
			Connection: config.ConnectionConfig{
				MinConnections: 3,
				MaxConnections: 10,
			},
		},
	}

	discovery := NewDiscovery(cfg, network)

	// Start discovery
	discovery.Start()

	// Wait a bit to ensure it's running
	time.Sleep(50 * time.Millisecond)

	// Stop discovery
	discovery.Stop()

	// Should be able to stop again without issue
	discovery.Stop()
}

func TestDiscoveryFromBootstrap(t *testing.T) {
	// Create 3 networks
	network1 := createTestNetworkForDiscovery(t, 19030)
	network2 := createTestNetworkForDiscovery(t, 19031)
	network3 := createTestNetworkForDiscovery(t, 19032)

	// Start all networks
	network1.Start()
	defer network1.Stop()

	network2.Start()
	defer network2.Stop()

	network3.Start()
	defer network3.Stop()

	// Connect network2 to network1 first
	err := network2.Connect("127.0.0.1:19030")
	if err != nil {
		t.Fatalf("Failed to connect network2 to network1: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Now use network3's discovery to find peers via network1 as bootstrap
	bootstrapNodes := []config.NodeConfig{
		{Address: "127.0.0.1:19030"},
	}

	network3.discovery.DiscoverFromBootstrap(bootstrapNodes)

	// Wait for discovery to work
	time.Sleep(300 * time.Millisecond)

	// Network3 should have added the bootstrap node to known peers
	knownPeers := network3.discovery.GetKnownPeers()
	if len(knownPeers) == 0 {
		t.Error("Network3 should have known peers after bootstrap discovery")
	}
}

func TestDiscoveryPeerDiscovery(t *testing.T) {
	// Create a hub network and several spoke networks
	hub := createTestNetworkForDiscovery(t, 19033)
	spoke1 := createTestNetworkForDiscovery(t, 19034)
	spoke2 := createTestNetworkForDiscovery(t, 19035)
	newNode := createTestNetworkForDiscovery(t, 19036)

	// Start all networks
	hub.Start()
	defer hub.Stop()

	spoke1.Start()
	defer spoke1.Stop()

	spoke2.Start()
	defer spoke2.Stop()

	newNode.Start()
	defer newNode.Stop()

	// Connect spokes to hub
	err := spoke1.Connect("127.0.0.1:19033")
	if err != nil {
		t.Fatalf("Failed to connect spoke1: %v", err)
	}

	err = spoke2.Connect("127.0.0.1:19033")
	if err != nil {
		t.Fatalf("Failed to connect spoke2: %v", err)
	}

	time.Sleep(200 * time.Millisecond)

	// Verify hub has 2 connections
	if hub.ConnectedPeerCount() != 2 {
		t.Errorf("Hub should have 2 connections, got %d", hub.ConnectedPeerCount())
	}

	// New node connects to hub and should discover spokes through GetPeers
	err = newNode.Connect("127.0.0.1:19033")
	if err != nil {
		t.Fatalf("Failed to connect newNode: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// New node should be connected to hub
	if newNode.ConnectedPeerCount() != 1 {
		t.Errorf("New node should have 1 connection, got %d", newNode.ConnectedPeerCount())
	}

	// Enable discovery on new node and let it run
	newNode.config.Discovery.Enabled = true
	newNode.discovery.config.Enabled = true
	newNode.discovery.Start()
	defer newNode.discovery.Stop()

	// Wait for discovery cycles
	time.Sleep(500 * time.Millisecond)

	// The new node might have discovered other peers through the hub
	// This depends on the discovery logic connecting to discovered peers
	t.Logf("New node has %d connections after discovery", newNode.ConnectedPeerCount())
	t.Logf("New node knows %d peers", len(newNode.discovery.GetKnownPeers()))
}
