package network

import (
	"context"
	"log"
	"time"

	pb "github.com/bywise/go-bywise/src/proto/pb"
)

// GRPCServer implements the NodeService gRPC server
type GRPCServer struct {
	pb.UnimplementedNodeServiceServer
	network *Network
}

// NewGRPCServer creates a new gRPC server
func NewGRPCServer(network *Network) *GRPCServer {
	return &GRPCServer{
		network: network,
	}
}

// Handshake handles incoming handshake requests
func (s *GRPCServer) Handshake(ctx context.Context, req *pb.HandshakeRequest) (*pb.HandshakeResponse, error) {
	log.Printf("[Server] Received handshake request from node %s at %s", req.NodeId, req.Address)

	// Check if this is a self-connection
	if req.NodeId == s.network.nodeID {
		return &pb.HandshakeResponse{
			Accepted: false,
			Reason:   "cannot connect to self",
		}, nil
	}

	// Check if we already have this peer connected
	existingByNodeID := s.network.GetPeerByNodeID(req.NodeId)
	if existingByNodeID != nil {
		// Allow reverse connections in either direction:
		// - If we have an inbound connection (they connected to us first),
		//   now they're establishing reverse connection
		// - If we have an outbound connection (we connected to them first),
		//   now they're establishing reverse connection back to us
		// In both cases, generate a new token for this connection
		token, err := s.network.generateToken()
		if err != nil {
			return &pb.HandshakeResponse{
				Accepted: false,
				Reason:   "internal error",
			}, nil
		}
		// Update the peer's inbound token
		existingByNodeID.mu.Lock()
		existingByNodeID.InboundToken = token
		existingByNodeID.mu.Unlock()
		s.network.updateTokenMap(existingByNodeID, token)
		log.Printf("[Server] Accepted reverse connection from node %s", req.NodeId)
		return &pb.HandshakeResponse{
			Accepted:      true,
			NodeId:        s.network.nodeID,
			Token:         token,
			Timestamp:     time.Now().UnixNano(),
			NonceResponse: req.Nonce,
		}, nil
	}

	// Check if peer is banned
	existingPeer := s.network.GetPeerByAddress(req.Address)
	if existingPeer != nil && existingPeer.IsBanned() {
		return &pb.HandshakeResponse{
			Accepted: false,
			Reason:   "peer is banned",
		}, nil
	}

	// Generate token for this peer
	token, err := s.network.generateToken()
	if err != nil {
		return &pb.HandshakeResponse{
			Accepted: false,
			Reason:   "internal error",
		}, nil
	}

	// Create peer
	peer := NewPeer(req.NodeId, req.Address)
	peer.InboundToken = token
	peer.State = PeerStateConnected
	peer.ConnectedAt = time.Now()
	peer.isInbound = true

	// Try to add peer atomically (checks max connections and adds in one operation)
	if !s.network.tryAddPeer(peer) {
		// Max connections reached - remember peer for discovery purposes
		if req.Address != "" {
			s.network.discovery.AddKnownPeer(req.Address)
		}
		return &pb.HandshakeResponse{
			Accepted: false,
			Reason:   "max connections reached",
		}, nil
	}

	log.Printf("[Server] Accepted connection from node %s", req.NodeId)

	// Establish reverse connection to allow us to send messages to this peer
	go s.network.establishReverseConnection(peer)

	return &pb.HandshakeResponse{
		Accepted:      true,
		NodeId:        s.network.nodeID,
		Token:         token,
		Timestamp:     time.Now().UnixNano(),
		NonceResponse: req.Nonce, // Echo back nonce as simple challenge response
	}, nil
}

