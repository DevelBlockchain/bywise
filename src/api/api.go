package api

import (
	"context"
	"crypto/subtle"
	"embed"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/bywise/go-bywise/src/config"
	"github.com/bywise/go-bywise/src/network"
	"github.com/bywise/go-bywise/src/wallet"
)

//go:embed static/*
var staticFiles embed.FS

// NodeInfo represents node information returned by the API
type NodeInfo struct {
	NodeID          string `json:"nodeId"`
	WalletAddress   string `json:"walletAddress"`
	Address         string `json:"address"`
	ConnectedPeers  int    `json:"connectedPeers"`
	MaxConnections  int    `json:"maxConnections"`
	MinConnections  int    `json:"minConnections"`
	DiscoveryActive bool   `json:"discoveryActive"`
	Uptime          string `json:"uptime"`
}

// PeerInfo represents a connected peer
type PeerInfo struct {
	NodeID      string `json:"nodeId"`
	Address     string `json:"address"`
	ConnectedAt string `json:"connectedAt"`
	IsInbound   bool   `json:"isInbound"`
}

// APIServer provides HTTP API for node information
type APIServer struct {
	config        config.APIConfig
	network       *network.Network
	wallet        *wallet.Wallet
	server        *http.Server
	startTime     time.Time
	mux           *http.ServeMux
	blockchainAPI *BlockchainAPI
	validatorAPI  *ValidatorAPI
	authEnabled   bool
	authUsername  string
	authPassword  string
}

// NewAPIServer creates a new API server
func NewAPIServer(cfg config.APIConfig, net *network.Network, w *wallet.Wallet) *APIServer {
	return &APIServer{
		config:       cfg,
		network:      net,
		wallet:       w,
		startTime:    time.Now(),
		mux:          http.NewServeMux(),
		authEnabled:  cfg.Auth.Enabled,
		authUsername: cfg.Auth.Username,
		authPassword: cfg.Auth.Password,
	}
}

// RegisterBlockchainAPI registers the blockchain API routes
func (a *APIServer) RegisterBlockchainAPI(api *BlockchainAPI) {
	a.blockchainAPI = api
}

// RegisterValidatorAPI registers the validator API routes
func (a *APIServer) RegisterValidatorAPI(api *ValidatorAPI) {
	a.validatorAPI = api
}

// Start starts the HTTP API server
func (a *APIServer) Start() error {
	if !a.config.Enabled {
		return nil
	}

	// Register public routes (no auth required)
	a.mux.HandleFunc("/", a.handleRoot)
	a.mux.HandleFunc("/api", a.handleAPIInfo)
	a.mux.HandleFunc("/health", a.handleHealth)
	a.mux.HandleFunc("/auth/status", a.handleAuthStatus)

	// Register protected routes
	a.mux.HandleFunc("/info", a.withAuth(a.handleInfo))
	a.mux.HandleFunc("/peers", a.withAuth(a.handlePeers))

	// Register blockchain routes if available
	if a.blockchainAPI != nil {
		a.blockchainAPI.RegisterRoutesWithAuth(a.mux, a.withAuth)
	}

	// Register validator routes if available
	if a.validatorAPI != nil {
		a.validatorAPI.RegisterRoutesWithAuth(a.mux, a.withAuth)
	}

	addr := fmt.Sprintf("%s:%d", a.config.Host, a.config.Port)
	a.server = &http.Server{
		Addr:         addr,
		Handler:      a.corsMiddleware(a.mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[API] HTTP server started on %s", addr)
		if a.authEnabled {
			log.Printf("[API] Authentication enabled")
		}
		if err := a.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[API] HTTP server error: %v", err)
		}
	}()

	return nil
}

// Stop stops the HTTP API server
func (a *APIServer) Stop() error {
	if a.server == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return a.server.Shutdown(ctx)
}

