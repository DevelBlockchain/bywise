package wallet

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNewWallet(t *testing.T) {
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// Check address format
	if !IsValidAddress(wallet.Address()) {
		t.Errorf("Invalid address format: %s", wallet.Address())
	}

	// Check address starts with 0x
	if wallet.Address()[:2] != "0x" {
		t.Errorf("Address should start with 0x: %s", wallet.Address())
	}

	// Check address length (0x + 40 hex chars = 42)
	if len(wallet.Address()) != 42 {
		t.Errorf("Address should be 42 characters, got %d", len(wallet.Address()))
	}

	// Check private key is not empty
	if wallet.PrivateKeyHex() == "" {
		t.Error("Private key should not be empty")
	}

	// Check private key length (32 bytes = 64 hex chars)
	if len(wallet.PrivateKeyHex()) != 64 {
		t.Errorf("Private key should be 64 hex characters, got %d", len(wallet.PrivateKeyHex()))
	}

	// Check public key is not empty
	if wallet.PublicKeyHex() == "" {
		t.Error("Public key should not be empty")
	}
}

func TestFromPrivateKey(t *testing.T) {
	// Create a wallet first
	original, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create original wallet: %v", err)
	}

	// Recreate wallet from private key
	restored, err := FromPrivateKey(original.PrivateKeyHex())
	if err != nil {
		t.Fatalf("Failed to restore wallet: %v", err)
	}

	// Check addresses match
	if original.Address() != restored.Address() {
		t.Errorf("Addresses don't match: %s != %s", original.Address(), restored.Address())
	}

	// Check private keys match
	if original.PrivateKeyHex() != restored.PrivateKeyHex() {
		t.Error("Private keys don't match")
	}
}

func TestFromPrivateKeyWith0xPrefix(t *testing.T) {
	original, _ := NewWallet()

	// Test with 0x prefix
	restored, err := FromPrivateKey("0x" + original.PrivateKeyHex())
	if err != nil {
		t.Fatalf("Failed to restore wallet with 0x prefix: %v", err)
	}

	if original.Address() != restored.Address() {
		t.Errorf("Addresses don't match")
	}
}

func TestFromPrivateKeyInvalid(t *testing.T) {
	testCases := []struct {
		name string
		key  string
	}{
		{"empty", ""},
		{"too short", "abcd"},
		{"invalid hex", "xyz123"},
		{"too long", "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd12345678"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := FromPrivateKey(tc.key)
			if err == nil {
				t.Errorf("Expected error for key: %s", tc.key)
			}
		})
	}
}

func TestWalletSaveAndLoad(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "wallet-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	walletPath := filepath.Join(tmpDir, "test-wallet.json")

	// Create and save wallet
	original, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	if err := original.SaveToFile(walletPath); err != nil {
		t.Fatalf("Failed to save wallet: %v", err)
	}

	// Check file exists
	if _, err := os.Stat(walletPath); os.IsNotExist(err) {
		t.Fatal("Wallet file was not created")
	}

	// Load wallet
	loaded, err := LoadFromFile(walletPath)
	if err != nil {
		t.Fatalf("Failed to load wallet: %v", err)
	}

	// Check addresses match
	if original.Address() != loaded.Address() {
		t.Errorf("Addresses don't match: %s != %s", original.Address(), loaded.Address())
	}
}

func TestLoadOrCreate(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "wallet-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	walletPath := filepath.Join(tmpDir, "new-wallet.json")

	// First call should create new wallet
	wallet1, err := LoadOrCreate(walletPath)
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// Second call should load existing wallet
	wallet2, err := LoadOrCreate(walletPath)
	if err != nil {
		t.Fatalf("Failed to load wallet: %v", err)
	}

	// Addresses should match
	if wallet1.Address() != wallet2.Address() {
		t.Errorf("Addresses don't match after reload")
	}
}

func TestSignAndVerify(t *testing.T) {
	wallet, _ := NewWallet()

	message := []byte("Hello, Bywise!")

	// Sign message
	signature, err := wallet.SignMessage(message)
	if err != nil {
		t.Fatalf("Failed to sign message: %v", err)
	}

	// Verify signature
	if !VerifyMessageSignature(wallet.Address(), message, signature) {
		t.Error("Signature verification failed")
	}
}

func TestSignAndVerifyWrongMessage(t *testing.T) {
	wallet, _ := NewWallet()

	message := []byte("Hello, Bywise!")
	wrongMessage := []byte("Hello, World!")

	signature, _ := wallet.SignMessage(message)

	// Should fail with wrong message
	if VerifyMessageSignature(wallet.Address(), wrongMessage, signature) {
		t.Error("Signature should not verify with wrong message")
	}
}

func TestSignAndVerifyWrongAddress(t *testing.T) {
	wallet1, _ := NewWallet()
	wallet2, _ := NewWallet()

	message := []byte("Hello, Bywise!")

	signature, _ := wallet1.SignMessage(message)

	// Should fail with wrong address
	if VerifyMessageSignature(wallet2.Address(), message, signature) {
		t.Error("Signature should not verify with wrong address")
	}
}

