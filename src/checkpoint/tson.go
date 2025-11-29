package checkpoint

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/wallet"
)

// TSON (Typed JSON) format for state snapshots
// Each entry includes type information for proper deserialization

// TSONEntry represents a single state entry in the snapshot
type TSONEntry struct {
	Type  string `json:"type"`  // account, storage, code, walletConfig
	Key   string `json:"key"`   // Hex-encoded key
	Value string `json:"value"` // Hex-encoded or JSON value depending on type
}

// TSONSnapshot represents a complete state snapshot
type TSONSnapshot struct {
	Version       int          `json:"version"`
	BlockNumber   uint64       `json:"blockNumber"`
	BlockHash     string       `json:"blockHash"`
	StateRoot     string       `json:"stateRoot"`
	Timestamp     int64        `json:"timestamp"`
	EntriesCount  int          `json:"entriesCount"`
	Entries       []TSONEntry  `json:"entries"`
}

// TSONEncoder encodes state to TSON format
type TSONEncoder struct{}

// NewTSONEncoder creates a new TSON encoder
func NewTSONEncoder() *TSONEncoder {
	return &TSONEncoder{}
}

// keyTypeToString converts key type byte to string
func keyTypeToString(keyType byte) string {
	switch keyType {
	case core.KeyTypeAccount:
		return "account"
	case core.KeyTypeStorage:
		return "storage"
	case core.KeyTypeCode:
		return "code"
	case core.KeyTypeWalletConfig:
		return "walletConfig"
	default:
		return "unknown"
	}
}

// stringToKeyType converts string to key type byte
func stringToKeyType(s string) byte {
	switch s {
	case "account":
		return core.KeyTypeAccount
	case "storage":
		return core.KeyTypeStorage
	case "code":
		return core.KeyTypeCode
	case "walletConfig":
		return core.KeyTypeWalletConfig
	default:
		return 0
	}
}

// Encode encodes state to TSON format
func (e *TSONEncoder) Encode(state map[string][]byte, blockNumber uint64, blockHash core.Hash, stateRoot core.Hash, timestamp int64) (*TSONSnapshot, error) {
	entries := make([]TSONEntry, 0, len(state))

	// Sort keys for deterministic output
	keys := make([]string, 0, len(state))
	for k := range state {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, keyStr := range keys {
		value := state[keyStr]

		// Remove state prefix if present
		key := []byte(keyStr)
		if len(key) > 2 && key[0] == 's' && key[1] == ':' {
			key = key[2:]
		}

		if len(key) == 0 {
			continue
		}

		keyType := key[0]
		entry := TSONEntry{
			Type:  keyTypeToString(keyType),
			Key:   hex.EncodeToString(key),
			Value: hex.EncodeToString(value),
		}

		entries = append(entries, entry)
	}

	return &TSONSnapshot{
		Version:      1,
		BlockNumber:  blockNumber,
		BlockHash:    blockHash.Hex(),
		StateRoot:    stateRoot.Hex(),
		Timestamp:    timestamp,
		EntriesCount: len(entries),
		Entries:      entries,
	}, nil
}

// Decode decodes TSON snapshot to state map
func (e *TSONEncoder) Decode(snapshot *TSONSnapshot) (map[string][]byte, error) {
	state := make(map[string][]byte)

	for _, entry := range snapshot.Entries {
		key, err := hex.DecodeString(entry.Key)
		if err != nil {
			return nil, fmt.Errorf("invalid key hex: %w", err)
		}

		value, err := hex.DecodeString(entry.Value)
		if err != nil {
			return nil, fmt.Errorf("invalid value hex: %w", err)
		}

		// Add state prefix back
		fullKey := "s:" + string(key)
		state[fullKey] = value
	}

	return state, nil
}

// SerializeSnapshot serializes a snapshot to JSON bytes
func SerializeSnapshot(snapshot *TSONSnapshot) ([]byte, error) {
	return json.MarshalIndent(snapshot, "", "  ")
}

// DeserializeSnapshot deserializes JSON bytes to a snapshot
func DeserializeSnapshot(data []byte) (*TSONSnapshot, error) {
	var snapshot TSONSnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return nil, err
	}
	return &snapshot, nil
}

// CalculateSnapshotHash calculates the hash of a snapshot
func CalculateSnapshotHash(snapshot *TSONSnapshot) (core.Hash, error) {
	// Serialize without the entries to create a deterministic hash
	// Then include entries in sorted order
	var buf bytes.Buffer

	// Version
	buf.WriteString(fmt.Sprintf("v%d", snapshot.Version))

	// Block info
	buf.WriteString(fmt.Sprintf("b%d", snapshot.BlockNumber))
	buf.WriteString(snapshot.BlockHash)
	buf.WriteString(snapshot.StateRoot)
	buf.WriteString(fmt.Sprintf("t%d", snapshot.Timestamp))
	buf.WriteString(fmt.Sprintf("c%d", snapshot.EntriesCount))

	// Entries (already sorted)
	for _, entry := range snapshot.Entries {
		buf.WriteString(entry.Type)
		buf.WriteString(entry.Key)
		buf.WriteString(entry.Value)
	}

	hash := wallet.Keccak256(buf.Bytes())
	return core.HashFromBytes(hash), nil
}

// ValidateSnapshot validates a snapshot's integrity
func ValidateSnapshot(snapshot *TSONSnapshot, expectedHash core.Hash) error {
	if snapshot.Version != 1 {
		return errors.New("unsupported snapshot version")
	}

	if snapshot.EntriesCount != len(snapshot.Entries) {
		return errors.New("entries count mismatch")
	}

	// Verify hash
	calculatedHash, err := CalculateSnapshotHash(snapshot)
	if err != nil {
		return fmt.Errorf("failed to calculate hash: %w", err)
	}

	if calculatedHash != expectedHash {
		return errors.New("snapshot hash mismatch")
	}

	return nil
}
