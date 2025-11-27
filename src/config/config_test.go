package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg == nil {
		t.Fatal("DefaultConfig returned nil")
	}

	// Check default values
	if cfg.Connection.MinConnections != 3 {
		t.Errorf("Expected MinConnections=3, got %d", cfg.Connection.MinConnections)
	}

	if cfg.Connection.MaxConnections != 50 {
		t.Errorf("Expected MaxConnections=50, got %d", cfg.Connection.MaxConnections)
	}

	if cfg.Server.Port != 8080 {
		t.Errorf("Expected Port=8080, got %d", cfg.Server.Port)
	}

	if !cfg.Discovery.Enabled {
		t.Error("Expected Discovery.Enabled=true")
	}

	if !cfg.RateLimit.Enabled {
		t.Error("Expected RateLimit.Enabled=true")
	}

	if !cfg.TLS.AutoGenerate {
		t.Error("Expected TLS.AutoGenerate=true")
	}
}

func TestValidateConfig(t *testing.T) {
	tests := []struct {
		name      string
		modify    func(*NetworkConfig)
		expectErr bool
	}{
		{
			name:      "valid default config",
			modify:    func(c *NetworkConfig) {},
			expectErr: false,
		},
		{
			name: "negative min connections",
			modify: func(c *NetworkConfig) {
				c.Connection.MinConnections = -1
			},
			expectErr: true,
		},
		{
			name: "max less than min connections",
			modify: func(c *NetworkConfig) {
				c.Connection.MinConnections = 10
				c.Connection.MaxConnections = 5
			},
			expectErr: true,
		},
		{
			name: "invalid port - too low",
			modify: func(c *NetworkConfig) {
				c.Server.Port = 0
			},
			expectErr: true,
		},
		{
			name: "invalid port - too high",
			modify: func(c *NetworkConfig) {
				c.Server.Port = 70000
			},
			expectErr: true,
		},
		{
			name: "invalid rate limit - requests per second",
			modify: func(c *NetworkConfig) {
				c.RateLimit.Enabled = true
				c.RateLimit.RequestsPerSecond = 0
			},
			expectErr: true,
		},
		{
			name: "invalid rate limit - burst less than rps",
			modify: func(c *NetworkConfig) {
				c.RateLimit.Enabled = true
				c.RateLimit.RequestsPerSecond = 100
				c.RateLimit.BurstSize = 50
			},
			expectErr: true,
		},
		{
			name: "rate limit disabled - invalid values ok",
			modify: func(c *NetworkConfig) {
				c.RateLimit.Enabled = false
				c.RateLimit.RequestsPerSecond = 0
			},
			expectErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := DefaultConfig()
			tt.modify(cfg)

			err := cfg.Validate()
			if tt.expectErr && err == nil {
				t.Error("Expected error but got nil")
			}
			if !tt.expectErr && err != nil {
				t.Errorf("Expected no error but got: %v", err)
			}
		})
	}
}

func TestSaveAndLoadConfig(t *testing.T) {
	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "bywise-config-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "config.json")

	// Create config with custom values
	original := DefaultConfig()
	original.NodeID = "test-node-123"
	original.Server.Port = 9090
	original.Connection.MinConnections = 5
	original.Connection.MaxConnections = 100
	original.Discovery.Interval = 45 * time.Second
	original.RateLimit.BanDuration = 10 * time.Minute
	original.BootstrapNodes = []NodeConfig{
		{Address: "localhost:8081"},
		{Address: "localhost:8082"},
	}

	// Save config
	err = SaveConfig(configPath, original)
	if err != nil {
		t.Fatalf("Failed to save config: %v", err)
	}

	// Load config
	loaded, err := LoadConfig(configPath)
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	// Verify values
	if loaded.NodeID != original.NodeID {
		t.Errorf("NodeID mismatch: expected %s, got %s", original.NodeID, loaded.NodeID)
	}

	if loaded.Server.Port != original.Server.Port {
		t.Errorf("Port mismatch: expected %d, got %d", original.Server.Port, loaded.Server.Port)
	}

	if loaded.Connection.MinConnections != original.Connection.MinConnections {
		t.Errorf("MinConnections mismatch: expected %d, got %d",
			original.Connection.MinConnections, loaded.Connection.MinConnections)
	}

	if loaded.Connection.MaxConnections != original.Connection.MaxConnections {
		t.Errorf("MaxConnections mismatch: expected %d, got %d",
			original.Connection.MaxConnections, loaded.Connection.MaxConnections)
	}

	if loaded.Discovery.Interval != original.Discovery.Interval {
		t.Errorf("Discovery.Interval mismatch: expected %v, got %v",
			original.Discovery.Interval, loaded.Discovery.Interval)
	}

	if loaded.RateLimit.BanDuration != original.RateLimit.BanDuration {
		t.Errorf("BanDuration mismatch: expected %v, got %v",
			original.RateLimit.BanDuration, loaded.RateLimit.BanDuration)
	}

	if len(loaded.BootstrapNodes) != len(original.BootstrapNodes) {
		t.Errorf("BootstrapNodes count mismatch: expected %d, got %d",
			len(original.BootstrapNodes), len(loaded.BootstrapNodes))
	}
}

func TestLoadConfigFileNotFound(t *testing.T) {
	_, err := LoadConfig("/nonexistent/path/config.json")
	if err == nil {
		t.Error("Expected error for nonexistent file")
	}
}

func TestLoadConfigInvalidJSON(t *testing.T) {
	// Create temp file with invalid JSON
	tmpDir, err := os.MkdirTemp("", "bywise-config-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	configPath := filepath.Join(tmpDir, "invalid.json")
	err = os.WriteFile(configPath, []byte("not valid json {"), 0644)
	if err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	_, err = LoadConfig(configPath)
	if err == nil {
		t.Error("Expected error for invalid JSON")
	}
}

func TestGetServerAddress(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Server.Host = "192.168.1.1"
	cfg.Server.Port = 9999

	expected := "192.168.1.1:9999"
	got := cfg.GetServerAddress()

	if got != expected {
		t.Errorf("Expected %s, got %s", expected, got)
	}
}
