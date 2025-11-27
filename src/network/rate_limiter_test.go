package network

import (
	"testing"
	"time"

	"github.com/bywise/go-bywise/src/config"
)

func TestRateLimiterAllow(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:            true,
		RequestsPerSecond:  10,
		BurstSize:          20,
		BanDuration:        5 * time.Minute,
		MaxInvalidRequests: 5,
	}

	limiter := NewRateLimiter(cfg)

	// Should allow initial burst
	for i := 0; i < 20; i++ {
		if !limiter.Allow("peer1") {
			t.Errorf("Request %d should be allowed", i)
		}
	}

	// Should deny after burst is exhausted
	if limiter.Allow("peer1") {
		t.Error("Request should be denied after burst")
	}
}

func TestRateLimiterDisabled(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:           false,
		RequestsPerSecond: 1,
		BurstSize:         1,
	}

	limiter := NewRateLimiter(cfg)

	// Should allow all requests when disabled
	for i := 0; i < 100; i++ {
		if !limiter.Allow("peer1") {
			t.Error("All requests should be allowed when rate limiting is disabled")
		}
	}
}

func TestRateLimiterRefill(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:           true,
		RequestsPerSecond: 100, // 100 per second = 1 every 10ms
		BurstSize:         1,
	}

	limiter := NewRateLimiter(cfg)

	// Use the single token
	if !limiter.Allow("peer1") {
		t.Error("First request should be allowed")
	}

	// Should be denied immediately
	if limiter.Allow("peer1") {
		t.Error("Second request should be denied")
	}

	// Wait for refill (slightly more than 10ms for 1 token at 100/sec)
	time.Sleep(15 * time.Millisecond)

	// Should be allowed after refill
	if !limiter.Allow("peer1") {
		t.Error("Request should be allowed after refill")
	}
}

func TestRateLimiterInvalidRequests(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:            true,
		RequestsPerSecond:  100,
		BurstSize:          100,
		MaxInvalidRequests: 3,
		BanDuration:        5 * time.Minute,
	}

	limiter := NewRateLimiter(cfg)

	// Record invalid requests
	count := limiter.RecordInvalid("peer1")
	if count != 1 {
		t.Errorf("Expected count 1, got %d", count)
	}

	count = limiter.RecordInvalid("peer1")
	if count != 2 {
		t.Errorf("Expected count 2, got %d", count)
	}

	// Should not ban yet
	if limiter.ShouldBan("peer1") {
		t.Error("Should not ban after 2 invalid requests")
	}

	// Third invalid request
	limiter.RecordInvalid("peer1")

	// Should ban now
	if !limiter.ShouldBan("peer1") {
		t.Error("Should ban after 3 invalid requests")
	}
}

func TestRateLimiterResetInvalid(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:            true,
		RequestsPerSecond:  100,
		BurstSize:          100,
		MaxInvalidRequests: 3,
	}

	limiter := NewRateLimiter(cfg)

	// Record invalid requests
	limiter.RecordInvalid("peer1")
	limiter.RecordInvalid("peer1")

	if limiter.GetInvalidCount("peer1") != 2 {
		t.Error("Expected invalid count of 2")
	}

	// Reset
	limiter.ResetInvalid("peer1")

	if limiter.GetInvalidCount("peer1") != 0 {
		t.Error("Expected invalid count of 0 after reset")
	}
}

func TestRateLimiterRemovePeer(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:           true,
		RequestsPerSecond: 100,
		BurstSize:         100,
	}

	limiter := NewRateLimiter(cfg)

	// Create bucket for peer
	limiter.Allow("peer1")
	limiter.RecordInvalid("peer1")

	// Remove peer
	limiter.RemovePeer("peer1")

	// Should start fresh
	if limiter.GetInvalidCount("peer1") != 0 {
		t.Error("Invalid count should be 0 after removing peer")
	}
}

func TestRateLimiterCleanup(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:           true,
		RequestsPerSecond: 100,
		BurstSize:         100,
	}

	limiter := NewRateLimiter(cfg)

	// Create bucket for peer
	limiter.Allow("peer1")

	// Cleanup with very short max age
	limiter.Cleanup(1 * time.Nanosecond)

	// After cleanup, a new request should create a fresh bucket
	// The peer should still be allowed since it gets a fresh bucket
	if !limiter.Allow("peer1") {
		t.Error("Request should be allowed after cleanup")
	}
}

func TestRateLimiterMultiplePeers(t *testing.T) {
	cfg := config.RateLimitConfig{
		Enabled:           true,
		RequestsPerSecond: 10,
		BurstSize:         5,
	}

	limiter := NewRateLimiter(cfg)

	// Each peer should have independent rate limits
	for i := 0; i < 5; i++ {
		if !limiter.Allow("peer1") {
			t.Errorf("peer1 request %d should be allowed", i)
		}
		if !limiter.Allow("peer2") {
			t.Errorf("peer2 request %d should be allowed", i)
		}
	}

	// Both should be denied after burst
	if limiter.Allow("peer1") {
		t.Error("peer1 should be denied after burst")
	}
	if limiter.Allow("peer2") {
		t.Error("peer2 should be denied after burst")
	}
}

func TestRateLimiterGetBanDuration(t *testing.T) {
	expectedDuration := 10 * time.Minute
	cfg := config.RateLimitConfig{
		Enabled:     true,
		BanDuration: expectedDuration,
	}

	limiter := NewRateLimiter(cfg)

	if limiter.GetBanDuration() != expectedDuration {
		t.Errorf("Expected ban duration %v, got %v", expectedDuration, limiter.GetBanDuration())
	}
}
