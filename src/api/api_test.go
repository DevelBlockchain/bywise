package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/bywise/go-bywise/src/config"
	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/network"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

// Test helper to create a test API server
func setupTestAPI(t *testing.T) (*APIServer, *storage.Storage, *wallet.Wallet, func()) {
	// Create temp directory for test data
	tempDir, err := os.MkdirTemp("", "api_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	// Create test wallet
	w, err := wallet.NewWallet()
	if err != nil {
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// Create test storage
	store, err := storage.NewStorage(tempDir)
	if err != nil {
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to create storage: %v", err)
	}

	// Initialize blockchain with genesis block
	minerAddr, _ := core.AddressFromHex(w.Address())
	genesisBlock := core.NewGenesisBlock(minerAddr)
	if err := genesisBlock.Sign(w); err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to sign genesis block: %v", err)
	}

	if err := store.SaveBlock(genesisBlock); err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to save genesis block: %v", err)
	}

	if err := store.SetLatestBlockNumber(0); err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to set latest block number: %v", err)
	}

	// Set initial balance
	account, _ := store.GetAccount(minerAddr)
	account.Balance = core.NewBigInt(1000000000000)
	if err := store.SetAccount(account); err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to set account balance: %v", err)
	}

	// Create mock network
	netCfg := config.DefaultConfig()
	net, err := network.NewNetwork(netCfg)
	if err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to create network: %v", err)
	}

	// Create API server
	apiCfg := config.APIConfig{
		Enabled: true,
		Host:    "127.0.0.1",
		Port:    0, // Use any available port
	}
	api := NewAPIServer(apiCfg, net, w)

	// Create blockchain API
	blockchainAPI := NewBlockchainAPI(store, nil)
	api.RegisterBlockchainAPI(blockchainAPI)

	cleanup := func() {
		net.Stop()
		store.Close()
		os.RemoveAll(tempDir)
	}

	return api, store, w, cleanup
}

// Helper to make HTTP requests to the API
func makeRequest(t *testing.T, api *APIServer, method, path string, body string) *httptest.ResponseRecorder {
	var reqBody io.Reader
	if body != "" {
		reqBody = strings.NewReader(body)
	}

	req := httptest.NewRequest(method, path, reqBody)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	rr := httptest.NewRecorder()

	// Create a handler from the API
	mux := http.NewServeMux()
	mux.HandleFunc("/", api.handleRoot)
	mux.HandleFunc("/api", api.handleAPIInfo)
	mux.HandleFunc("/health", api.handleHealth)
	mux.HandleFunc("/auth/status", api.handleAuthStatus)
	mux.HandleFunc("/info", api.handleInfo)
	mux.HandleFunc("/peers", api.handlePeers)

	// Add blockchain routes if available
	if api.blockchainAPI != nil {
		api.blockchainAPI.RegisterRoutes(mux)
	}

	mux.ServeHTTP(rr, req)
	return rr
}

// TestHandleRoot tests the root endpoint
func TestHandleRoot(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	contentType := rr.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		t.Errorf("Expected text/html content type, got %s", contentType)
	}
}

// TestHandleAPIInfo tests the /api endpoint
func TestHandleAPIInfo(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/api", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	if response["name"] != "Bywise Node API" {
		t.Errorf("Expected name 'Bywise Node API', got %v", response["name"])
	}

	if response["version"] != "1.0.0" {
		t.Errorf("Expected version '1.0.0', got %v", response["version"])
	}

	endpoints, ok := response["endpoints"].([]interface{})
	if !ok {
		t.Error("Expected endpoints to be an array")
	}

	if len(endpoints) == 0 {
		t.Error("Expected at least one endpoint")
	}
}

// TestHandleHealth tests the /health endpoint
func TestHandleHealth(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/health", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Check status field exists
	if _, ok := response["status"]; !ok {
		t.Error("Expected 'status' field in response")
	}

	// Check connectedPeers field exists
	if _, ok := response["connectedPeers"]; !ok {
		t.Error("Expected 'connectedPeers' field in response")
	}

	// Check minConnections field exists
	if _, ok := response["minConnections"]; !ok {
		t.Error("Expected 'minConnections' field in response")
	}
}

// TestHandleAuthStatus tests the /auth/status endpoint
func TestHandleAuthStatus(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/auth/status", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Check authRequired field
	authRequired, ok := response["authRequired"].(bool)
	if !ok {
		t.Error("Expected 'authRequired' to be a boolean")
	}

	if authRequired {
		t.Error("Expected authRequired to be false by default")
	}

	// Check authenticated field
	authenticated, ok := response["authenticated"].(bool)
	if !ok {
		t.Error("Expected 'authenticated' to be a boolean")
	}

	if !authenticated {
		t.Error("Expected authenticated to be true when auth is disabled")
	}
}

