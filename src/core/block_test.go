package core

import (
	"testing"

	"github.com/bywise/go-bywise/src/wallet"
)

func createSignedTransaction(t *testing.T, from, to Address, value int64) *Transaction {
	userWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create user wallet: %v", err)
	}

	validatorWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create validator wallet: %v", err)
	}

	// Get addresses from wallets
	fromAddr, _ := AddressFromHex(userWallet.Address())
	validatorAddr, _ := AddressFromHex(validatorWallet.Address())

	// Create transaction proposal with new flow (blockLimit=0 means no expiration)
	tx := NewTransactionProposal(0, validatorAddr, fromAddr, to, NewBigInt(value), NewBigInt(1), 0, nil)

	// User signs first (new 2-step flow)
	if err := tx.SignAsUser(userWallet); err != nil {
		t.Fatalf("Failed to sign as user: %v", err)
	}

	// Set execution evidence (ReadSet now includes values)
	tx.SetExecutionEvidence(1, map[string][]byte{
		string(MakeAccountKey(fromAddr)): []byte("balance_value"),
	}, map[string][]byte{
		string(MakeAccountKey(fromAddr)): []byte("new_value"),
	})

	// Validator signs after execution
	if err := tx.SignAsValidator(validatorWallet); err != nil {
		t.Fatalf("Failed to sign as validator: %v", err)
	}

	return tx
}

func TestNewBlock(t *testing.T) {
	miner := Address{0x01}
	prevHash := Hash{0x02}

	block := NewBlock(1, prevHash, miner)

	if block.Header.Number != 1 {
		t.Errorf("Block number should be 1, got %d", block.Header.Number)
	}

	if block.Header.PreviousHash != prevHash {
		t.Error("Previous hash mismatch")
	}

	if block.Header.MinerAddress != miner {
		t.Error("Miner address mismatch")
	}

	if block.Header.Timestamp <= 0 {
		t.Error("Timestamp should be set")
	}
}

func TestNewGenesisBlock(t *testing.T) {
	miner := Address{0x01}
	genesis := NewGenesisBlock(miner)

	if genesis.Header.Number != 0 {
		t.Errorf("Genesis block number should be 0, got %d", genesis.Header.Number)
	}

	if !genesis.Header.PreviousHash.IsEmpty() {
		t.Error("Genesis block should have empty previous hash")
	}
}

func TestBlockSigning(t *testing.T) {
	minerWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create miner wallet: %v", err)
	}

	minerAddr, _ := AddressFromHex(minerWallet.Address())

	block := NewBlock(1, Hash{0x01}, minerAddr)

	// Add a transaction
	to := Address{0x02}
	tx := createSignedTransaction(t, Address{}, to, 100)
	block.Transactions = append(block.Transactions, tx)

	// Sign block
	err = block.Sign(minerWallet)
	if err != nil {
		t.Fatalf("Failed to sign block: %v", err)
	}

	// Verify signature
	if !block.VerifySignature() {
		t.Error("Block signature verification failed")
	}

	// Check hash is computed
	if block.Hash().IsEmpty() {
		t.Error("Block hash should be computed after signing")
	}
}

func TestBlockSigningWrongMiner(t *testing.T) {
	minerWallet, _ := wallet.NewWallet()
	otherWallet, _ := wallet.NewWallet()

	minerAddr, _ := AddressFromHex(minerWallet.Address())

	block := NewBlock(1, Hash{0x01}, minerAddr)

	// Try to sign with wrong wallet
	err := block.Sign(otherWallet)
	if err == nil {
		t.Error("Should fail when signing with wrong wallet")
	}
}

func TestBlockVerification(t *testing.T) {
	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := AddressFromHex(minerWallet.Address())

	// Create genesis block
	genesis := NewGenesisBlock(minerAddr)
	genesis.Header.StateRoot = Hash{0x01}
	genesis.Sign(minerWallet)

	// Create second block
	block1 := NewBlock(1, genesis.Hash(), minerAddr)
	block1.Header.StateRoot = Hash{0x02}

	// Add transaction
	to := Address{0x02}
	tx := createSignedTransaction(t, Address{}, to, 100)
	block1.Transactions = append(block1.Transactions, tx)

	block1.Sign(minerWallet)

	// Verify against genesis
	err := block1.Verify(genesis)
	if err != nil {
		t.Errorf("Block verification failed: %v", err)
	}
}

func TestBlockVerificationWrongNumber(t *testing.T) {
	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := AddressFromHex(minerWallet.Address())

	genesis := NewGenesisBlock(minerAddr)
	genesis.Sign(minerWallet)

	// Create block with wrong number
	block := NewBlock(5, genesis.Hash(), minerAddr) // Should be 1
	block.Sign(minerWallet)

	err := block.Verify(genesis)
	if err == nil {
		t.Error("Should fail with wrong block number")
	}
}

