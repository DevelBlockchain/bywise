package core

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"time"

	"github.com/bywise/go-bywise/src/wallet"
)

var (
	// BlockTime is the target time between blocks (default 5 seconds)
	BlockTime = 5 * time.Second

	// CheckpointInterval is the number of blocks between checkpoints (default 50000)
	CheckpointInterval uint64 = 50000
)

// SetBlockTime sets the block time (used for testing)
func SetBlockTime(d time.Duration) {
	BlockTime = d
}

// SetCheckpointInterval sets the checkpoint interval (used for testing)
func SetCheckpointInterval(interval uint64) {
	CheckpointInterval = interval
}

// CheckpointDelay returns the checkpoint delay (same as interval)
func CheckpointDelay() uint64 {
	return CheckpointInterval
}

// BlockHeader contains the block metadata
type BlockHeader struct {
	Number       uint64  // Block number (height)
	PreviousHash Hash    // Hash of the previous block
	Timestamp    int64   // Unix timestamp
	MinerAddress Address // Address of the miner who created this block

	// Merkle root of transactions (for integrity verification)
	TxRoot Hash

	// State root after applying all transactions
	StateRoot Hash

	// Checkpoint Info (Present only if Number % CheckpointInterval == 0)
	CheckpointCID  string // IPFS Content ID
	CheckpointHash Hash   // Hash of the TSON file for integrity validation
}

// Block represents a complete block with header and transactions
type Block struct {
	Header       BlockHeader
	Transactions []*Transaction

	// Block hash (computed)
	hash Hash

	// Miner signature
	MinerSig []byte
}

// NewBlock creates a new block
func NewBlock(number uint64, previousHash Hash, miner Address) *Block {
	return &Block{
		Header: BlockHeader{
			Number:       number,
			PreviousHash: previousHash,
			Timestamp:    time.Now().Unix(),
			MinerAddress: miner,
		},
		Transactions: make([]*Transaction, 0),
	}
}

// NewGenesisBlock creates the genesis block (block 0)
func NewGenesisBlock(miner Address) *Block {
	block := &Block{
		Header: BlockHeader{
			Number:       0,
			PreviousHash: EmptyHash(),
			Timestamp:    time.Now().Unix(),
			MinerAddress: miner,
		},
		Transactions: make([]*Transaction, 0),
	}
	return block
}

// AddTransaction adds a transaction to the block
func (b *Block) AddTransaction(tx *Transaction) error {
	// Verify transaction
	if err := tx.Verify(); err != nil {
		return err
	}

	// Check for conflicts with existing transactions
	for _, existingTx := range b.Transactions {
		if tx.HasConflict(existingTx) {
			return errors.New("transaction conflicts with existing transaction in block")
		}
	}

	b.Transactions = append(b.Transactions, tx)
	return nil
}

// ComputeTxRoot computes the Merkle root of transactions
func (b *Block) ComputeTxRoot() Hash {
	if len(b.Transactions) == 0 {
		return EmptyHash()
	}

	// Simple implementation: hash of all transaction IDs concatenated
	var buf bytes.Buffer
	for _, tx := range b.Transactions {
		buf.Write(tx.ID[:])
	}

	return HashFromBytes(wallet.Keccak256(buf.Bytes()))
}

// HashForSigning returns the hash that the miner signs
func (b *Block) HashForSigning() []byte {
	var buf bytes.Buffer

	// Header fields
	numBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(numBytes, b.Header.Number)
	buf.Write(numBytes)

	buf.Write(b.Header.PreviousHash[:])

	tsBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(tsBytes, uint64(b.Header.Timestamp))
	buf.Write(tsBytes)

	buf.Write(b.Header.MinerAddress[:])
	buf.Write(b.Header.TxRoot[:])
	buf.Write(b.Header.StateRoot[:])

	// Checkpoint info if present
	if b.Header.CheckpointCID != "" {
		buf.WriteString(b.Header.CheckpointCID)
		buf.Write(b.Header.CheckpointHash[:])
	}

	return wallet.Keccak256(buf.Bytes())
}

