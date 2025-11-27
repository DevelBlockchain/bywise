package config

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// NodeConfig represents a bootstrap node configuration
type NodeConfig struct {
	Address string `json:"address"` // host:port format
}

// DiscoveryConfig holds peer discovery settings
type DiscoveryConfig struct {
	Enabled          bool          `json:"enabled"`           // Enable peer discovery
	Interval         time.Duration `json:"interval"`          // Discovery interval
	MaxPeersToAsk    int           `json:"maxPeersToAsk"`     // Max peers to query for new peers
	MaxPeersPerQuery int           `json:"maxPeersPerQuery"`  // Max peers returned per query
}

// ConnectionConfig holds connection limits
type ConnectionConfig struct {
	MinConnections     int           `json:"minConnections"`     // Minimum connected peers
	MaxConnections     int           `json:"maxConnections"`     // Maximum connected peers
	ConnectionTimeout  time.Duration `json:"connectionTimeout"`  // Timeout for establishing connection
	HandshakeTimeout   time.Duration `json:"handshakeTimeout"`   // Timeout for handshake
	ReconnectInterval  time.Duration `json:"reconnectInterval"`  // Interval between reconnection attempts
	MaxReconnectAttempts int         `json:"maxReconnectAttempts"` // Max reconnection attempts before giving up
}

// RateLimitConfig holds rate limiting settings
type RateLimitConfig struct {
	Enabled            bool          `json:"enabled"`            // Enable rate limiting
	RequestsPerSecond  int           `json:"requestsPerSecond"`  // Max requests per second per peer
	BurstSize          int           `json:"burstSize"`          // Max burst size
	BanDuration        time.Duration `json:"banDuration"`        // Duration to ban misbehaving peers
	MaxInvalidRequests int           `json:"maxInvalidRequests"` // Max invalid requests before ban
}

// ServerConfig holds gRPC server settings
type ServerConfig struct {
	Host string `json:"host"` // Server bind address
	Port int    `json:"port"` // Server port
}

// TLSConfig holds TLS certificate settings
type TLSConfig struct {
	CertFile     string `json:"certFile"`     // Path to certificate file
	KeyFile      string `json:"keyFile"`      // Path to key file
	AutoGenerate bool   `json:"autoGenerate"` // Auto-generate self-signed cert if files don't exist
}

// APIAuthConfig holds API authentication settings
type APIAuthConfig struct {
	Enabled  bool   `json:"enabled"`  // Enable API authentication
	Username string `json:"username"` // Username for basic auth
	Password string `json:"password"` // Password for basic auth
}

// APIConfig holds HTTP API settings
type APIConfig struct {
	Enabled bool          `json:"enabled"` // Enable HTTP API
	Host    string        `json:"host"`    // API bind address
	Port    int           `json:"port"`    // API port
	Auth    APIAuthConfig `json:"auth"`    // Authentication settings
}


// BlockchainConfig holds blockchain settings
type BlockchainConfig struct {
	DataDir            string        `json:"dataDir"`            // Directory for blockchain data (LevelDB)
	BlockTime          time.Duration `json:"blockTime"`          // Target block time (default 5s)
	CheckpointInterval uint64        `json:"checkpointInterval"` // Blocks between checkpoints (default 50000)
	// Note: Mining and validator roles are auto-detected based on stake
}

// NetworkConfig is the main configuration structure
type NetworkConfig struct {
	NodeID         string           `json:"nodeId"`         // Unique node identifier
	BootstrapNodes []NodeConfig     `json:"bootstrapNodes"` // Initial nodes to connect
	Discovery      DiscoveryConfig  `json:"discovery"`      // Discovery settings
	Connection     ConnectionConfig `json:"connection"`     // Connection settings
	RateLimit      RateLimitConfig  `json:"rateLimit"`      // Rate limiting settings
	Server         ServerConfig     `json:"server"`         // Server settings
	TLS            TLSConfig        `json:"tls"`            // TLS settings
	API            APIConfig        `json:"api"`            // HTTP API settings
	Wallet         string           `json:"wallet"`         // Path to wallet file
	Blockchain     BlockchainConfig `json:"blockchain"`     // Blockchain settings
}

