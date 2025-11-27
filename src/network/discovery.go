package network

import (
	"context"
	"math/rand"
	"sync"
	"time"

	"github.com/bywise/go-bywise/src/config"
	pb "github.com/bywise/go-bywise/src/proto/pb"
)

// Discovery handles peer discovery in the network
type Discovery struct {
	mu       sync.RWMutex
	config   config.DiscoveryConfig
	network  *Network
	known    map[string]time.Time // address -> last seen
	pending  map[string]bool      // addresses pending connection
	stopCh   chan struct{}
	running  bool
}

// NewDiscovery creates a new discovery manager
func NewDiscovery(cfg config.DiscoveryConfig, network *Network) *Discovery {
	return &Discovery{
		config:  cfg,
		network: network,
		known:   make(map[string]time.Time),
		pending: make(map[string]bool),
		stopCh:  make(chan struct{}),
	}
}

// Start begins the discovery process
func (d *Discovery) Start() {
	d.mu.Lock()
	if d.running {
		d.mu.Unlock()
		return
	}
	d.running = true
	d.stopCh = make(chan struct{})
	d.mu.Unlock()

	go d.discoveryLoop()
}

// Stop stops the discovery process
func (d *Discovery) Stop() {
	d.mu.Lock()
	if !d.running {
		d.mu.Unlock()
		return
	}
	d.running = false
	close(d.stopCh)
	d.mu.Unlock()
}

// AddKnownPeer adds a peer address to the known list
func (d *Discovery) AddKnownPeer(address string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.known[address] = time.Now()
}

// RemoveKnownPeer removes a peer from the known list
func (d *Discovery) RemoveKnownPeer(address string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.known, address)
}

// GetKnownPeers returns all known peer addresses
func (d *Discovery) GetKnownPeers() []string {
	d.mu.RLock()
	defer d.mu.RUnlock()

	peers := make([]string, 0, len(d.known))
	for addr := range d.known {
		peers = append(peers, addr)
	}
	return peers
}

// discoveryLoop runs the periodic discovery
func (d *Discovery) discoveryLoop() {
	ticker := time.NewTicker(d.config.Interval)
	defer ticker.Stop()

	// Run discovery immediately on start
	d.runDiscovery()

	for {
		select {
		case <-d.stopCh:
			return
		case <-ticker.C:
			d.runDiscovery()
		}
	}
}

// runDiscovery performs one round of peer discovery
func (d *Discovery) runDiscovery() {
	if !d.config.Enabled {
		return
	}

	// Check if we need more connections
	connectedCount := d.network.ConnectedPeerCount()
	minConns := d.network.config.Connection.MinConnections
	maxConns := d.network.config.Connection.MaxConnections

	if connectedCount >= maxConns {
		return // We have enough peers
	}

	// Get peers to ask for new peers
	peers := d.network.GetConnectedPeers()
	if len(peers) == 0 {
		// No connected peers, try known peers
		d.tryKnownPeers()
		return
	}

	// Shuffle peers and take a subset
	rand.Shuffle(len(peers), func(i, j int) {
		peers[i], peers[j] = peers[j], peers[i]
	})

	peersToAsk := d.config.MaxPeersToAsk
	if len(peers) < peersToAsk {
		peersToAsk = len(peers)
	}

	// Query peers for their peers
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	newPeersCh := make(chan string, 100)

	for i := 0; i < peersToAsk; i++ {
		wg.Add(1)
		go func(peer *Peer) {
			defer wg.Done()

			peerInfos, err := peer.GetPeers(ctx, d.config.MaxPeersPerQuery)
			if err != nil {
				return
			}

			for _, info := range peerInfos {
				if info.Address != "" {
					newPeersCh <- info.Address
				}
			}
		}(peers[i])
	}

	// Close channel when all goroutines are done
	go func() {
		wg.Wait()
		close(newPeersCh)
	}()

	// Collect new peers
	newPeers := make(map[string]bool)
	for addr := range newPeersCh {
		newPeers[addr] = true
	}

	// Try to connect to new peers
	needed := minConns - connectedCount
	if needed < 1 {
		needed = 1 // Always try to find at least one new peer
	}

	connected := 0
	for addr := range newPeers {
		if connected >= needed {
			break
		}

		// Skip if already connected or pending
		if d.network.IsConnected(addr) {
			continue
		}

		d.mu.Lock()
		if d.pending[addr] {
			d.mu.Unlock()
			continue
		}
		d.pending[addr] = true
		d.mu.Unlock()

		// Try to connect
		go func(address string) {
			defer func() {
				d.mu.Lock()
				delete(d.pending, address)
				d.mu.Unlock()
			}()

			if err := d.network.Connect(address); err == nil {
				d.AddKnownPeer(address)
			}
		}(addr)

		connected++
	}
}