// ComputeHash computes and returns the block hash
func (b *Block) ComputeHash() Hash {
	var buf bytes.Buffer

	buf.Write(b.HashForSigning())
	buf.Write(b.MinerSig)

	b.hash = HashFromBytes(wallet.Keccak256(buf.Bytes()))
	return b.hash
}

// Hash returns the block hash (computes if not already computed)
func (b *Block) Hash() Hash {
	if b.hash.IsEmpty() {
		return b.ComputeHash()
	}
	return b.hash
}

// Sign signs the block as the miner
func (b *Block) Sign(w *wallet.Wallet) error {
	// Verify miner address matches
	minerAddr, err := AddressFromHex(w.Address())
	if err != nil {
		return err
	}
	if minerAddr != b.Header.MinerAddress {
		return errors.New("wallet address does not match block miner address")
	}

	// Compute tx root
	b.Header.TxRoot = b.ComputeTxRoot()

	// Sign
	hash := b.HashForSigning()
	sig, err := w.Sign(hash)
	if err != nil {
		return err
	}

	b.MinerSig = sig
	b.ComputeHash()
	return nil
}

// VerifySignature verifies the miner's signature
func (b *Block) VerifySignature() bool {
	if len(b.MinerSig) == 0 {
		return false
	}
	hash := b.HashForSigning()
	return wallet.VerifySignature(b.Header.MinerAddress.Hex(), hash, b.MinerSig)
}

// Verify performs full block verification
func (b *Block) Verify(previousBlock *Block) error {
	// Verify block number
	if previousBlock != nil {
		if b.Header.Number != previousBlock.Header.Number+1 {
			return errors.New("invalid block number")
		}
		if b.Header.PreviousHash != previousBlock.Hash() {
			return errors.New("previous hash mismatch")
		}
	} else if b.Header.Number != 0 {
		return errors.New("non-genesis block requires previous block")
	}

	// Verify timestamp
	if b.Header.Timestamp <= 0 {
		return errors.New("invalid timestamp")
	}
	if previousBlock != nil && b.Header.Timestamp < previousBlock.Header.Timestamp {
		return errors.New("timestamp before previous block")
	}

	// Verify miner signature
	if !b.VerifySignature() {
		return errors.New("invalid miner signature")
	}

	// Verify transaction root
	expectedTxRoot := b.ComputeTxRoot()
	if b.Header.TxRoot != expectedTxRoot {
		return errors.New("transaction root mismatch")
	}

	// Verify all transactions
	for i, tx := range b.Transactions {
		if err := tx.Verify(); err != nil {
			return fmt.Errorf("invalid transaction at index %d: %w", i, err)
		}
	}

	// Check for transaction conflicts
	for i, tx1 := range b.Transactions {
		for j, tx2 := range b.Transactions {
			if i != j && tx1.HasConflict(tx2) {
				return errors.New("conflicting transactions in block")
			}
		}
	}

	return nil
}

// IsCheckpointBlock returns true if this block should contain a checkpoint
func (b *Block) IsCheckpointBlock() bool {
	return b.Header.Number > 0 && b.Header.Number%CheckpointInterval == 0
}

// CheckpointStateBlock returns the block number whose state this checkpoint represents
func (b *Block) CheckpointStateBlock() uint64 {
	if !b.IsCheckpointBlock() {
		return 0
	}
	return b.Header.Number - CheckpointDelay()
}

// SetCheckpoint sets the checkpoint information
func (b *Block) SetCheckpoint(cid string, hash Hash) {
	b.Header.CheckpointCID = cid
	b.Header.CheckpointHash = hash
}

// Size returns the approximate size of the block in bytes
func (b *Block) Size() int {
	size := 8 + 32 + 8 + 20 + 32 + 32 // Header fixed fields
	size += len(b.Header.CheckpointCID) + 32
	size += len(b.MinerSig)

	for _, tx := range b.Transactions {
		size += 32 + 20 + 20 + 32 // ID, From, To, Value estimate
		size += len(tx.Data)
		size += 8 // SequenceID
		for _, key := range tx.ReadSet {
			size += len(key)
		}
		for k, v := range tx.WriteSet {
			size += len(k) + len(v)
		}
		size += 20 + len(tx.ValidatorSig) + len(tx.UserSig)
	}

	return size
}
