package network

import (
	"testing"
	"time"
)

func TestNewPeer(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	if peer.NodeID != "node-123" {
		t.Errorf("Expected NodeID 'node-123', got '%s'", peer.NodeID)
	}

	if peer.Address != "localhost:8080" {
		t.Errorf("Expected Address 'localhost:8080', got '%s'", peer.Address)
	}

	if peer.State != PeerStateDisconnected {
		t.Errorf("Expected State Disconnected, got '%s'", peer.State)
	}
}

func TestPeerState(t *testing.T) {
	tests := []struct {
		state    PeerState
		expected string
	}{
		{PeerStateDisconnected, "disconnected"},
		{PeerStateConnecting, "connecting"},
		{PeerStateHandshaking, "handshaking"},
		{PeerStateConnected, "connected"},
		{PeerStateBanned, "banned"},
		{PeerState(99), "unknown"},
	}

	for _, tt := range tests {
		if tt.state.String() != tt.expected {
			t.Errorf("State %d: expected '%s', got '%s'", tt.state, tt.expected, tt.state.String())
		}
	}
}

func TestPeerIsConnected(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	if peer.IsConnected() {
		t.Error("New peer should not be connected")
	}

	peer.State = PeerStateConnected
	if !peer.IsConnected() {
		t.Error("Peer with Connected state should be connected")
	}

	peer.State = PeerStateConnecting
	if peer.IsConnected() {
		t.Error("Peer with Connecting state should not be connected")
	}
}

func TestPeerBan(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	if peer.IsBanned() {
		t.Error("New peer should not be banned")
	}

	// Ban for 1 second
	peer.Ban(1 * time.Second)

	if !peer.IsBanned() {
		t.Error("Peer should be banned")
	}

	if peer.State != PeerStateBanned {
		t.Errorf("Peer state should be Banned, got %s", peer.State)
	}

	// Wait for ban to expire
	time.Sleep(1100 * time.Millisecond)

	if peer.IsBanned() {
		t.Error("Peer should not be banned after ban expires")
	}
}

func TestPeerInvalidCounter(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	count := peer.IncrementInvalid()
	if count != 1 {
		t.Errorf("Expected invalid count 1, got %d", count)
	}

	count = peer.IncrementInvalid()
	if count != 2 {
		t.Errorf("Expected invalid count 2, got %d", count)
	}

	peer.ResetInvalid()
	count = peer.IncrementInvalid()
	if count != 1 {
		t.Errorf("Expected invalid count 1 after reset, got %d", count)
	}
}

func TestPeerRequestTracking(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	if peer.GetRequestCount() != 0 {
		t.Error("New peer should have 0 requests")
	}

	peer.RecordRequest()
	peer.RecordRequest()
	peer.RecordRequest()

	if peer.GetRequestCount() != 3 {
		t.Errorf("Expected 3 requests, got %d", peer.GetRequestCount())
	}

	peer.ResetRequestCount()
	if peer.GetRequestCount() != 0 {
		t.Errorf("Expected 0 requests after reset, got %d", peer.GetRequestCount())
	}
}

func TestPeerLastPingPong(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	if !peer.LastPingAt.IsZero() {
		t.Error("LastPingAt should be zero initially")
	}

	if !peer.LastPongAt.IsZero() {
		t.Error("LastPongAt should be zero initially")
	}

	peer.UpdateLastPing()
	if peer.LastPingAt.IsZero() {
		t.Error("LastPingAt should not be zero after UpdateLastPing")
	}

	peer.UpdateLastPong()
	if peer.LastPongAt.IsZero() {
		t.Error("LastPongAt should not be zero after UpdateLastPong")
	}
}

func TestPeerToPeerInfo(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")
	peer.ConnectedAt = time.Now()

	info := peer.ToPeerInfo()

	if info.NodeId != "node-123" {
		t.Errorf("Expected NodeId 'node-123', got '%s'", info.NodeId)
	}

	if info.Address != "localhost:8080" {
		t.Errorf("Expected Address 'localhost:8080', got '%s'", info.Address)
	}

	if info.ConnectedSince == 0 {
		t.Error("ConnectedSince should not be 0")
	}
}

func TestPeerClose(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	// Close without connection should not error
	err := peer.Close()
	if err != nil {
		t.Errorf("Close without connection should not error: %v", err)
	}

	// GetClient should return nil
	if peer.GetClient() != nil {
		t.Error("GetClient should return nil when no connection")
	}
}

func TestPeerConcurrentAccess(t *testing.T) {
	peer := NewPeer("node-123", "localhost:8080")

	done := make(chan bool)

	// Start multiple goroutines accessing peer
	for i := 0; i < 10; i++ {
		go func() {
			peer.RecordRequest()
			peer.GetRequestCount()
			peer.IncrementInvalid()
			peer.IsConnected()
			peer.IsBanned()
			peer.UpdateLastPing()
			peer.UpdateLastPong()
			peer.ToPeerInfo()
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}
