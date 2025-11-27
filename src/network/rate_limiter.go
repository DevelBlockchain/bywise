package network

import (
	"sync"
	"time"

	"github.com/bywise/go-bywise/src/config"
)

// RateLimiter implements a token bucket rate limiter per peer
type RateLimiter struct {
	mu      sync.RWMutex
	config  config.RateLimitConfig
	buckets map[string]*tokenBucket
}

// tokenBucket implements a simple token bucket
type tokenBucket struct {
	tokens       float64
	maxTokens    float64
	refillRate   float64 // tokens per second
	lastRefill   time.Time
	invalidCount int
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(cfg config.RateLimitConfig) *RateLimiter {
	return &RateLimiter{
		config:  cfg,
		buckets: make(map[string]*tokenBucket),
	}
}

// Allow checks if a request from the given peer is allowed
func (r *RateLimiter) Allow(peerID string) bool {
	if !r.config.Enabled {
		return true
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	bucket, exists := r.buckets[peerID]
	if !exists {
		bucket = &tokenBucket{
			tokens:     float64(r.config.BurstSize),
			maxTokens:  float64(r.config.BurstSize),
			refillRate: float64(r.config.RequestsPerSecond),
			lastRefill: time.Now(),
		}
		r.buckets[peerID] = bucket
	}

	// Refill tokens based on elapsed time
	now := time.Now()
	elapsed := now.Sub(bucket.lastRefill).Seconds()
	bucket.tokens += elapsed * bucket.refillRate
	if bucket.tokens > bucket.maxTokens {
		bucket.tokens = bucket.maxTokens
	}
	bucket.lastRefill = now

	// Check if we have a token available
	if bucket.tokens >= 1 {
		bucket.tokens--
		return true
	}

	return false
}

// RecordInvalid records an invalid request from a peer
func (r *RateLimiter) RecordInvalid(peerID string) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	bucket, exists := r.buckets[peerID]
	if !exists {
		bucket = &tokenBucket{
			tokens:     float64(r.config.BurstSize),
			maxTokens:  float64(r.config.BurstSize),
			refillRate: float64(r.config.RequestsPerSecond),
			lastRefill: time.Now(),
		}
		r.buckets[peerID] = bucket
	}

	bucket.invalidCount++
	return bucket.invalidCount
}

// ResetInvalid resets the invalid count for a peer
func (r *RateLimiter) ResetInvalid(peerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if bucket, exists := r.buckets[peerID]; exists {
		bucket.invalidCount = 0
	}
}

// GetInvalidCount returns the invalid request count for a peer
func (r *RateLimiter) GetInvalidCount(peerID string) int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if bucket, exists := r.buckets[peerID]; exists {
		return bucket.invalidCount
	}
	return 0
}

// ShouldBan returns true if the peer should be banned
func (r *RateLimiter) ShouldBan(peerID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if bucket, exists := r.buckets[peerID]; exists {
		return bucket.invalidCount >= r.config.MaxInvalidRequests
	}
	return false
}

// RemovePeer removes a peer from the rate limiter
func (r *RateLimiter) RemovePeer(peerID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.buckets, peerID)
}

// GetBanDuration returns the ban duration from config
func (r *RateLimiter) GetBanDuration() time.Duration {
	return r.config.BanDuration
}

// Cleanup removes stale buckets (for peers that haven't made requests in a while)
func (r *RateLimiter) Cleanup(maxAge time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()

	cutoff := time.Now().Add(-maxAge)
	for peerID, bucket := range r.buckets {
		if bucket.lastRefill.Before(cutoff) {
			delete(r.buckets, peerID)
		}
	}
}
