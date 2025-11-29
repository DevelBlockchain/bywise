package network

import (
	"testing"

	"github.com/bywise/go-bywise/src/core"
	pb "github.com/bywise/go-bywise/src/proto/pb"
	"github.com/bywise/go-bywise/src/wallet"
	"google.golang.org/protobuf/proto"
)

func TestTransactionConversion(t *testing.T) {
	// Create wallets
	validatorWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatal(err)
	}

	userWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatal(err)
	}

	validatorAddr, _ := core.AddressFromHex(validatorWallet.Address())
	userAddr, _ := core.AddressFromHex(userWallet.Address())
	recipientAddr := core.Address{0x02}

	// Create transaction
	tx := core.NewTransactionProposal(
		0,
		validatorAddr,
		userAddr,
		recipientAddr,
		core.NewBigInt(100),
		core.NewBigInt(1),
		0,
		[]byte("test data"),
	)

	// Add ReadSet/WriteSet with binary keys
	accountKey1 := string(core.MakeAccountKey(userAddr))
	accountKey2 := string(core.MakeAccountKey(recipientAddr))
	codeKey := string(core.MakeCodeKey(recipientAddr))

	tx.SetExecutionEvidence(1, map[string][]byte{
		accountKey1: []byte("balance1"),
		accountKey2: nil,
		codeKey:     []byte("code"),
	}, map[string][]byte{
		accountKey1: []byte("new_balance1"),
		accountKey2: []byte("new_balance2"),
	})

	// Sign
	if err := tx.SignAsUser(userWallet); err != nil {
		t.Fatal(err)
	}

	if err := tx.SignAsValidator(validatorWallet); err != nil {
		t.Fatal(err)
	}

	// Verify original
	if err := tx.Verify(); err != nil {
		t.Fatalf("Original transaction failed to verify: %v", err)
	}

	t.Logf("Original transaction ID: %s", tx.ID.Hex())
	t.Logf("Original ReadSet keys: %d", len(tx.ReadSet))
	t.Logf("Original WriteSet keys: %d", len(tx.WriteSet))

	// Convert to protobuf
	pbTx := coreTxToPb(tx)

	t.Logf("Protobuf ReadSet keys: %d", len(pbTx.ReadSet))
	t.Logf("Protobuf WriteSet keys: %d", len(pbTx.WriteSet))

	// Check that keys are hex encoded
	for k := range pbTx.ReadSet {
		t.Logf("Protobuf ReadSet key: %s (len=%d)", k, len(k))
		// Should be hex string (even length, only hex chars)
		if len(k)%2 != 0 {
			t.Errorf("ReadSet key is not even length hex: %s", k)
		}
	}

	// Serialize
	data, err := proto.Marshal(pbTx)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}

	t.Logf("Serialized size: %d bytes", len(data))

	// Deserialize
	pbTx2 := &pb.Transaction{}
	if err := proto.Unmarshal(data, pbTx2); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	// Convert back
	tx2 := pbTxToCore(pbTx2)

	t.Logf("Deserialized ReadSet keys: %d", len(tx2.ReadSet))
	t.Logf("Deserialized WriteSet keys: %d", len(tx2.WriteSet))

	// Verify deserialized
	if err := tx2.Verify(); err != nil {
		t.Fatalf("Deserialized transaction failed to verify: %v", err)
	}

	// Compare hashes
	hash1 := tx.HashForValidatorSigning()
	hash2 := tx2.HashForValidatorSigning()

	if string(hash1) != string(hash2) {
		t.Errorf("Hashes don't match:\n  Original:      %x\n  Deserialized:  %x", hash1, hash2)
	}

	t.Log("✅ Test passed!")
}

func TestTransactionConversion_BackwardCompatibility(t *testing.T) {
	// Create wallets
	validatorWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatal(err)
	}

	userWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatal(err)
	}

	validatorAddr, _ := core.AddressFromHex(validatorWallet.Address())
	userAddr, _ := core.AddressFromHex(userWallet.Address())

	// Create transaction
	tx := core.NewTransactionProposal(
		0, validatorAddr, userAddr, core.Address{0x02},
		core.NewBigInt(100), core.NewBigInt(1), 0,
		[]byte("test"),
	)

	// Add ReadSet/WriteSet
	accountKey := string(core.MakeAccountKey(userAddr))
	tx.SetExecutionEvidence(1, map[string][]byte{
		accountKey: []byte("balance"),
	}, map[string][]byte{
		accountKey: []byte("new_balance"),
	})

	tx.SignAsUser(userWallet)
	tx.SignAsValidator(validatorWallet)

	// Create old-format protobuf (direct binary keys)
	pbTxOld := &pb.Transaction{
		Id:           tx.ID[:],
		Validator:    tx.Validator[:],
		From:         tx.From[:],
		To:           tx.To[:],
		Value:        tx.Value.Bytes(),
		Nonce:        tx.Nonce.Bytes(),
		BlockLimit:   tx.BlockLimit,
		Data:         tx.Data,
		UserSig:      tx.UserSig,
		SequenceId:   tx.SequenceID,
		ReadSet:      tx.ReadSet,  // Direct binary keys (old format)
		WriteSet:     tx.WriteSet, // Direct binary keys (old format)
		ValidatorSig: tx.ValidatorSig,
	}

	t.Logf("Old format ReadSet keys: %d", len(pbTxOld.ReadSet))
	for k := range pbTxOld.ReadSet {
		t.Logf("  Key (binary): %x", []byte(k))
	}

	// Convert from old format
	txConverted := pbTxToCore(pbTxOld)

	t.Logf("Converted ReadSet keys: %d", len(txConverted.ReadSet))

	// Verify
	if err := txConverted.Verify(); err != nil {
		t.Fatalf("Converted transaction failed to verify: %v", err)
	}

	// Compare hashes
	hash1 := tx.HashForValidatorSigning()
	hash2 := txConverted.HashForValidatorSigning()

	if string(hash1) != string(hash2) {
		t.Errorf("Hashes don't match:\n  Original:   %x\n  Converted:  %x", hash1, hash2)
	}

	t.Log("✅ Backward compatibility test passed!")
}