// tryKnownPeers tries to connect to known peers when we have no connections
func (d *Discovery) tryKnownPeers() {
	d.mu.RLock()
	addresses := make([]string, 0, len(d.known))
	for addr := range d.known {
		addresses = append(addresses, addr)
	}
	d.mu.RUnlock()

	// Skip if no known peers
	if len(addresses) == 0 {
		return
	}

	// Shuffle addresses
	rand.Shuffle(len(addresses), func(i, j int) {
		addresses[i], addresses[j] = addresses[j], addresses[i]
	})

	// Try to connect to more known peers (increased to try all known)
	maxTries := len(addresses)
	if maxTries > 15 {
		maxTries = 15
	}

	for i := 0; i < maxTries; i++ {
		addr := addresses[i]

		// Skip our own address
		if addr == d.network.GetAddress() {
			continue
		}

		// Skip if already connected
		if d.network.IsConnected(addr) {
			continue
		}

		// Skip if pending
		d.mu.Lock()
		if d.pending[addr] {
			d.mu.Unlock()
			continue
		}
		d.pending[addr] = true
		d.mu.Unlock()

		go func(address string) {
			defer func() {
				d.mu.Lock()
				delete(d.pending, address)
				d.mu.Unlock()
			}()

			err := d.network.Connect(address)
			if err != nil {
				// Connection failed - try to discover more peers from this address
				// This is crucial when all known peers have max connections
				d.tryGetPeersFrom(address)
			}
		}(addr)
	}
}

// DiscoverFromBootstrap tries to discover peers from bootstrap nodes
func (d *Discovery) DiscoverFromBootstrap(bootstrapNodes []config.NodeConfig) {
	for _, node := range bootstrapNodes {
		d.AddKnownPeer(node.Address)
	}

	// Try to connect to bootstrap nodes
	for _, node := range bootstrapNodes {
		go func(addr string) {
			err := d.network.Connect(addr)
			if err != nil {
				// If connection failed, try to get peers from them anyway
				d.tryGetPeersFrom(addr)
			}
		}(node.Address)
	}
}

// TryDiscoverFromAddress attempts to discover peers from a specific address
// This is called when a connection is rejected
func (d *Discovery) TryDiscoverFromAddress(address string) {
	d.AddKnownPeer(address)
	go d.tryGetPeersFrom(address)
}

// tryGetPeersFrom tries to get peer list from an address without fully connecting
func (d *Discovery) tryGetPeersFrom(address string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Create a temporary connection just to get peers
	conn, err := d.network.dialPeer(ctx, address)
	if err != nil {
		return
	}
	defer conn.Close()

	client := pb.NewNodeServiceClient(conn)

	// Try to get peers (GetPeers works without token when we pass empty token)
	resp, err := client.GetPeers(ctx, &pb.GetPeersRequest{
		Token:    "", // Empty token for unauthenticated query
		MaxPeers: int32(d.config.MaxPeersPerQuery),
	})
	if err != nil {
		return
	}

	// Add discovered peers to known list and try to connect
	for _, peerInfo := range resp.Peers {
		if peerInfo.Address != "" && peerInfo.Address != d.network.GetAddress() {
			d.AddKnownPeer(peerInfo.Address)
		}
	}

	// Trigger connection attempts to newly discovered peers
	d.tryKnownPeers()
}
