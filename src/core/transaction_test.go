package core

import (
	"testing"

	"github.com/bywise/go-bywise/src/wallet"
)

func TestNewTransaction(t *testing.T) {
	from := Address{0x01}
	to := Address{0x02}
	value := NewBigInt(1000)
	data := []byte("test data")

	tx := NewTransaction(from, to, value, data)

	if tx.From != from {
		t.Error("From address mismatch")
	}
	if tx.To != to {
		t.Error("To address mismatch")
	}
	if tx.Value.Cmp(value) != 0 {
		t.Error("Value mismatch")
	}
	if string(tx.Data) != string(data) {
		t.Error("Data mismatch")
	}
}

func TestNewTransactionProposal(t *testing.T) {
	validator := Address{0x01}
	from := Address{0x02}
	to := Address{0x03}
	value := NewBigInt(1000)
	nonce := NewBigInt(5)
	data := []byte("test data")

	tx := NewTransactionProposal(validator, from, to, value, nonce, 0, data)

	if tx.Validator != validator {
		t.Error("Validator address mismatch")
	}
	if tx.From != from {
		t.Error("From address mismatch")
	}
	if tx.To != to {
		t.Error("To address mismatch")
	}
	if tx.Value.Cmp(value) != 0 {
		t.Error("Value mismatch")
	}
	if tx.Nonce.Cmp(nonce) != 0 {
		t.Error("Nonce mismatch")
	}
	if string(tx.Data) != string(data) {
		t.Error("Data mismatch")
	}
}

func TestTransactionSigningFlow(t *testing.T) {
	// Create wallets for user and validator
	userWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create user wallet: %v", err)
	}

	validatorWallet, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create validator wallet: %v", err)
	}

	// Create addresses from wallet addresses
	fromAddr, _ := AddressFromHex(userWallet.Address())
	validatorAddr, _ := AddressFromHex(validatorWallet.Address())
	toAddr := Address{0x02, 0x03, 0x04}

	// Create transaction proposal
	tx := NewTransactionProposal(validatorAddr, fromAddr, toAddr, NewBigInt(1000), NewBigInt(1), 0, []byte("transfer"))

	// User signs the proposal first (new flow)
	err = tx.SignAsUser(userWallet)
	if err != nil {
		t.Fatalf("User signing failed: %v", err)
	}

	// Verify user signature
	if !tx.VerifyUserSignature() {
		t.Error("User signature verification failed")
	}

	// Simulate validator execution - fill ReadSet and WriteSet
	readSet := map[string][]byte{
		string(MakeAccountKey(fromAddr)): []byte("balance_from"),
		string(MakeAccountKey(toAddr)):   []byte("balance_to"),
	}
	writeSet := map[string][]byte{
		string(MakeAccountKey(fromAddr)): []byte("new_balance_from"),
		string(MakeAccountKey(toAddr)):   []byte("new_balance_to"),
	}
	tx.SetExecutionEvidence(1, readSet, writeSet)

	// Validator signs after execution
	err = tx.SignAsValidator(validatorWallet)
	if err != nil {
		t.Fatalf("Validator signing failed: %v", err)
	}

	// Verify validator signature
	if !tx.VerifyValidatorSignature() {
		t.Error("Validator signature verification failed")
	}

	// Full verification
	err = tx.Verify()
	if err != nil {
		t.Errorf("Full transaction verification failed: %v", err)
	}

	// Check that ID is set
	if tx.ID.IsEmpty() {
		t.Error("Transaction ID should not be empty after signing")
	}
}

func TestTransactionWrongUserAddress(t *testing.T) {
	userWallet, _ := wallet.NewWallet()
	otherWallet, _ := wallet.NewWallet()

	fromAddr, _ := AddressFromHex(userWallet.Address())
	validatorAddr := Address{0x99}
	toAddr := Address{0x02}

	tx := NewTransactionProposal(validatorAddr, fromAddr, toAddr, NewBigInt(100), NewBigInt(0), 0, nil)

	// Try to sign with wrong wallet
	err := tx.SignAsUser(otherWallet)
	if err == nil {
		t.Error("Should fail when signing with wrong wallet")
	}
}

func TestTransactionWrongValidatorAddress(t *testing.T) {
	userWallet, _ := wallet.NewWallet()
	validatorWallet, _ := wallet.NewWallet()
	otherValidatorWallet, _ := wallet.NewWallet()

	fromAddr, _ := AddressFromHex(userWallet.Address())
	validatorAddr, _ := AddressFromHex(validatorWallet.Address())
	toAddr := Address{0x02}

	tx := NewTransactionProposal(validatorAddr, fromAddr, toAddr, NewBigInt(100), NewBigInt(0), 0, nil)

	// User signs first
	tx.SignAsUser(userWallet)

	// Set execution evidence
	tx.SetExecutionEvidence(1, nil, nil)

	// Try to sign with wrong validator wallet
	err := tx.SignAsValidator(otherValidatorWallet)
	if err == nil {
		t.Error("Should fail when signing with wrong validator wallet")
	}
}

