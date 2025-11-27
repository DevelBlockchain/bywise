package network

import (
	"context"
	"sync"
	"time"

	pb "github.com/bywise/go-bywise/src/proto/pb"
	"google.golang.org/grpc"
)

// PeerState represents the connection state of a peer
type PeerState int

const (
	PeerStateDisconnected PeerState = iota
	PeerStateConnecting
	PeerStateHandshaking
	PeerStateConnected
	PeerStateBanned
)

func (s PeerState) String() string {
	switch s {
	case PeerStateDisconnected:
		return "disconnected"
	case PeerStateConnecting:
		return "connecting"
	case PeerStateHandshaking:
		return "handshaking"
	case PeerStateConnected:
		return "connected"
	case PeerStateBanned:
		return "banned"
	default:
		return "unknown"
	}
}

// Peer represents a connected peer in the network
type Peer struct {
	mu sync.RWMutex

	NodeID         string
	Address        string
	State          PeerState
	Token          string    // Token we use to authenticate to them
	InboundToken   string    // Token they use to authenticate to us
	ConnectedAt    time.Time
	LastPingAt     time.Time
	LastPongAt     time.Time

	// Connection info
	conn           *grpc.ClientConn
	client         pb.NodeServiceClient
	isInbound      bool      // true if they connected to us

	// Rate limiting
	requestCount   int64
	invalidCount   int
	lastRequestAt  time.Time
	bannedUntil    time.Time

	// Reconnection
	reconnectAttempts int
}

// NewPeer creates a new peer instance
func NewPeer(nodeID, address string) *Peer {
	return &Peer{
		NodeID:  nodeID,
		Address: address,
		State:   PeerStateDisconnected,
	}
}

// SetConnection sets the gRPC connection for this peer
func (p *Peer) SetConnection(conn *grpc.ClientConn) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.conn = conn
	p.client = pb.NewNodeServiceClient(conn)
}

// GetClient returns the gRPC client for this peer
func (p *Peer) GetClient() pb.NodeServiceClient {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.client
}

// Close closes the connection to this peer
func (p *Peer) Close() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.conn != nil {
		err := p.conn.Close()
		p.conn = nil
		p.client = nil
		return err
	}
	return nil
}

// IsConnected returns true if the peer is connected
func (p *Peer) IsConnected() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.State == PeerStateConnected
}

// IsInbound returns true if this is an inbound connection
func (p *Peer) IsInbound() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.isInbound
}

// IsBanned returns true if the peer is currently banned
func (p *Peer) IsBanned() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.State == PeerStateBanned && time.Now().Before(p.bannedUntil)
}

// Ban bans the peer for the specified duration
func (p *Peer) Ban(duration time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.State = PeerStateBanned
	p.bannedUntil = time.Now().Add(duration)
}

// IncrementInvalid increments the invalid request counter
func (p *Peer) IncrementInvalid() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.invalidCount++
	return p.invalidCount
}

// ResetInvalid resets the invalid request counter
func (p *Peer) ResetInvalid() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.invalidCount = 0
}

// RecordRequest records a request for rate limiting
func (p *Peer) RecordRequest() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.requestCount++
	p.lastRequestAt = time.Now()
}

// GetRequestCount returns the request count
func (p *Peer) GetRequestCount() int64 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.requestCount
}

// ResetRequestCount resets the request counter
func (p *Peer) ResetRequestCount() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.requestCount = 0
}

// UpdateLastPing updates the last ping time
func (p *Peer) UpdateLastPing() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.LastPingAt = time.Now()
}

// UpdateLastPong updates the last pong time
func (p *Peer) UpdateLastPong() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.LastPongAt = time.Now()
}

// Ping sends a ping to this peer
func (p *Peer) Ping(ctx context.Context) (*pb.PingResponse, error) {
	p.mu.RLock()
	client := p.client
	token := p.Token
	p.mu.RUnlock()

	if client == nil {
		return nil, ErrNotConnected
	}

	p.UpdateLastPing()

	resp, err := client.Ping(ctx, &pb.PingRequest{
		Token:     token,
		Timestamp: time.Now().UnixNano(),
	})
	if err != nil {
		return nil, err
	}

	p.UpdateLastPong()
	return resp, nil
}

// GetPeers requests peers from this peer for discovery
func (p *Peer) GetPeers(ctx context.Context, maxPeers int) ([]*pb.PeerInfo, error) {
	p.mu.RLock()
	client := p.client
	token := p.Token
	p.mu.RUnlock()

	if client == nil {
		return nil, ErrNotConnected
	}

	resp, err := client.GetPeers(ctx, &pb.GetPeersRequest{
		Token:    token,
		MaxPeers: int32(maxPeers),
	})
	if err != nil {
		return nil, err
	}

	return resp.Peers, nil
}

// Disconnect sends a disconnect request
func (p *Peer) Disconnect(ctx context.Context, reason string) error {
	p.mu.RLock()
	client := p.client
	token := p.Token
	p.mu.RUnlock()

	if client == nil {
		return nil
	}

	_, err := client.Disconnect(ctx, &pb.DisconnectRequest{
		Token:  token,
		Reason: reason,
	})

	return err
}

// ToPeerInfo converts the peer to a PeerInfo protobuf message
func (p *Peer) ToPeerInfo() *pb.PeerInfo {
	p.mu.RLock()
	defer p.mu.RUnlock()

	return &pb.PeerInfo{
		NodeId:         p.NodeID,
		Address:        p.Address,
		ConnectedSince: p.ConnectedAt.Unix(),
	}
}