// DefaultConfig returns a NetworkConfig with sensible defaults
func DefaultConfig() *NetworkConfig {
	return &NetworkConfig{
		NodeID: "",
		BootstrapNodes: []NodeConfig{},
		Discovery: DiscoveryConfig{
			Enabled:          true,
			Interval:         30 * time.Second,
			MaxPeersToAsk:    5,
			MaxPeersPerQuery: 10,
		},
		Connection: ConnectionConfig{
			MinConnections:       3,
			MaxConnections:       50,
			ConnectionTimeout:    10 * time.Second,
			HandshakeTimeout:     5 * time.Second,
			ReconnectInterval:    30 * time.Second,
			MaxReconnectAttempts: 5,
		},
		RateLimit: RateLimitConfig{
			Enabled:            true,
			RequestsPerSecond:  100,
			BurstSize:          200,
			BanDuration:        5 * time.Minute,
			MaxInvalidRequests: 10,
		},
		Server: ServerConfig{
			Host: "0.0.0.0",
			Port: 8080,
		},
		TLS: TLSConfig{
			CertFile:     "certs/server.crt",
			KeyFile:      "certs/server.key",
			AutoGenerate: true,
		},
		API: APIConfig{
			Enabled: true,
			Host:    "0.0.0.0",
			Port:    8081,
			Auth: APIAuthConfig{
				Enabled:  false,
				Username: "",
				Password: "",
			},
		},
		Wallet: "wallet.json",
		Blockchain: BlockchainConfig{
			DataDir:            "data",
			BlockTime:          5 * time.Second,
			CheckpointInterval: 50000,
		},
	}
}

// LoadConfig loads configuration from a JSON file
func LoadConfig(path string) (*NetworkConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Start with defaults
	config := DefaultConfig()

	// Parse JSON into a map to handle duration conversion manually
	var rawConfig map[string]json.RawMessage
	if err := json.Unmarshal(data, &rawConfig); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	// Parse simple fields
	if nodeID, ok := rawConfig["nodeId"]; ok {
		json.Unmarshal(nodeID, &config.NodeID)
	}
	if bootstrap, ok := rawConfig["bootstrapNodes"]; ok {
		json.Unmarshal(bootstrap, &config.BootstrapNodes)
	}
	if server, ok := rawConfig["server"]; ok {
		json.Unmarshal(server, &config.Server)
	}
	if tls, ok := rawConfig["tls"]; ok {
		json.Unmarshal(tls, &config.TLS)
	}
	if api, ok := rawConfig["api"]; ok {
		json.Unmarshal(api, &config.API)
	}
	if wallet, ok := rawConfig["wallet"]; ok {
		json.Unmarshal(wallet, &config.Wallet)
	}

	// Parse nested configs with durations
	if err := parseDiscoveryConfig(rawConfig, config); err != nil {
		return nil, err
	}
	if err := parseConnectionConfig(rawConfig, config); err != nil {
		return nil, err
	}
	if err := parseRateLimitConfig(rawConfig, config); err != nil {
		return nil, err
	}
	if err := parseBlockchainConfig(rawConfig, config); err != nil {
		return nil, err
	}

	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	return config, nil
}

// parseDiscoveryConfig parses discovery settings from raw JSON
func parseDiscoveryConfig(rawConfig map[string]json.RawMessage, config *NetworkConfig) error {
	raw, ok := rawConfig["discovery"]
	if !ok {
		return nil
	}

	var disc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &disc); err != nil {
		return fmt.Errorf("failed to parse discovery config: %w", err)
	}

	if v, ok := disc["enabled"]; ok {
		json.Unmarshal(v, &config.Discovery.Enabled)
	}
	if v, ok := disc["maxPeersToAsk"]; ok {
		json.Unmarshal(v, &config.Discovery.MaxPeersToAsk)
	}
	if v, ok := disc["maxPeersPerQuery"]; ok {
		json.Unmarshal(v, &config.Discovery.MaxPeersPerQuery)
	}
	if v, ok := disc["interval"]; ok {
		if d, err := parseDuration(v); err == nil {
			config.Discovery.Interval = d
		}
	}

	return nil
}

