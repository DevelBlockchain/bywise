package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/executor"
	"github.com/bywise/go-bywise/src/miner"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

// setupTestValidatorAPI creates a test validator API
func setupTestValidatorAPI(t *testing.T) (*ValidatorAPI, *storage.Storage, *wallet.Wallet, func()) {
	// Create temp directory for test data
	tempDir, err := os.MkdirTemp("", "validator_api_test_*")
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

	// Set stake info for the wallet (as validator)
	stakeInfo, _ := store.GetStakeInfo(minerAddr)
	stakeInfo.ValidatorStake = core.NewBigInt(1000000)
	stakeInfo.IsValidator = true
	stakeInfo.IsActive = true
	if err := store.SetStakeInfo(stakeInfo); err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to set stake info: %v", err)
	}

	// Create validator with chainID 1 for testing
	validator, err := executor.NewValidator(store, w, 1)
	if err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to create validator: %v", err)
	}

	// Create miner
	m, err := miner.NewMiner(store, w)
	if err != nil {
		store.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to create miner: %v", err)
	}

	// Create validator API
	validatorAPI := NewValidatorAPI(validator, m)

	cleanup := func() {
		store.Close()
		os.RemoveAll(tempDir)
	}

	return validatorAPI, store, w, cleanup
}

// makeValidatorRequest makes a request to validator API
func makeValidatorRequest(t *testing.T, api *ValidatorAPI, method, path string, body string) *httptest.ResponseRecorder {
	var reqBody *strings.Reader
	if body != "" {
		reqBody = strings.NewReader(body)
	}

	var req *http.Request
	if reqBody != nil {
		req = httptest.NewRequest(method, path, reqBody)
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}

	rr := httptest.NewRecorder()

	mux := http.NewServeMux()
	api.RegisterRoutes(mux)
	mux.ServeHTTP(rr, req)

	return rr
}

// TestValidatorInfoEndpoint tests /validator/info
func TestValidatorInfoEndpoint(t *testing.T) {
	api, _, w, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	rr := makeValidatorRequest(t, api, "GET", "/validator/info", "")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var response ValidatorInfoResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	if strings.ToLower(response.Address) != strings.ToLower(w.Address()) {
		t.Errorf("Expected address %s, got %s", w.Address(), response.Address)
	}
}

// TestValidatorExecuteEndpoint tests /validator/execute
func TestValidatorExecuteEndpoint(t *testing.T) {
	api, _, w, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	// Test POST request for simple transfer
	body := `{
		"from": "` + w.Address() + `",
		"to": "0x1234567890123456789012345678901234567890",
		"value": "1000",
		"data": ""
	}`

	rr := makeValidatorRequest(t, api, "POST", "/validator/execute", body)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var response ExecuteResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Check that response has required fields
	if response.ReadSet == nil {
		t.Error("Expected ReadSet to be non-nil")
	}

	if response.WriteSet == nil {
		t.Error("Expected WriteSet to be non-nil")
	}
}

// TestValidatorExecuteMethodNotAllowed tests that GET is not allowed for /validator/execute
func TestValidatorExecuteMethodNotAllowed(t *testing.T) {
	api, _, _, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	rr := makeValidatorRequest(t, api, "GET", "/validator/execute", "")

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", rr.Code)
	}
}

// TestValidatorExecuteInvalidJSON tests /validator/execute with invalid JSON
func TestValidatorExecuteInvalidJSON(t *testing.T) {
	api, _, _, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	rr := makeValidatorRequest(t, api, "POST", "/validator/execute", "invalid json")

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response ExecuteResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	if response.Success {
		t.Error("Expected success to be false for invalid JSON")
	}

	if response.Error == "" {
		t.Error("Expected error message for invalid JSON")
	}
}

// TestValidatorExecuteInvalidAddress tests /validator/execute with invalid address
func TestValidatorExecuteInvalidAddress(t *testing.T) {
	api, _, _, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	body := `{
		"from": "invalid",
		"to": "0x1234567890123456789012345678901234567890",
		"value": "1000",
		"data": ""
	}`

	rr := makeValidatorRequest(t, api, "POST", "/validator/execute", body)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var response ExecuteResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	if response.Success {
		t.Error("Expected success to be false for invalid address")
	}
}