func TestBlockVerificationWrongPreviousHash(t *testing.T) {
	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := AddressFromHex(minerWallet.Address())

	genesis := NewGenesisBlock(minerAddr)
	genesis.Sign(minerWallet)

	// Create block with wrong previous hash
	block := NewBlock(1, Hash{0xFF}, minerAddr) // Wrong hash
	block.Sign(minerWallet)

	err := block.Verify(genesis)
	if err == nil {
		t.Error("Should fail with wrong previous hash")
	}
}

func TestBlockTxRoot(t *testing.T) {
	miner := Address{0x01}
	block := NewBlock(1, Hash{}, miner)

	// Empty block should have empty tx root
	emptyRoot := block.ComputeTxRoot()
	if !emptyRoot.IsEmpty() {
		t.Error("Empty block should have empty tx root")
	}

	// Add transaction
	to := Address{0x02}
	tx := createSignedTransaction(t, Address{}, to, 100)
	block.Transactions = append(block.Transactions, tx)

	// Now tx root should not be empty
	root := block.ComputeTxRoot()
	if root.IsEmpty() {
		t.Error("Block with transactions should have non-empty tx root")
	}
}

func TestBlockHashDeterminism(t *testing.T) {
	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := AddressFromHex(minerWallet.Address())

	block1 := NewBlock(1, Hash{0x01}, minerAddr)
	block1.Header.Timestamp = 1000
	block1.Sign(minerWallet)

	// Compute hash twice
	hash1 := block1.ComputeHash()
	hash2 := block1.Hash()

	if hash1 != hash2 {
		t.Error("Block hash should be deterministic")
	}
}

func TestIsCheckpointBlock(t *testing.T) {
	miner := Address{0x01}

	// Block 0 is not a checkpoint
	genesis := NewGenesisBlock(miner)
	if genesis.IsCheckpointBlock() {
		t.Error("Genesis block should not be a checkpoint block")
	}

	// Block 50000 is a checkpoint
	checkpoint := NewBlock(CheckpointInterval, Hash{}, miner)
	if !checkpoint.IsCheckpointBlock() {
		t.Errorf("Block %d should be a checkpoint block", CheckpointInterval)
	}

	// Block 100000 is a checkpoint
	checkpoint2 := NewBlock(CheckpointInterval*2, Hash{}, miner)
	if !checkpoint2.IsCheckpointBlock() {
		t.Errorf("Block %d should be a checkpoint block", CheckpointInterval*2)
	}

	// Block 50001 is not a checkpoint
	notCheckpoint := NewBlock(CheckpointInterval+1, Hash{}, miner)
	if notCheckpoint.IsCheckpointBlock() {
		t.Error("Block 50001 should not be a checkpoint block")
	}
}

func TestCheckpointStateBlock(t *testing.T) {
	miner := Address{0x01}

	// Checkpoint at block 100000 refers to state at block 50000
	checkpoint := NewBlock(CheckpointInterval*2, Hash{}, miner)
	stateBlock := checkpoint.CheckpointStateBlock()

	expected := uint64(CheckpointInterval)
	if stateBlock != expected {
		t.Errorf("Checkpoint state block should be %d, got %d", expected, stateBlock)
	}

	// Non-checkpoint block returns 0
	notCheckpoint := NewBlock(1, Hash{}, miner)
	if notCheckpoint.CheckpointStateBlock() != 0 {
		t.Error("Non-checkpoint block should return 0 for state block")
	}
}

func TestSetCheckpoint(t *testing.T) {
	miner := Address{0x01}
	block := NewBlock(CheckpointInterval, Hash{}, miner)

	cid := "QmTest123"
	hash := Hash{0x01, 0x02, 0x03}

	block.SetCheckpoint(cid, hash)

	if block.Header.CheckpointCID != cid {
		t.Error("Checkpoint CID not set correctly")
	}

	if block.Header.CheckpointHash != hash {
		t.Error("Checkpoint hash not set correctly")
	}
}

func TestBlockSize(t *testing.T) {
	minerWallet, _ := wallet.NewWallet()
	minerAddr, _ := AddressFromHex(minerWallet.Address())

	block := NewBlock(1, Hash{}, minerAddr)

	// Empty block size
	emptySize := block.Size()
	if emptySize <= 0 {
		t.Error("Block size should be positive")
	}

	// Add transaction and check size increases
	to := Address{0x02}
	tx := createSignedTransaction(t, Address{}, to, 100)
	block.Transactions = append(block.Transactions, tx)

	sizeWithTx := block.Size()
	if sizeWithTx <= emptySize {
		t.Error("Block size should increase with transaction")
	}
}