func TestTransactionConflictDetection(t *testing.T) {
	addr1 := Address{0x01}
	addr2 := Address{0x02}
	addr3 := Address{0x03}

	key1 := MakeAccountKey(addr1)
	key2 := MakeAccountKey(addr2)
	key3 := MakeAccountKey(addr3)

	// Transaction 1 writes to key1
	tx1 := NewTransaction(addr1, addr2, NewBigInt(100), nil)
	tx1.ReadSet = map[string][]byte{
		string(key1): []byte("value1"),
	}
	tx1.WriteSet = map[string][]byte{
		string(key1): []byte("new_value1"),
	}

	// Transaction 2 reads key1 (conflict with tx1's write)
	tx2 := NewTransaction(addr2, addr3, NewBigInt(50), nil)
	tx2.ReadSet = map[string][]byte{
		string(key1): []byte("value1"),
	}
	tx2.WriteSet = map[string][]byte{
		string(key2): []byte("value2"),
	}

	if !tx1.HasConflict(tx2) {
		t.Error("tx1 and tx2 should conflict (tx1 writes key1, tx2 reads key1)")
	}

	// Transaction 3 writes to key3 only (no conflict with tx1)
	tx3 := NewTransaction(addr3, addr1, NewBigInt(25), nil)
	tx3.ReadSet = map[string][]byte{
		string(key3): []byte("value3"),
	}
	tx3.WriteSet = map[string][]byte{
		string(key3): []byte("new_value3"),
	}

	if tx1.HasConflict(tx3) {
		t.Error("tx1 and tx3 should not conflict")
	}

	// Transaction 4 writes to same key as tx1 (write-write conflict)
	tx4 := NewTransaction(addr1, addr3, NewBigInt(75), nil)
	tx4.ReadSet = map[string][]byte{
		string(key2): []byte("value2"),
	}
	tx4.WriteSet = map[string][]byte{
		string(key1): []byte("different_value"),
	}

	if !tx1.HasConflict(tx4) {
		t.Error("tx1 and tx4 should conflict (both write to key1)")
	}
}

func TestTransactionHashDeterminism(t *testing.T) {
	validator := Address{0x99}
	from := Address{0x01}
	to := Address{0x02}

	// Create two identical transactions
	tx1 := NewTransactionProposal(validator, from, to, NewBigInt(1000), NewBigInt(1), 0, []byte("data"))
	tx2 := NewTransactionProposal(validator, from, to, NewBigInt(1000), NewBigInt(1), 0, []byte("data"))

	tx1.SetExecutionEvidence(1, map[string][]byte{
		string(MakeAccountKey(from)): []byte("balance"),
	}, map[string][]byte{
		"key": []byte("value"),
	})
	tx2.SetExecutionEvidence(1, map[string][]byte{
		string(MakeAccountKey(from)): []byte("balance"),
	}, map[string][]byte{
		"key": []byte("value"),
	})

	// Hashes for user signing should be the same
	hash1 := tx1.HashForUserSigning()
	hash2 := tx2.HashForUserSigning()

	if string(hash1) != string(hash2) {
		t.Error("Identical transactions should produce identical user signing hashes")
	}

	// Different data should produce different hashes
	tx3 := NewTransactionProposal(validator, from, to, NewBigInt(1001), NewBigInt(1), 0, []byte("data"))
	tx3.SetExecutionEvidence(1, map[string][]byte{
		string(MakeAccountKey(from)): []byte("balance"),
	}, map[string][]byte{
		"key": []byte("value"),
	})

	hash3 := tx3.HashForUserSigning()
	if string(hash1) == string(hash3) {
		t.Error("Different transactions should produce different hashes")
	}
}

func TestTransactionNilValue(t *testing.T) {
	from := Address{0x01}
	to := Address{0x02}

	// Create transaction with nil value
	tx := NewTransaction(from, to, nil, nil)

	if tx.Value == nil {
		t.Error("Value should not be nil after creation")
	}
	if !tx.Value.IsZero() {
		t.Error("Value should be zero when created with nil")
	}
}

func TestVerifyReadSetAgainstState(t *testing.T) {
	from := Address{0x01}
	to := Address{0x02}

	tx := NewTransaction(from, to, NewBigInt(100), nil)

	// Set ReadSet with expected values
	tx.ReadSet = map[string][]byte{
		"key1": []byte("value1"),
		"key2": []byte("value2"),
	}

	// Create a mock state getter that returns matching values
	getState := func(key string) ([]byte, error) {
		return tx.ReadSet[key], nil
	}

	// Should pass
	err := tx.VerifyReadSetAgainstState(getState)
	if err != nil {
		t.Errorf("VerifyReadSetAgainstState should pass: %v", err)
	}

	// Create a state getter that returns different values
	getStateMismatch := func(key string) ([]byte, error) {
		return []byte("wrong_value"), nil
	}

	// Should fail
	err = tx.VerifyReadSetAgainstState(getStateMismatch)
	if err == nil {
		t.Error("VerifyReadSetAgainstState should fail with mismatched values")
	}
}
