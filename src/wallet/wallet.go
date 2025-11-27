package wallet

import (
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/tyler-smith/go-bip39"
)

// Wallet represents an Ethereum-compatible wallet
type Wallet struct {
	privateKey *ecdsa.PrivateKey
	publicKey  *ecdsa.PublicKey
	address    string
	mnemonic   string // BIP39 mnemonic seed phrase (if generated from seed)
}

// WalletFile represents the JSON structure for storing wallet data
type WalletFile struct {
	Address    string `json:"address"`
	PrivateKey string `json:"privateKey"`
	Seed       string `json:"seed,omitempty"` // BIP39 mnemonic seed phrase
}

// NewWallet creates a new wallet with a BIP39 mnemonic seed phrase
func NewWallet() (*Wallet, error) {
	// Generate 128-bit entropy for 12-word mnemonic
	entropy, err := bip39.NewEntropy(128)
	if err != nil {
		return nil, fmt.Errorf("failed to generate entropy: %w", err)
	}

	// Generate mnemonic from entropy
	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		return nil, fmt.Errorf("failed to generate mnemonic: %w", err)
	}

	return NewWalletFromMnemonic(mnemonic)
}

// NewWalletFromMnemonic creates a wallet from an existing BIP39 mnemonic seed phrase
func NewWalletFromMnemonic(mnemonic string) (*Wallet, error) {
	// Validate mnemonic
	if !bip39.IsMnemonicValid(mnemonic) {
		return nil, fmt.Errorf("invalid mnemonic seed phrase")
	}

	// Generate seed from mnemonic (no passphrase)
	seed := bip39.NewSeed(mnemonic, "")

	// Use first 32 bytes of seed as private key (simplified derivation)
	// Note: For full BIP44 compliance, use proper HD wallet derivation
	privateKey, err := crypto.ToECDSA(seed[:32])
	if err != nil {
		return nil, fmt.Errorf("failed to create private key from seed: %w", err)
	}

	return &Wallet{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
		address:    crypto.PubkeyToAddress(privateKey.PublicKey).Hex(),
		mnemonic:   mnemonic,
	}, nil
}

// NewWalletRandom creates a new wallet with a randomly generated key pair (no mnemonic)
func NewWalletRandom() (*Wallet, error) {
	privateKey, err := crypto.GenerateKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	return &Wallet{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
		address:    crypto.PubkeyToAddress(privateKey.PublicKey).Hex(),
	}, nil
}

// FromPrivateKey creates a wallet from an existing private key hex string
func FromPrivateKey(privateKeyHex string) (*Wallet, error) {
	// Remove 0x prefix if present
	privateKeyHex = strings.TrimPrefix(privateKeyHex, "0x")

	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}

	return &Wallet{
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
		address:    crypto.PubkeyToAddress(privateKey.PublicKey).Hex(),
	}, nil
}

// LoadOrCreate loads a wallet from file or creates a new one if it doesn't exist
func LoadOrCreate(walletPath string) (*Wallet, error) {
	// Check if wallet file exists
	if _, err := os.Stat(walletPath); os.IsNotExist(err) {
		// Create new wallet
		wallet, err := NewWallet()
		if err != nil {
			return nil, err
		}

		// Save to file
		if err := wallet.SaveToFile(walletPath); err != nil {
			return nil, fmt.Errorf("failed to save wallet: %w", err)
		}

		return wallet, nil
	}

	// Load existing wallet
	return LoadFromFile(walletPath)
}

// LoadFromFile loads a wallet from a JSON file
func LoadFromFile(path string) (*Wallet, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read wallet file: %w", err)
	}

	var walletFile WalletFile
	if err := json.Unmarshal(data, &walletFile); err != nil {
		return nil, fmt.Errorf("failed to parse wallet file: %w", err)
	}

	w, err := FromPrivateKey(walletFile.PrivateKey)
	if err != nil {
		return nil, err
	}

	// Restore mnemonic if present in file
	if walletFile.Seed != "" {
		w.mnemonic = walletFile.Seed
	}

	return w, nil
}

// SaveToFile saves the wallet to a JSON file
func (w *Wallet) SaveToFile(path string) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("failed to create wallet directory: %w", err)
	}

	walletFile := WalletFile{
		Address:    w.address,
		PrivateKey: w.PrivateKeyHex(),
		Seed:       w.mnemonic,
	}

	data, err := json.MarshalIndent(walletFile, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal wallet: %w", err)
	}

	// Write with restricted permissions (owner read/write only)
	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("failed to write wallet file: %w", err)
	}

	return nil
}

// Address returns the wallet's Ethereum address (checksummed)
func (w *Wallet) Address() string {
	return w.address
}

// PrivateKey returns the ECDSA private key
func (w *Wallet) PrivateKey() *ecdsa.PrivateKey {
	return w.privateKey
}

// PublicKey returns the ECDSA public key
func (w *Wallet) PublicKey() *ecdsa.PublicKey {
	return w.publicKey
}

// PrivateKeyHex returns the private key as a hex string (without 0x prefix)
func (w *Wallet) PrivateKeyHex() string {
	return hex.EncodeToString(crypto.FromECDSA(w.privateKey))
}

// PublicKeyHex returns the public key as a hex string (without 0x prefix)
func (w *Wallet) PublicKeyHex() string {
	return hex.EncodeToString(crypto.FromECDSAPub(w.publicKey))
}

// Mnemonic returns the BIP39 mnemonic seed phrase (if available)
func (w *Wallet) Mnemonic() string {
	return w.mnemonic
}

// HasMnemonic returns true if the wallet has a mnemonic seed phrase
func (w *Wallet) HasMnemonic() bool {
	return w.mnemonic != ""
}

// Sign signs a message hash with the wallet's private key
// The hash should be 32 bytes (e.g., Keccak256 hash)
func (w *Wallet) Sign(hash []byte) ([]byte, error) {
	signature, err := crypto.Sign(hash, w.privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign: %w", err)
	}
	return signature, nil
}

// SignMessage signs a message using Ethereum's personal_sign format
// It prepends "\x19Ethereum Signed Message:\n" + len(message) before hashing
func (w *Wallet) SignMessage(message []byte) ([]byte, error) {
	hash := HashMessage(message)
	return w.Sign(hash)
}

// HashMessage creates the Ethereum signed message hash
func HashMessage(message []byte) []byte {
	prefix := fmt.Sprintf("\x19Ethereum Signed Message:\n%d", len(message))
	return crypto.Keccak256([]byte(prefix), message)
}

// Keccak256 computes the Keccak-256 hash of the input data
func Keccak256(data ...[]byte) []byte {
	return crypto.Keccak256(data...)
}

// VerifySignature verifies that a signature was created by the given address
func VerifySignature(address string, hash []byte, signature []byte) bool {
	// Recover the public key from the signature
	pubKey, err := crypto.SigToPub(hash, signature)
	if err != nil {
		return false
	}

	// Get the address from the recovered public key
	recoveredAddr := crypto.PubkeyToAddress(*pubKey).Hex()

	// Compare addresses (case-insensitive)
	return strings.EqualFold(address, recoveredAddr)
}

// VerifyMessageSignature verifies a signature against a message and address
func VerifyMessageSignature(address string, message []byte, signature []byte) bool {
	hash := HashMessage(message)
	return VerifySignature(address, hash, signature)
}

// IsValidAddress checks if a string is a valid Ethereum address
func IsValidAddress(address string) bool {
	if !strings.HasPrefix(address, "0x") {
		return false
	}
	if len(address) != 42 {
		return false
	}
	_, err := hex.DecodeString(address[2:])
	return err == nil
}