// parseConnectionConfig parses connection settings from raw JSON
func parseConnectionConfig(rawConfig map[string]json.RawMessage, config *NetworkConfig) error {
	raw, ok := rawConfig["connection"]
	if !ok {
		return nil
	}

	var conn map[string]json.RawMessage
	if err := json.Unmarshal(raw, &conn); err != nil {
		return fmt.Errorf("failed to parse connection config: %w", err)
	}

	if v, ok := conn["minConnections"]; ok {
		json.Unmarshal(v, &config.Connection.MinConnections)
	}
	if v, ok := conn["maxConnections"]; ok {
		json.Unmarshal(v, &config.Connection.MaxConnections)
	}
	if v, ok := conn["maxReconnectAttempts"]; ok {
		json.Unmarshal(v, &config.Connection.MaxReconnectAttempts)
	}
	if v, ok := conn["connectionTimeout"]; ok {
		if d, err := parseDuration(v); err == nil {
			config.Connection.ConnectionTimeout = d
		}
	}
	if v, ok := conn["handshakeTimeout"]; ok {
		if d, err := parseDuration(v); err == nil {
			config.Connection.HandshakeTimeout = d
		}
	}
	if v, ok := conn["reconnectInterval"]; ok {
		if d, err := parseDuration(v); err == nil {
			config.Connection.ReconnectInterval = d
		}
	}

	return nil
}

// parseRateLimitConfig parses rate limit settings from raw JSON
func parseRateLimitConfig(rawConfig map[string]json.RawMessage, config *NetworkConfig) error {
	raw, ok := rawConfig["rateLimit"]
	if !ok {
		return nil
	}

	var rl map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rl); err != nil {
		return fmt.Errorf("failed to parse rateLimit config: %w", err)
	}

	if v, ok := rl["enabled"]; ok {
		json.Unmarshal(v, &config.RateLimit.Enabled)
	}
	if v, ok := rl["requestsPerSecond"]; ok {
		json.Unmarshal(v, &config.RateLimit.RequestsPerSecond)
	}
	if v, ok := rl["burstSize"]; ok {
		json.Unmarshal(v, &config.RateLimit.BurstSize)
	}
	if v, ok := rl["maxInvalidRequests"]; ok {
		json.Unmarshal(v, &config.RateLimit.MaxInvalidRequests)
	}
	if v, ok := rl["banDuration"]; ok {
		if d, err := parseDuration(v); err == nil {
			config.RateLimit.BanDuration = d
		}
	}

	return nil
}

// parseBlockchainConfig parses blockchain settings from raw JSON
func parseBlockchainConfig(rawConfig map[string]json.RawMessage, config *NetworkConfig) error {
	raw, ok := rawConfig["blockchain"]
	if !ok {
		return nil
	}

	var bc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &bc); err != nil {
		return fmt.Errorf("failed to parse blockchain config: %w", err)
	}

	if v, ok := bc["dataDir"]; ok {
		json.Unmarshal(v, &config.Blockchain.DataDir)
	}
	if v, ok := bc["checkpointInterval"]; ok {
		json.Unmarshal(v, &config.Blockchain.CheckpointInterval)
	}
	if v, ok := bc["blockTime"]; ok {
		if d, err := parseDuration(v); err == nil {
			config.Blockchain.BlockTime = d
		}
	}

	return nil
}

// parseDuration parses a duration from JSON (can be string like "30s" or number in nanoseconds)
func parseDuration(raw json.RawMessage) (time.Duration, error) {
	if raw == nil {
		return 0, fmt.Errorf("nil duration")
	}

	// Try string format first (e.g., "30s", "5m")
	var str string
	if err := json.Unmarshal(raw, &str); err == nil {
		return time.ParseDuration(str)
	}

	// Try number format (nanoseconds)
	var num int64
	if err := json.Unmarshal(raw, &num); err == nil {
		return time.Duration(num), nil
	}

	return 0, fmt.Errorf("invalid duration format")
}