// TestHandleAuthStatusWithAuth tests the /auth/status endpoint with auth enabled
func TestHandleAuthStatusWithAuth(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	// Enable auth
	api.authEnabled = true
	api.authUsername = "admin"
	api.authPassword = "password123"

	// Test without credentials
	rr := makeRequest(t, api, "GET", "/auth/status", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	authRequired, _ := response["authRequired"].(bool)
	if !authRequired {
		t.Error("Expected authRequired to be true")
	}

	authenticated, _ := response["authenticated"].(bool)
	if authenticated {
		t.Error("Expected authenticated to be false without credentials")
	}
}

// TestHandleInfo tests the /info endpoint
func TestHandleInfo(t *testing.T) {
	api, _, w, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/info", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response NodeInfo
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Check wallet address
	if response.WalletAddress != w.Address() {
		t.Errorf("Expected wallet address %s, got %s", w.Address(), response.WalletAddress)
	}

	// Check node ID is not empty
	if response.NodeID == "" {
		t.Error("Expected NodeID to be non-empty")
	}
}

// TestHandlePeers tests the /peers endpoint
func TestHandlePeers(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/peers", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Check count field
	count, ok := response["count"].(float64)
	if !ok {
		t.Error("Expected 'count' to be a number")
	}

	if count != 0 {
		t.Errorf("Expected 0 peers, got %v", count)
	}

	// Check peers field
	peers, ok := response["peers"].([]interface{})
	if !ok {
		t.Error("Expected 'peers' to be an array")
	}

	if len(peers) != 0 {
		t.Errorf("Expected empty peers array, got %v", peers)
	}
}

// TestHandleBlockchainInfo tests the /blockchain/info endpoint
func TestHandleBlockchainInfo(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/blockchain/info", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response BlockchainInfoResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Check latest block
	if response.LatestBlock != 0 {
		t.Errorf("Expected latest block 0, got %d", response.LatestBlock)
	}
}

// TestHandleGetBlock tests the /blockchain/block endpoint
func TestHandleGetBlock(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	// Test getting latest block
	rr := makeRequest(t, api, "GET", "/blockchain/block", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response BlockResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	if response.Number != 0 {
		t.Errorf("Expected block number 0, got %d", response.Number)
	}

	// Test getting block by number
	rr = makeRequest(t, api, "GET", "/blockchain/block?number=0", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	// Test getting non-existent block
	rr = makeRequest(t, api, "GET", "/blockchain/block?number=999", "")

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for non-existent block, got %d", rr.Code)
	}
}

// TestHandleGetBlocks tests the /blockchain/blocks endpoint
func TestHandleGetBlocks(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/blockchain/blocks?limit=10", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	blocks, ok := response["blocks"].([]interface{})
	if !ok {
		t.Error("Expected 'blocks' to be an array")
	}

	if len(blocks) != 1 {
		t.Errorf("Expected 1 block, got %d", len(blocks))
	}
}

// TestHandleGetAccount tests the /blockchain/account endpoint
func TestHandleGetAccount(t *testing.T) {
	api, _, w, cleanup := setupTestAPI(t)
	defer cleanup()

	// Test getting account info
	rr := makeRequest(t, api, "GET", "/blockchain/account?address="+w.Address(), "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response AccountResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	if strings.ToLower(response.Address) != strings.ToLower(w.Address()) {
		t.Errorf("Expected address %s, got %s", w.Address(), response.Address)
	}

	if response.Balance != "1000000000000" {
		t.Errorf("Expected balance 1000000000000, got %s", response.Balance)
	}

	// Test without address parameter
	rr = makeRequest(t, api, "GET", "/blockchain/account", "")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 without address, got %d", rr.Code)
	}

	// Test with invalid address
	rr = makeRequest(t, api, "GET", "/blockchain/account?address=invalid", "")

	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400 for invalid address, got %d", rr.Code)
	}
}

// TestHandleNotFound tests 404 handling
func TestHandleNotFound(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	rr := makeRequest(t, api, "GET", "/nonexistent", "")

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", rr.Code)
	}
}

// TestCORSHeaders tests that CORS headers are set correctly
func TestCORSHeaders(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	// Test OPTIONS request
	req := httptest.NewRequest("OPTIONS", "/api", nil)
	rr := httptest.NewRecorder()

	handler := api.corsMiddleware(http.HandlerFunc(api.handleAPIInfo))
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200 for OPTIONS, got %d", rr.Code)
	}

	// Check CORS headers
	if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("Expected Access-Control-Allow-Origin header to be *")
	}
}

// TestAPIServerStartStop tests starting and stopping the API server
func TestAPIServerStartStop(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	// Update config to use a specific port
	api.config.Port = 18081

	// Start server
	if err := api.Start(); err != nil {
		t.Fatalf("Failed to start API server: %v", err)
	}

	// Give it time to start
	time.Sleep(100 * time.Millisecond)

	// Make a request to verify it's running
	resp, err := http.Get("http://127.0.0.1:18081/health")
	if err != nil {
		t.Fatalf("Failed to make request to running server: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200 from running server, got %d", resp.StatusCode)
	}

	// Stop server
	if err := api.Stop(); err != nil {
		t.Errorf("Failed to stop API server: %v", err)
	}

	// Give it time to stop
	time.Sleep(100 * time.Millisecond)
}

// TestAuthProtectedEndpoints tests that protected endpoints require auth when enabled
func TestAuthProtectedEndpoints(t *testing.T) {
	api, _, _, cleanup := setupTestAPI(t)
	defer cleanup()

	// Enable auth
	api.authEnabled = true
	api.authUsername = "admin"
	api.authPassword = "password123"

	// Test protected endpoint without auth
	mux := http.NewServeMux()
	mux.HandleFunc("/info", api.withAuth(api.handleInfo))

	req := httptest.NewRequest("GET", "/info", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 without auth, got %d", rr.Code)
	}

	// Test with correct credentials
	req = httptest.NewRequest("GET", "/info", nil)
	req.SetBasicAuth("admin", "password123")
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200 with correct auth, got %d", rr.Code)
	}

	// Test with wrong credentials
	req = httptest.NewRequest("GET", "/info", nil)
	req.SetBasicAuth("admin", "wrongpassword")
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected status 401 with wrong password, got %d", rr.Code)
	}
}