// GetPeers returns list of connected peers
// Note: This method allows unauthenticated queries for peer discovery purposes
func (s *GRPCServer) GetPeers(ctx context.Context, req *pb.GetPeersRequest) (*pb.GetPeersResponse, error) {
	var requestingPeerID string

	// If token is provided, validate it and apply rate limiting
	if req.Token != "" {
		peer := s.network.GetPeerByToken(req.Token)
		if peer == nil {
			return nil, ErrInvalidToken
		}

		// Record request for rate limiting
		if !s.network.checkRateLimit(peer) {
			return nil, ErrRateLimitExceeded
		}
		requestingPeerID = peer.NodeID
	}

	// Get connected peers
	connectedPeers := s.network.GetConnectedPeers()

	// Limit response size
	maxPeers := int(req.MaxPeers)
	if maxPeers <= 0 {
		maxPeers = 10
	}

	// Track addresses we've added to avoid duplicates
	addedAddresses := make(map[string]bool)
	peerInfos := make([]*pb.PeerInfo, 0, maxPeers)

	// Add connected peers first
	for _, p := range connectedPeers {
		if len(peerInfos) >= maxPeers {
			break
		}
		// Don't include the requesting peer in the response
		if p.NodeID != requestingPeerID && !addedAddresses[p.Address] {
			peerInfos = append(peerInfos, p.ToPeerInfo())
			addedAddresses[p.Address] = true
		}
	}

	// Also include known peers from discovery (important for when we're at max connections)
	// This helps new nodes discover other peers even if we can't accept connections
	knownPeers := s.network.discovery.GetKnownPeers()
	for _, addr := range knownPeers {
		if len(peerInfos) >= maxPeers {
			break
		}
		if !addedAddresses[addr] && addr != s.network.GetAddress() {
			peerInfos = append(peerInfos, &pb.PeerInfo{
				Address: addr,
			})
			addedAddresses[addr] = true
		}
	}

	// Also include this node's address so the requester knows about us
	if !addedAddresses[s.network.GetAddress()] {
		peerInfos = append(peerInfos, &pb.PeerInfo{
			NodeId:  s.network.nodeID,
			Address: s.network.GetAddress(),
		})
	}

	return &pb.GetPeersResponse{
		Peers: peerInfos,
	}, nil
}

// Ping handles ping requests for keepalive
func (s *GRPCServer) Ping(ctx context.Context, req *pb.PingRequest) (*pb.PingResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return nil, ErrInvalidToken
	}

	// Record request for rate limiting
	if !s.network.checkRateLimit(peer) {
		return nil, ErrRateLimitExceeded
	}

	peer.UpdateLastPong()

	return &pb.PingResponse{
		Timestamp:       req.Timestamp,
		ServerTimestamp: time.Now().UnixNano(),
	}, nil
}

// Disconnect handles disconnect requests
func (s *GRPCServer) Disconnect(ctx context.Context, req *pb.DisconnectRequest) (*pb.DisconnectResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.DisconnectResponse{Acknowledged: false}, nil
	}

	log.Printf("[Server] Peer %s requested disconnect: %s", peer.NodeID, req.Reason)

	// Remove peer
	s.network.removePeer(peer)

	return &pb.DisconnectResponse{
		Acknowledged: true,
	}, nil
}

// Request handles authenticated generic requests
func (s *GRPCServer) Request(ctx context.Context, req *pb.AuthenticatedRequest) (*pb.AuthenticatedResponse, error) {
	// Validate token
	peer := s.network.GetPeerByToken(req.Token)
	if peer == nil {
		return &pb.AuthenticatedResponse{
			Success:   false,
			Error:     "invalid token",
			RequestId: req.RequestId,
		}, nil
	}

	// Record request for rate limiting
	if !s.network.checkRateLimit(peer) {
		return &pb.AuthenticatedResponse{
			Success:   false,
			Error:     "rate limit exceeded",
			RequestId: req.RequestId,
		}, nil
	}

	// Handle the request based on method
	handler := s.network.GetRequestHandler(req.Method)
	if handler == nil {
		return &pb.AuthenticatedResponse{
			Success:   false,
			Error:     "unknown method",
			RequestId: req.RequestId,
		}, nil
	}

	response, err := handler(ctx, peer, req.Payload)
	if err != nil {
		// Record invalid request
		s.network.rateLimiter.RecordInvalid(peer.NodeID)
		if s.network.rateLimiter.ShouldBan(peer.NodeID) {
			peer.Ban(s.network.rateLimiter.GetBanDuration())
			s.network.removePeer(peer)
		}

		return &pb.AuthenticatedResponse{
			Success:   false,
			Error:     err.Error(),
			RequestId: req.RequestId,
		}, nil
	}

	// Reset invalid count on successful request
	s.network.rateLimiter.ResetInvalid(peer.NodeID)

	return &pb.AuthenticatedResponse{
		Success:   true,
		Payload:   response,
		RequestId: req.RequestId,
	}, nil
}
