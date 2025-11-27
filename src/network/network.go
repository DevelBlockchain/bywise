package network

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/bywise/go-bywise/src/config"
	"github.com/bywise/go-bywise/src/crypto"
	pb "github.com/bywise/go-bywise/src/proto/pb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// RequestHandler is a function that handles authenticated requests
type RequestHandler func(ctx context.Context, peer *Peer, payload []byte) ([]byte, error)

// Network manages the P2P network
type Network struct {
	mu sync.RWMutex

	nodeID      string
	config      *config.NetworkConfig
	tlsConfig   *tls.Config
	server      *grpc.Server
	listener    net.Listener
	peers       map[string]*Peer // nodeID -> peer
	peersByAddr map[string]*Peer // address -> peer
	tokenMap    map[string]*Peer // token -> peer (for inbound auth)

	rateLimiter *RateLimiter
	discovery   *Discovery
	handlers    map[string]RequestHandler

	// Blockchain handler (optional)
	blockchainHandler *BlockchainHandler

	running    bool
	stopCh     chan struct{}
	wg         sync.WaitGroup

	// Callbacks
	onPeerConnected    func(*Peer)
	onPeerDisconnected func(*Peer)
}

// NewNetwork creates a new P2P network manager
func NewNetwork(cfg *config.NetworkConfig) (*Network, error) {
	// Generate node ID if not set
	if cfg.NodeID == "" {
		nodeID, err := crypto.GenerateNodeID()
		if err != nil {
			return nil, fmt.Errorf("failed to generate node ID: %w", err)
		}
		cfg.NodeID = nodeID
	}

	// Setup TLS
	tlsManager := crypto.NewTLSManager(cfg.TLS.CertFile, cfg.TLS.KeyFile)
	tlsConfig, err := tlsManager.LoadOrGenerateTLS(
		[]string{cfg.Server.Host},
		cfg.TLS.AutoGenerate,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to setup TLS: %w", err)
	}

	network := &Network{
		nodeID:      cfg.NodeID,
		config:      cfg,
		tlsConfig:   tlsConfig,
		peers:       make(map[string]*Peer),
		peersByAddr: make(map[string]*Peer),
		tokenMap:    make(map[string]*Peer),
		rateLimiter: NewRateLimiter(cfg.RateLimit),
		handlers:    make(map[string]RequestHandler),
		stopCh:      make(chan struct{}),
	}

	network.discovery = NewDiscovery(cfg.Discovery, network)

	return network, nil
}

// Start starts the network (server and discovery)
func (n *Network) Start() error {
	n.mu.Lock()
	if n.running {
		n.mu.Unlock()
		return nil
	}
	n.running = true
	n.stopCh = make(chan struct{})
	n.mu.Unlock()

	// Start gRPC server
	if err := n.startServer(); err != nil {
		return err
	}

	// Connect to bootstrap nodes
	if len(n.config.BootstrapNodes) > 0 {
		n.discovery.DiscoverFromBootstrap(n.config.BootstrapNodes)
	}

	// Start discovery
	if n.config.Discovery.Enabled {
		n.discovery.Start()
	}

	// Start keepalive
	n.wg.Add(1)
	go n.keepaliveLoop()

	// Start rate limiter cleanup
	n.wg.Add(1)
	go n.cleanupLoop()

	log.Printf("[Network] Started node %s on %s", n.nodeID, n.config.GetServerAddress())

	return nil
}

// Stop stops the network
func (n *Network) Stop() error {
	n.mu.Lock()
	if !n.running {
		n.mu.Unlock()
		return nil
	}
	n.running = false
	close(n.stopCh)
	n.mu.Unlock()

	// Stop discovery
	n.discovery.Stop()

	// Disconnect all peers gracefully
	n.disconnectAllPeers()

	// Stop gRPC server
	if n.server != nil {
		n.server.GracefulStop()
	}

	// Close listener
	if n.listener != nil {
		n.listener.Close()
	}

	// Wait for goroutines
	n.wg.Wait()

	log.Printf("[Network] Stopped node %s", n.nodeID)

	return nil
}

// startServer starts the gRPC server
func (n *Network) startServer() error {
	addr := n.config.GetServerAddress()

	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}
	n.listener = listener

	// Create TLS credentials
	creds := credentials.NewTLS(n.tlsConfig)

	// Create gRPC server
	n.server = grpc.NewServer(grpc.Creds(creds))

	// Register service
	grpcServer := NewGRPCServer(n)
	pb.RegisterNodeServiceServer(n.server, grpcServer)

	// Start serving
	n.wg.Add(1)
	go func() {
		defer n.wg.Done()
		if err := n.server.Serve(listener); err != nil {
			log.Printf("[Network] Server error: %v", err)
		}
	}()

	return nil
}