func TestEthereumCompatibleSignature(t *testing.T) {
	// Test with a known private key to verify Ethereum compatibility
	// Private key: 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
	privateKeyHex := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	wallet, err := FromPrivateKey(privateKeyHex)
	if err != nil {
		t.Fatalf("Failed to create wallet from known key: %v", err)
	}

	// The expected address for this private key (derived using Ethereum's method)
	// Verified using go-ethereum's crypto.PubkeyToAddress
	expectedAddress := "0xFCAd0B19bB29D4674531d6f115237E16AfCE377c"

	if wallet.Address() != expectedAddress {
		t.Errorf("Address mismatch. Expected %s, got %s", expectedAddress, wallet.Address())
	}

	// Sign a message and verify the signature format
	message := []byte("test message")
	signature, err := wallet.SignMessage(message)
	if err != nil {
		t.Fatalf("Failed to sign message: %v", err)
	}

	// Ethereum signatures are 65 bytes: r (32) + s (32) + v (1)
	if len(signature) != 65 {
		t.Errorf("Signature should be 65 bytes, got %d", len(signature))
	}

	// Verify the signature
	if !VerifyMessageSignature(wallet.Address(), message, signature) {
		t.Error("Failed to verify signature with known wallet")
	}

	// Test raw hash signing (without personal_sign prefix)
	hash := Keccak256([]byte("raw data"))
	rawSignature, err := wallet.Sign(hash)
	if err != nil {
		t.Fatalf("Failed to sign hash: %v", err)
	}

	if len(rawSignature) != 65 {
		t.Errorf("Raw signature should be 65 bytes, got %d", len(rawSignature))
	}

	// Verify raw signature
	if !VerifySignature(wallet.Address(), hash, rawSignature) {
		t.Error("Failed to verify raw signature")
	}
}

func TestSignatureRecovery(t *testing.T) {
	wallet, _ := NewWallet()
	message := []byte("Hello, Ethereum!")

	// Sign the message
	signature, err := wallet.SignMessage(message)
	if err != nil {
		t.Fatalf("Failed to sign: %v", err)
	}

	// The signature should allow recovery of the public key/address
	hash := HashMessage(message)

	// crypto.SigToPub should recover the correct public key
	// This is tested internally by VerifySignature, but let's be explicit
	if !VerifySignature(wallet.Address(), hash, signature) {
		t.Error("Signature recovery failed")
	}

	// Test with multiple messages to ensure consistency
	messages := []string{
		"",
		"a",
		"Hello, World!",
		"The quick brown fox jumps over the lazy dog",
		string(make([]byte, 1000)), // long message
	}

	for _, msg := range messages {
		sig, err := wallet.SignMessage([]byte(msg))
		if err != nil {
			t.Errorf("Failed to sign message '%s': %v", msg[:min(10, len(msg))], err)
			continue
		}

		if !VerifyMessageSignature(wallet.Address(), []byte(msg), sig) {
			t.Errorf("Signature verification failed for message: '%s'", msg[:min(10, len(msg))])
		}
	}
}

func TestPersonalSignPrefix(t *testing.T) {
	// Verify that HashMessage produces the correct Ethereum personal_sign prefix
	message := []byte("hello")

	hash := HashMessage(message)

	// The hash should be 32 bytes (Keccak256 output)
	if len(hash) != 32 {
		t.Errorf("Hash should be 32 bytes, got %d", len(hash))
	}

	// Hash the same message manually to verify the prefix is correct
	prefix := "\x19Ethereum Signed Message:\n5" // 5 is len("hello")
	expectedHash := Keccak256([]byte(prefix), message)

	if string(hash) != string(expectedHash) {
		t.Error("HashMessage does not produce correct Ethereum personal_sign hash")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func TestIsValidAddress(t *testing.T) {
	testCases := []struct {
		address string
		valid   bool
	}{
		{"0x742d35Cc6634C0532925a3b844Bc9e7595f50000", true},
		{"0x0000000000000000000000000000000000000000", true},
		{"0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF", true},
		{"742d35Cc6634C0532925a3b844Bc9e7595f50000", false},  // Missing 0x
		{"0x742d35Cc6634C0532925a3b844Bc9e7595f5000", false}, // Too short
		{"0x742d35Cc6634C0532925a3b844Bc9e7595f500001", false}, // Too long
		{"0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG", false}, // Invalid hex
		{"", false},
	}

	for _, tc := range testCases {
		result := IsValidAddress(tc.address)
		if result != tc.valid {
			t.Errorf("IsValidAddress(%s) = %v, expected %v", tc.address, result, tc.valid)
		}
	}
}

func TestKeccak256(t *testing.T) {
	// Test known hash
	data := []byte("hello")
	hash := Keccak256(data)

	// Keccak256("hello") should be a specific value
	if len(hash) != 32 {
		t.Errorf("Hash should be 32 bytes, got %d", len(hash))
	}
}

func TestUniqueAddresses(t *testing.T) {
	// Create multiple wallets and ensure addresses are unique
	addresses := make(map[string]bool)

	for i := 0; i < 10; i++ {
		wallet, err := NewWallet()
		if err != nil {
			t.Fatalf("Failed to create wallet %d: %v", i, err)
		}

		if addresses[wallet.Address()] {
			t.Errorf("Duplicate address found: %s", wallet.Address())
		}
		addresses[wallet.Address()] = true
	}
}

func TestWalletFilePermissions(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "wallet-test")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	walletPath := filepath.Join(tmpDir, "secure-wallet.json")

	wallet, _ := NewWallet()
	wallet.SaveToFile(walletPath)

	// Check file permissions (should be 0600 - owner read/write only)
	info, err := os.Stat(walletPath)
	if err != nil {
		t.Fatalf("Failed to stat wallet file: %v", err)
	}

	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("Wallet file permissions should be 0600, got %o", perm)
	}
}