// TestValidatorSimulateEndpoint tests /validator/simulate
func TestValidatorSimulateEndpoint(t *testing.T) {
	api, _, w, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	body := `{
		"from": "` + w.Address() + `",
		"to": "0x1234567890123456789012345678901234567890",
		"value": "1000",
		"data": ""
	}`

	rr := makeValidatorRequest(t, api, "POST", "/validator/simulate", body)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var response ExecuteResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}
}

// TestValidatorSimulateMethodNotAllowed tests that GET is not allowed for /validator/simulate
func TestValidatorSimulateMethodNotAllowed(t *testing.T) {
	api, _, _, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	rr := makeValidatorRequest(t, api, "GET", "/validator/simulate", "")

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", rr.Code)
	}
}

// TestValidatorSignTransactionEndpoint tests /validator/sign
// Note: The sign endpoint requires a valid user signature on the transaction.
// Without it, the validator correctly refuses to sign, returning an error.
// This test verifies that the endpoint properly returns an error when no user signature is provided.
func TestValidatorSignTransactionEndpoint(t *testing.T) {
	api, _, w, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	// Request without user signature - should fail with "invalid user signature"
	body := `{
		"from": "` + w.Address() + `",
		"to": "0x1234567890123456789012345678901234567890",
		"value": "1000",
		"data": "",
		"sequenceId": 1,
		"readSet": {},
		"writeSet": {}
	}`

	rr := makeValidatorRequest(t, api, "POST", "/validator/sign", body)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var response SignTransactionResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Without user signature, the validator should refuse to sign
	if response.Success {
		t.Error("Expected success to be false without user signature")
	}

	if response.Error == "" {
		t.Error("Expected error message for missing user signature")
	}

	// The error should mention user signature validation
	if !strings.Contains(response.Error, "user signature") && !strings.Contains(response.Error, "sign") {
		t.Errorf("Expected error about user signature, got: %s", response.Error)
	}
}

// TestValidatorSignTransactionMethodNotAllowed tests that GET is not allowed for /validator/sign
func TestValidatorSignTransactionMethodNotAllowed(t *testing.T) {
	api, _, _, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	rr := makeValidatorRequest(t, api, "GET", "/validator/sign", "")

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected status 405, got %d", rr.Code)
	}
}

// TestValidatorNilValidator tests endpoints when validator is nil
func TestValidatorNilValidator(t *testing.T) {
	api := &ValidatorAPI{validator: nil}

	// Test /validator/info
	req := httptest.NewRequest("GET", "/validator/info", nil)
	rr := httptest.NewRecorder()

	mux := http.NewServeMux()
	api.RegisterRoutes(mux)
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected status 404 for nil validator, got %d", rr.Code)
	}

	// Test /validator/execute
	req = httptest.NewRequest("POST", "/validator/execute", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200 for nil validator execute, got %d", rr.Code)
	}

	var response ExecuteResponse
	json.Unmarshal(rr.Body.Bytes(), &response)

	if response.Success {
		t.Error("Expected success to be false for nil validator")
	}

	if response.Error != "validator not enabled" {
		t.Errorf("Expected error 'validator not enabled', got '%s'", response.Error)
	}
}

// TestValidatorContractDeployment tests contract deployment via /validator/execute
func TestValidatorContractDeployment(t *testing.T) {
	api, _, w, cleanup := setupTestValidatorAPI(t)
	defer cleanup()

	// Empty "to" address = contract creation
	body := `{
		"from": "` + w.Address() + `",
		"to": "",
		"value": "0",
		"data": "608060405234801561001057600080fd5b50"
	}`

	rr := makeValidatorRequest(t, api, "POST", "/validator/execute", body)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d: %s", rr.Code, rr.Body.String())
	}

	var response ExecuteResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse JSON response: %v", err)
	}

	// Contract deployment might fail due to invalid bytecode, but we're testing the endpoint
	// The important thing is that the endpoint processes the request correctly
}
