package crypto

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateSelfSignedCert(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "bywise-tls-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certFile := filepath.Join(tmpDir, "server.crt")
	keyFile := filepath.Join(tmpDir, "server.key")

	manager := NewTLSManager(certFile, keyFile)

	// Generate certificate
	err = manager.GenerateSelfSignedCert([]string{"localhost", "127.0.0.1"})
	if err != nil {
		t.Fatalf("Failed to generate certificate: %v", err)
	}

	// Check files exist
	if _, err := os.Stat(certFile); os.IsNotExist(err) {
		t.Error("Certificate file was not created")
	}

	if _, err := os.Stat(keyFile); os.IsNotExist(err) {
		t.Error("Key file was not created")
	}

	// Check key file permissions
	info, err := os.Stat(keyFile)
	if err != nil {
		t.Fatalf("Failed to stat key file: %v", err)
	}

	// On Unix systems, check permissions
	if info.Mode().Perm() != 0600 {
		t.Errorf("Key file should have 0600 permissions, got %o", info.Mode().Perm())
	}
}

func TestLoadOrGenerateTLS(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "bywise-tls-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certFile := filepath.Join(tmpDir, "certs", "server.crt")
	keyFile := filepath.Join(tmpDir, "certs", "server.key")

	manager := NewTLSManager(certFile, keyFile)

	// Test auto-generate
	tlsConfig, err := manager.LoadOrGenerateTLS([]string{"localhost"}, true)
	if err != nil {
		t.Fatalf("Failed to generate TLS config: %v", err)
	}

	if tlsConfig == nil {
		t.Fatal("TLS config is nil")
	}

	if len(tlsConfig.Certificates) == 0 {
		t.Error("TLS config has no certificates")
	}

	// Test loading existing certificates
	tlsConfig2, err := manager.LoadOrGenerateTLS([]string{"localhost"}, true)
	if err != nil {
		t.Fatalf("Failed to load TLS config: %v", err)
	}

	if tlsConfig2 == nil {
		t.Fatal("TLS config is nil on second load")
	}
}

func TestLoadOrGenerateTLSNoAutoGenerate(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "bywise-tls-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	certFile := filepath.Join(tmpDir, "nonexistent.crt")
	keyFile := filepath.Join(tmpDir, "nonexistent.key")

	manager := NewTLSManager(certFile, keyFile)

	// Should fail without auto-generate
	_, err = manager.LoadOrGenerateTLS([]string{"localhost"}, false)
	if err == nil {
		t.Error("Expected error when certificates don't exist and auto-generate is disabled")
	}
}

func TestGetClientTLSConfig(t *testing.T) {
	config := GetClientTLSConfig()

	if config == nil {
		t.Fatal("Client TLS config is nil")
	}

	if !config.InsecureSkipVerify {
		t.Error("Client TLS config should skip verification for self-signed certs")
	}
}

func TestGenerateToken(t *testing.T) {
	token1, err := GenerateToken()
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	if len(token1) != 64 { // 32 bytes = 64 hex characters
		t.Errorf("Token length should be 64, got %d", len(token1))
	}

	// Generate another token and ensure it's different
	token2, err := GenerateToken()
	if err != nil {
		t.Fatalf("Failed to generate second token: %v", err)
	}

	if token1 == token2 {
		t.Error("Two generated tokens should be different")
	}
}

func TestGenerateNodeID(t *testing.T) {
	nodeID1, err := GenerateNodeID()
	if err != nil {
		t.Fatalf("Failed to generate node ID: %v", err)
	}

	if len(nodeID1) < 10 {
		t.Errorf("Node ID seems too short: %s", nodeID1)
	}

	// Check prefix
	if nodeID1[:5] != "node-" {
		t.Errorf("Node ID should start with 'node-', got %s", nodeID1)
	}

	// Generate another and ensure it's different
	nodeID2, err := GenerateNodeID()
	if err != nil {
		t.Fatalf("Failed to generate second node ID: %v", err)
	}

	if nodeID1 == nodeID2 {
		t.Error("Two generated node IDs should be different")
	}
}
