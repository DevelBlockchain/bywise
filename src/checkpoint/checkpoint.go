package checkpoint

import (
	"errors"
	"fmt"
	"sync"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
)

var (
	ErrNotCheckpointBlock   = errors.New("not a checkpoint block")
	ErrCheckpointNotFound   = errors.New("checkpoint not found")
	ErrInvalidCheckpoint    = errors.New("invalid checkpoint")
	ErrIPFSNotConfigured    = errors.New("IPFS not configured")
)

// IPFSClient interface for IPFS operations
// Implement this interface with actual IPFS client
type IPFSClient interface {
	// Add adds content to IPFS and returns the CID
	Add(data []byte) (string, error)
	// Get retrieves content from IPFS by CID
	Get(cid string) ([]byte, error)
	// Pin pins content to ensure it's not garbage collected
	Pin(cid string) error
}

// MockIPFSClient is a mock IPFS client for testing
type MockIPFSClient struct {
	storage map[string][]byte
	mu      sync.RWMutex
}

// NewMockIPFSClient creates a new mock IPFS client
func NewMockIPFSClient() *MockIPFSClient {
	return &MockIPFSClient{
		storage: make(map[string][]byte),
	}
}

func (m *MockIPFSClient) Add(data []byte) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Use hash of data as CID
	hash := core.HashFromBytes(data)
	cid := "Qm" + hash.Hex()[2:34] // Simplified mock CID

	m.storage[cid] = make([]byte, len(data))
	copy(m.storage[cid], data)

	return cid, nil
}

func (m *MockIPFSClient) Get(cid string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	data, exists := m.storage[cid]
	if !exists {
		return nil, ErrCheckpointNotFound
	}

	result := make([]byte, len(data))
	copy(result, data)
	return result, nil
}

func (m *MockIPFSClient) Pin(cid string) error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if _, exists := m.storage[cid]; !exists {
		return ErrCheckpointNotFound
	}
	return nil
}

// CheckpointManager manages checkpoint creation and validation
type CheckpointManager struct {
	storage *storage.Storage
	ipfs    IPFSClient
	encoder *TSONEncoder
	mu      sync.Mutex
}

// NewCheckpointManager creates a new checkpoint manager
func NewCheckpointManager(store *storage.Storage, ipfs IPFSClient) *CheckpointManager {
	return &CheckpointManager{
		storage: store,
		ipfs:    ipfs,
		encoder: NewTSONEncoder(),
	}
}

// ShouldCreateCheckpoint checks if a checkpoint should be created at the given block
func ShouldCreateCheckpoint(blockNumber uint64) bool {
	return blockNumber > 0 && blockNumber%core.CheckpointInterval == 0
}

// GetCheckpointStateBlockNumber returns the block number whose state the checkpoint represents
func GetCheckpointStateBlockNumber(checkpointBlockNumber uint64) uint64 {
	if checkpointBlockNumber < core.CheckpointInterval {
		return 0
	}
	return checkpointBlockNumber - core.CheckpointInterval
}

// CreateCheckpoint creates a checkpoint for the given block
func (cm *CheckpointManager) CreateCheckpoint(block *core.Block) (string, core.Hash, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if !ShouldCreateCheckpoint(block.Header.Number) {
		return "", core.Hash{}, ErrNotCheckpointBlock
	}

	if cm.ipfs == nil {
		return "", core.Hash{}, ErrIPFSNotConfigured
	}

	// Get the state at the checkpoint reference block
	stateBlockNumber := GetCheckpointStateBlockNumber(block.Header.Number)
	stateBlock, err := cm.storage.GetBlockByNumber(stateBlockNumber)
	if err != nil {
		return "", core.Hash{}, fmt.Errorf("failed to get state block: %w", err)
	}

	// Export current state
	state, err := cm.storage.ExportState()
	if err != nil {
		return "", core.Hash{}, fmt.Errorf("failed to export state: %w", err)
	}

	// Create TSON snapshot
	snapshot, err := cm.encoder.Encode(
		state,
		stateBlockNumber,
		stateBlock.Hash(),
		stateBlock.Header.StateRoot,
		stateBlock.Header.Timestamp,
	)
	if err != nil {
		return "", core.Hash{}, fmt.Errorf("failed to encode snapshot: %w", err)
	}

	// Calculate hash
	hash, err := CalculateSnapshotHash(snapshot)
	if err != nil {
		return "", core.Hash{}, fmt.Errorf("failed to calculate hash: %w", err)
	}

	// Serialize snapshot
	data, err := SerializeSnapshot(snapshot)
	if err != nil {
		return "", core.Hash{}, fmt.Errorf("failed to serialize snapshot: %w", err)
	}

	// Upload to IPFS
	cid, err := cm.ipfs.Add(data)
	if err != nil {
		return "", core.Hash{}, fmt.Errorf("failed to upload to IPFS: %w", err)
	}

	// Pin the content
	if err := cm.ipfs.Pin(cid); err != nil {
		return "", core.Hash{}, fmt.Errorf("failed to pin content: %w", err)
	}

	return cid, hash, nil
}