// Connect connects to a peer at the given address
func (n *Network) Connect(address string) error {
	n.mu.RLock()
	if !n.running {
		n.mu.RUnlock()
		return ErrNetworkStopped
	}
	n.mu.RUnlock()

	// Check if already connected
	if peer := n.GetPeerByAddress(address); peer != nil && peer.IsConnected() {
		return ErrAlreadyConnected
	}

	// Early check for max connections (will be checked again atomically when adding)
	if n.ConnectedPeerCount() >= n.config.Connection.MaxConnections {
		return ErrMaxConnectionsReached
	}

	log.Printf("[Network] Connecting to %s", address)

	ctx, cancel := context.WithTimeout(context.Background(), n.config.Connection.ConnectionTimeout)
	defer cancel()

	// Dial the peer
	conn, err := n.dialPeer(ctx, address)
	if err != nil {
		return fmt.Errorf("failed to dial peer: %w", err)
	}

	// Create client
	client := pb.NewNodeServiceClient(conn)

	// Perform handshake
	nonce, err := crypto.GenerateToken()
	if err != nil {
		conn.Close()
		return fmt.Errorf("failed to generate nonce: %w", err)
	}

	handshakeCtx, handshakeCancel := context.WithTimeout(context.Background(), n.config.Connection.HandshakeTimeout)
	defer handshakeCancel()

	resp, err := client.Handshake(handshakeCtx, &pb.HandshakeRequest{
		NodeId:    n.nodeID,
		Address:   n.config.GetServerAddress(),
		Timestamp: time.Now().UnixNano(),
		Version:   "1.0.0",
		Nonce:     []byte(nonce),
	})
	if err != nil {
		conn.Close()
		return fmt.Errorf("handshake failed: %w", err)
	}

	if !resp.Accepted {
		conn.Close()
		// If rejected due to max connections, try to discover peers from this node
		if resp.Reason == "max connections reached" && n.config.Discovery.Enabled {
			n.discovery.TryDiscoverFromAddress(address)
		}
		return fmt.Errorf("%w: %s", ErrHandshakeFailed, resp.Reason)
	}

	// Check for self-connection
	if resp.NodeId == n.nodeID {
		conn.Close()
		return ErrSelfConnection
	}

	// Create peer
	peer := NewPeer(resp.NodeId, address)
	peer.SetConnection(conn)
	peer.Token = resp.Token
	peer.State = PeerStateConnected
	peer.ConnectedAt = time.Now()
	peer.isInbound = false

	// Try to add peer atomically (checks max connections and adds in one operation)
	if !n.tryAddPeer(peer) {
		conn.Close()
		return ErrMaxConnectionsReached
	}

	log.Printf("[Network] Connected to %s (node: %s)", address, resp.NodeId)

	return nil
}

// dialPeer establishes a gRPC connection to a peer
func (n *Network) dialPeer(ctx context.Context, address string) (*grpc.ClientConn, error) {
	// Use client TLS config (accepts self-signed certs)
	clientTLS := crypto.GetClientTLSConfig()
	creds := credentials.NewTLS(clientTLS)

	conn, err := grpc.DialContext(ctx, address,
		grpc.WithTransportCredentials(creds),
		grpc.WithBlock(),
	)
	if err != nil {
		return nil, err
	}

	return conn, nil
}

