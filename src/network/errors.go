package network

import "errors"

var (
	// ErrNotConnected is returned when trying to use a peer that is not connected
	ErrNotConnected = errors.New("peer not connected")

	// ErrAlreadyConnected is returned when trying to connect to an already connected peer
	ErrAlreadyConnected = errors.New("peer already connected")

	// ErrMaxConnectionsReached is returned when max connections limit is reached
	ErrMaxConnectionsReached = errors.New("max connections reached")

	// ErrHandshakeFailed is returned when handshake fails
	ErrHandshakeFailed = errors.New("handshake failed")

	// ErrInvalidToken is returned when an invalid token is provided
	ErrInvalidToken = errors.New("invalid token")

	// ErrPeerBanned is returned when trying to connect to a banned peer
	ErrPeerBanned = errors.New("peer is banned")

	// ErrRateLimitExceeded is returned when rate limit is exceeded
	ErrRateLimitExceeded = errors.New("rate limit exceeded")

	// ErrConnectionTimeout is returned when connection times out
	ErrConnectionTimeout = errors.New("connection timeout")

	// ErrPeerNotFound is returned when a peer is not found
	ErrPeerNotFound = errors.New("peer not found")

	// ErrSelfConnection is returned when trying to connect to self
	ErrSelfConnection = errors.New("cannot connect to self")

	// ErrNetworkStopped is returned when network operations are attempted on a stopped network
	ErrNetworkStopped = errors.New("network is stopped")
)