// corsMiddleware adds CORS headers to responses
func (a *APIServer) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleRoot serves the wallet UI at root
func (a *APIServer) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	content, err := staticFiles.ReadFile("static/wallet.html")
	if err != nil {
		// Fallback to JSON API info if wallet UI not available
		a.handleAPIInfo(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(content)
}

// handleAPIInfo returns API endpoints info as JSON
func (a *APIServer) handleAPIInfo(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"name":    "Bywise Node API",
		"version": "1.0.0",
		"endpoints": []string{
			"/api",
			"/info",
			"/peers",
			"/health",
			"/blockchain/info",
			"/blockchain/block",
			"/blockchain/tx",
			"/blockchain/tx/submit",
			"/validator/info",
			"/validator/execute",
			"/validator/simulate",
			"/validator/sign",
		},
	}
	a.jsonResponse(w, response)
}

// handleInfo returns node information
func (a *APIServer) handleInfo(w http.ResponseWriter, r *http.Request) {
	walletAddress := ""
	if a.wallet != nil {
		walletAddress = a.wallet.Address()
	}

	info := NodeInfo{
		NodeID:          a.network.GetNodeID(),
		WalletAddress:   walletAddress,
		Address:         a.network.GetAddress(),
		ConnectedPeers:  a.network.ConnectedPeerCount(),
		MaxConnections:  a.network.GetMaxConnections(),
		MinConnections:  a.network.GetMinConnections(),
		DiscoveryActive: a.network.IsDiscoveryEnabled(),
		Uptime:          time.Since(a.startTime).Round(time.Second).String(),
	}

	a.jsonResponse(w, info)
}

// handlePeers returns list of connected peers
func (a *APIServer) handlePeers(w http.ResponseWriter, r *http.Request) {
	connectedPeers := a.network.GetConnectedPeers()

	peers := make([]PeerInfo, 0, len(connectedPeers))
	for _, p := range connectedPeers {
		peers = append(peers, PeerInfo{
			NodeID:      p.NodeID,
			Address:     p.Address,
			ConnectedAt: p.ConnectedAt.Format(time.RFC3339),
			IsInbound:   p.IsInbound(),
		})
	}

	response := map[string]interface{}{
		"count": len(peers),
		"peers": peers,
	}

	a.jsonResponse(w, response)
}

// handleHealth returns health status
func (a *APIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	connectedPeers := a.network.ConnectedPeerCount()
	minConnections := a.network.GetMinConnections()

	status := "healthy"
	if connectedPeers < minConnections {
		status = "degraded"
	}

	response := map[string]interface{}{
		"status":         status,
		"connectedPeers": connectedPeers,
		"minConnections": minConnections,
	}

	a.jsonResponse(w, response)
}

// jsonResponse writes a JSON response
func (a *APIServer) jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")

	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
	}
}

// AuthWrapper is a function type for wrapping handlers with authentication
type AuthWrapper func(http.HandlerFunc) http.HandlerFunc

// withAuth wraps a handler with basic authentication if enabled
func (a *APIServer) withAuth(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !a.authEnabled {
			handler(w, r)
			return
		}

		username, password, ok := r.BasicAuth()
		if !ok {
			w.Header().Set("WWW-Authenticate", `Basic realm="Bywise API"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		usernameMatch := subtle.ConstantTimeCompare([]byte(username), []byte(a.authUsername)) == 1
		passwordMatch := subtle.ConstantTimeCompare([]byte(password), []byte(a.authPassword)) == 1

		if !usernameMatch || !passwordMatch {
			w.Header().Set("WWW-Authenticate", `Basic realm="Bywise API"`)
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		handler(w, r)
	}
}

// handleAuthStatus returns the authentication status
func (a *APIServer) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"authRequired": a.authEnabled,
	}

	// Check if the request has valid credentials
	if a.authEnabled {
		username, password, ok := r.BasicAuth()
		if ok {
			usernameMatch := subtle.ConstantTimeCompare([]byte(username), []byte(a.authUsername)) == 1
			passwordMatch := subtle.ConstantTimeCompare([]byte(password), []byte(a.authPassword)) == 1
			response["authenticated"] = usernameMatch && passwordMatch
		} else {
			response["authenticated"] = false
		}
	} else {
		response["authenticated"] = true
	}

	a.jsonResponse(w, response)
}