// establishReverseConnection establishes an outbound connection to a peer that connected to us
// This allows us to send messages back to them
func (n *Network) establishReverseConnection(peer *Peer) {
	// Small delay to let the handshake complete
	time.Sleep(100 * time.Millisecond)

	// Check if network is still running and peer is still connected
	n.mu.RLock()
	running := n.running
	existingPeer := n.peers[peer.NodeID]
	n.mu.RUnlock()

	if !running || existingPeer == nil || !existingPeer.IsConnected() {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), n.config.Connection.ConnectionTimeout)
	defer cancel()

	// Dial the peer using their advertised address
	conn, err := n.dialPeer(ctx, peer.Address)
	if err != nil {
		log.Printf("[Network] Failed to establish reverse connection to %s: %v", peer.Address, err)
		return
	}

	// Create client
	client := pb.NewNodeServiceClient(conn)

	// Perform handshake
	nonce, err := crypto.GenerateToken()
	if err != nil {
		conn.Close()
		log.Printf("[Network] Failed to generate nonce for reverse connection: %v", err)
		return
	}

	handshakeCtx, handshakeCancel := context.WithTimeout(context.Background(), n.config.Connection.HandshakeTimeout)
	defer handshakeCancel()

	resp, err := client.Handshake(handshakeCtx, &pb.HandshakeRequest{
		NodeId:    n.nodeID,
		Address:   n.config.GetServerAddress(),
		Timestamp: time.Now().UnixNano(),
		Version:   "1.0.0",
		Nonce:     []byte(nonce),
	})
	if err != nil {
		conn.Close()
		log.Printf("[Network] Reverse handshake failed to %s: %v", peer.Address, err)
		return
	}

	if !resp.Accepted {
		conn.Close()
		log.Printf("[Network] Reverse connection to %s rejected: %s", peer.Address, resp.Reason)
		return
	}

	// Update the existing peer with the outbound connection
	peer.mu.Lock()
	peer.conn = conn
	peer.client = client
	peer.Token = resp.Token
	peer.mu.Unlock()

	log.Printf("[Network] Established reverse connection to %s", peer.Address)
}

// addPeer adds a peer to the network
func (n *Network) addPeer(peer *Peer) {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.addPeerLocked(peer)
}

// addPeerLocked adds a peer to the network (must be called with lock held)
func (n *Network) addPeerLocked(peer *Peer) {
	n.peers[peer.NodeID] = peer
	n.peersByAddr[peer.Address] = peer

	if peer.InboundToken != "" {
		n.tokenMap[peer.InboundToken] = peer
	}

	// Add to discovery
	n.discovery.AddKnownPeer(peer.Address)

	// Call callback
	if n.onPeerConnected != nil {
		go n.onPeerConnected(peer)
	}
}

// tryAddPeer atomically checks if we can add a peer and adds it if possible
// Returns true if peer was added, false if max connections reached
func (n *Network) tryAddPeer(peer *Peer) bool {
	n.mu.Lock()
	defer n.mu.Unlock()

	// Count connected peers
	count := 0
	for _, p := range n.peers {
		if p.IsConnected() {
			count++
		}
	}

	// Check max connections
	if count >= n.config.Connection.MaxConnections {
		return false
	}

	// Add peer
	n.addPeerLocked(peer)
	return true
}

// updateTokenMap adds a new token to the token map for a peer
// Note: we keep old tokens valid to support multiple connections (e.g., reverse connections)
func (n *Network) updateTokenMap(peer *Peer, newToken string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	// Add new token (keep old tokens valid)
	n.tokenMap[newToken] = peer
}

// removePeer removes a peer from the network
func (n *Network) removePeer(peer *Peer) {
	n.mu.Lock()
	defer n.mu.Unlock()

	delete(n.peers, peer.NodeID)
	delete(n.peersByAddr, peer.Address)

	if peer.InboundToken != "" {
		delete(n.tokenMap, peer.InboundToken)
	}

	peer.Close()

	// Call callback
	if n.onPeerDisconnected != nil {
		go n.onPeerDisconnected(peer)
	}
}

// disconnectAllPeers disconnects all peers gracefully
func (n *Network) disconnectAllPeers() {
	n.mu.RLock()
	peers := make([]*Peer, 0, len(n.peers))
	for _, peer := range n.peers {
		peers = append(peers, peer)
	}
	n.mu.RUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	for _, peer := range peers {
		peer.Disconnect(ctx, "shutting down")
		n.removePeer(peer)
	}
}

// GetPeerByNodeID returns a peer by node ID
func (n *Network) GetPeerByNodeID(nodeID string) *Peer {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.peers[nodeID]
}

// GetPeerByAddress returns a peer by address
func (n *Network) GetPeerByAddress(address string) *Peer {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.peersByAddr[address]
}

// GetPeerByToken returns a peer by their inbound token
func (n *Network) GetPeerByToken(token string) *Peer {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.tokenMap[token]
}

// IsConnected checks if an address is connected
func (n *Network) IsConnected(address string) bool {
	peer := n.GetPeerByAddress(address)
	return peer != nil && peer.IsConnected()
}

// ConnectedPeerCount returns the number of connected peers
func (n *Network) ConnectedPeerCount() int {
	n.mu.RLock()
	defer n.mu.RUnlock()

	count := 0
	for _, peer := range n.peers {
		if peer.IsConnected() {
			count++
		}
	}
	return count
}