// SaveConfig saves configuration to a JSON file
func SaveConfig(path string, config *NetworkConfig) error {
	// Create a serializable version with duration strings
	type serializableConfig struct {
		NodeID         string       `json:"nodeId"`
		BootstrapNodes []NodeConfig `json:"bootstrapNodes"`
		Discovery      struct {
			Enabled          bool   `json:"enabled"`
			Interval         string `json:"interval"`
			MaxPeersToAsk    int    `json:"maxPeersToAsk"`
			MaxPeersPerQuery int    `json:"maxPeersPerQuery"`
		} `json:"discovery"`
		Connection struct {
			MinConnections       int    `json:"minConnections"`
			MaxConnections       int    `json:"maxConnections"`
			ConnectionTimeout    string `json:"connectionTimeout"`
			HandshakeTimeout     string `json:"handshakeTimeout"`
			ReconnectInterval    string `json:"reconnectInterval"`
			MaxReconnectAttempts int    `json:"maxReconnectAttempts"`
		} `json:"connection"`
		RateLimit struct {
			Enabled            bool   `json:"enabled"`
			RequestsPerSecond  int    `json:"requestsPerSecond"`
			BurstSize          int    `json:"burstSize"`
			BanDuration        string `json:"banDuration"`
			MaxInvalidRequests int    `json:"maxInvalidRequests"`
		} `json:"rateLimit"`
		Server     ServerConfig `json:"server"`
		TLS        TLSConfig    `json:"tls"`
		API        APIConfig    `json:"api"`
		Wallet     string       `json:"wallet"`
		Blockchain struct {
			DataDir            string `json:"dataDir"`
			BlockTime          string `json:"blockTime"`
			CheckpointInterval uint64 `json:"checkpointInterval"`
		} `json:"blockchain"`
	}

	sc := serializableConfig{}
	sc.NodeID = config.NodeID
	sc.BootstrapNodes = config.BootstrapNodes
	sc.Discovery.Enabled = config.Discovery.Enabled
	sc.Discovery.Interval = config.Discovery.Interval.String()
	sc.Discovery.MaxPeersToAsk = config.Discovery.MaxPeersToAsk
	sc.Discovery.MaxPeersPerQuery = config.Discovery.MaxPeersPerQuery
	sc.Connection.MinConnections = config.Connection.MinConnections
	sc.Connection.MaxConnections = config.Connection.MaxConnections
	sc.Connection.ConnectionTimeout = config.Connection.ConnectionTimeout.String()
	sc.Connection.HandshakeTimeout = config.Connection.HandshakeTimeout.String()
	sc.Connection.ReconnectInterval = config.Connection.ReconnectInterval.String()
	sc.Connection.MaxReconnectAttempts = config.Connection.MaxReconnectAttempts
	sc.RateLimit.Enabled = config.RateLimit.Enabled
	sc.RateLimit.RequestsPerSecond = config.RateLimit.RequestsPerSecond
	sc.RateLimit.BurstSize = config.RateLimit.BurstSize
	sc.RateLimit.BanDuration = config.RateLimit.BanDuration.String()
	sc.RateLimit.MaxInvalidRequests = config.RateLimit.MaxInvalidRequests
	sc.Server = config.Server
	sc.TLS = config.TLS
	sc.API = config.API
	sc.Wallet = config.Wallet
	sc.Blockchain.DataDir = config.Blockchain.DataDir
	sc.Blockchain.BlockTime = config.Blockchain.BlockTime.String()
	sc.Blockchain.CheckpointInterval = config.Blockchain.CheckpointInterval

	data, err := json.MarshalIndent(sc, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// Validate checks if the configuration is valid
func (c *NetworkConfig) Validate() error {
	if c.Connection.MinConnections < 0 {
		return fmt.Errorf("minConnections must be >= 0")
	}
	if c.Connection.MaxConnections < c.Connection.MinConnections {
		return fmt.Errorf("maxConnections must be >= minConnections")
	}
	if c.Server.Port < 1 || c.Server.Port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	if c.RateLimit.Enabled {
		if c.RateLimit.RequestsPerSecond < 1 {
			return fmt.Errorf("requestsPerSecond must be >= 1")
		}
		if c.RateLimit.BurstSize < c.RateLimit.RequestsPerSecond {
			return fmt.Errorf("burstSize must be >= requestsPerSecond")
		}
	}
	if c.API.Auth.Enabled {
		if c.API.Auth.Username == "" {
			return fmt.Errorf("api.auth.username is required when authentication is enabled")
		}
		if c.API.Auth.Password == "" {
			return fmt.Errorf("api.auth.password is required when authentication is enabled")
		}
	}
	return nil
}

// GetServerAddress returns the full server address
func (c *NetworkConfig) GetServerAddress() string {
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.Port)
}