// ValidateCheckpoint validates a checkpoint from a block
func (cm *CheckpointManager) ValidateCheckpoint(block *core.Block) error {
	if !ShouldCreateCheckpoint(block.Header.Number) {
		return ErrNotCheckpointBlock
	}

	if block.Header.CheckpointCID == "" {
		return errors.New("checkpoint CID missing")
	}

	if block.Header.CheckpointHash.IsEmpty() {
		return errors.New("checkpoint hash missing")
	}

	if cm.ipfs == nil {
		return ErrIPFSNotConfigured
	}

	// Fetch checkpoint from IPFS
	data, err := cm.ipfs.Get(block.Header.CheckpointCID)
	if err != nil {
		return fmt.Errorf("failed to fetch checkpoint: %w", err)
	}

	// Deserialize
	snapshot, err := DeserializeSnapshot(data)
	if err != nil {
		return fmt.Errorf("failed to deserialize checkpoint: %w", err)
	}

	// Validate integrity
	if err := ValidateSnapshot(snapshot, block.Header.CheckpointHash); err != nil {
		return fmt.Errorf("checkpoint validation failed: %w", err)
	}

	// Verify the checkpoint refers to the correct block
	expectedStateBlock := GetCheckpointStateBlockNumber(block.Header.Number)
	if snapshot.BlockNumber != expectedStateBlock {
		return fmt.Errorf("checkpoint block number mismatch: expected %d, got %d",
			expectedStateBlock, snapshot.BlockNumber)
	}

	// Verify against local state (if we have it)
	localState, err := cm.storage.ExportState()
	if err == nil {
		// Create local snapshot and compare hash
		localSnapshot, err := cm.encoder.Encode(
			localState,
			snapshot.BlockNumber,
			core.Hash{}, // We'll compare entry by entry
			core.Hash{},
			snapshot.Timestamp,
		)
		if err == nil && localSnapshot.EntriesCount != snapshot.EntriesCount {
			return errors.New("local state entries count differs from checkpoint")
		}
	}

	return nil
}

// LoadCheckpoint loads state from a checkpoint
func (cm *CheckpointManager) LoadCheckpoint(cid string, expectedHash core.Hash) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if cm.ipfs == nil {
		return ErrIPFSNotConfigured
	}

	// Fetch from IPFS
	data, err := cm.ipfs.Get(cid)
	if err != nil {
		return fmt.Errorf("failed to fetch checkpoint: %w", err)
	}

	// Deserialize
	snapshot, err := DeserializeSnapshot(data)
	if err != nil {
		return fmt.Errorf("failed to deserialize: %w", err)
	}

	// Validate
	if err := ValidateSnapshot(snapshot, expectedHash); err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	// Decode state
	state, err := cm.encoder.Decode(snapshot)
	if err != nil {
		return fmt.Errorf("failed to decode state: %w", err)
	}

	// Import state
	if err := cm.storage.ImportState(state); err != nil {
		return fmt.Errorf("failed to import state: %w", err)
	}

	return nil
}

// GetCheckpointInfo returns information about a checkpoint
type CheckpointInfo struct {
	CID          string `json:"cid"`
	Hash         string `json:"hash"`
	BlockNumber  uint64 `json:"blockNumber"`
	StateBlock   uint64 `json:"stateBlock"`
	EntriesCount int    `json:"entriesCount"`
	Timestamp    int64  `json:"timestamp"`
}

// GetCheckpointInfo retrieves information about a checkpoint
func (cm *CheckpointManager) GetCheckpointInfo(cid string) (*CheckpointInfo, error) {
	if cm.ipfs == nil {
		return nil, ErrIPFSNotConfigured
	}

	data, err := cm.ipfs.Get(cid)
	if err != nil {
		return nil, err
	}

	snapshot, err := DeserializeSnapshot(data)
	if err != nil {
		return nil, err
	}

	hash, _ := CalculateSnapshotHash(snapshot)

	return &CheckpointInfo{
		CID:          cid,
		Hash:         hash.Hex(),
		BlockNumber:  snapshot.BlockNumber,
		StateBlock:   snapshot.BlockNumber,
		EntriesCount: snapshot.EntriesCount,
		Timestamp:    snapshot.Timestamp,
	}, nil
}