// GetConnectedPeers returns all connected peers
func (n *Network) GetConnectedPeers() []*Peer {
	n.mu.RLock()
	defer n.mu.RUnlock()

	peers := make([]*Peer, 0, len(n.peers))
	for _, peer := range n.peers {
		if peer.IsConnected() {
			peers = append(peers, peer)
		}
	}
	return peers
}

// GetNodeID returns this node's ID
func (n *Network) GetNodeID() string {
	return n.nodeID
}

// GetAddress returns this node's address
func (n *Network) GetAddress() string {
	return n.config.GetServerAddress()
}

// GetMaxConnections returns the max connections setting
func (n *Network) GetMaxConnections() int {
	return n.config.Connection.MaxConnections
}

// GetMinConnections returns the min connections setting
func (n *Network) GetMinConnections() int {
	return n.config.Connection.MinConnections
}

// IsDiscoveryEnabled returns whether discovery is enabled
func (n *Network) IsDiscoveryEnabled() bool {
	return n.config.Discovery.Enabled
}

// generateToken generates a new authentication token
func (n *Network) generateToken() (string, error) {
	return crypto.GenerateToken()
}

// checkRateLimit checks if a peer is within rate limits
func (n *Network) checkRateLimit(peer *Peer) bool {
	if !n.config.RateLimit.Enabled {
		return true
	}

	if !n.rateLimiter.Allow(peer.NodeID) {
		// Check if should ban
		n.rateLimiter.RecordInvalid(peer.NodeID)
		if n.rateLimiter.ShouldBan(peer.NodeID) {
			peer.Ban(n.rateLimiter.GetBanDuration())
			n.removePeer(peer)
		}
		return false
	}

	return true
}

// RegisterRequestHandler registers a handler for authenticated requests
func (n *Network) RegisterRequestHandler(method string, handler RequestHandler) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.handlers[method] = handler
}

// GetRequestHandler returns a request handler by method
func (n *Network) GetRequestHandler(method string) RequestHandler {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.handlers[method]
}

// OnPeerConnected sets the callback for when a peer connects
func (n *Network) OnPeerConnected(callback func(*Peer)) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.onPeerConnected = callback
}

// OnPeerDisconnected sets the callback for when a peer disconnects
func (n *Network) OnPeerDisconnected(callback func(*Peer)) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.onPeerDisconnected = callback
}

// keepaliveLoop sends periodic pings to connected peers
func (n *Network) keepaliveLoop() {
	defer n.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-n.stopCh:
			return
		case <-ticker.C:
			n.pingAllPeers()
		}
	}
}

// pingAllPeers sends pings to all connected peers
func (n *Network) pingAllPeers() {
	peers := n.GetConnectedPeers()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for _, peer := range peers {
		go func(p *Peer) {
			_, err := p.Ping(ctx)
			if err != nil {
				log.Printf("[Network] Ping failed for peer %s: %v", p.NodeID, err)
				// Could implement disconnect logic here if ping fails multiple times
			}
		}(peer)
	}
}

// cleanupLoop periodically cleans up stale data
func (n *Network) cleanupLoop() {
	defer n.wg.Done()

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-n.stopCh:
			return
		case <-ticker.C:
			n.rateLimiter.Cleanup(30 * time.Minute)
		}
	}
}

// SendRequest sends an authenticated request to a peer
func (n *Network) SendRequest(ctx context.Context, peer *Peer, method string, payload []byte) ([]byte, error) {
	if !peer.IsConnected() {
		return nil, ErrNotConnected
	}

	client := peer.GetClient()
	if client == nil {
		return nil, ErrNotConnected
	}

	requestID, _ := crypto.GenerateToken()

	resp, err := client.Request(ctx, &pb.AuthenticatedRequest{
		Token:     peer.Token,
		Method:    method,
		Payload:   payload,
		Timestamp: time.Now().UnixNano(),
		RequestId: requestID[:16], // Use first 16 chars
	})
	if err != nil {
		return nil, err
	}

	if !resp.Success {
		return nil, fmt.Errorf("request failed: %s", resp.Error)
	}

	return resp.Payload, nil
}

// Broadcast sends a request to all connected peers
func (n *Network) Broadcast(ctx context.Context, method string, payload []byte) map[string]error {
	peers := n.GetConnectedPeers()
	results := make(map[string]error)
	var mu sync.Mutex

	var wg sync.WaitGroup
	for _, peer := range peers {
		wg.Add(1)
		go func(p *Peer) {
			defer wg.Done()
			_, err := n.SendRequest(ctx, p, method, payload)
			mu.Lock()
			results[p.NodeID] = err
			mu.Unlock()
		}(peer)
	}

	wg.Wait()
	return results
}
