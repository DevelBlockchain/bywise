package core

import (
	"bytes"
	"encoding/binary"
	"errors"

	"github.com/bywise/go-bywise/src/wallet"
)

// Transaction represents a complete, self-contained and stateless transaction.
// Can be validated in isolation without external state access.
// Contains all input data (ReadSet with values) and output data (WriteSet) for verification.
//
// Two hashes exist:
// - ProposalHash: Implicit hash of the user proposal (Validator+From+To+Value+Nonce+BlockLimit+Data)
//   Can be computed via HashForUserSigning(). Used for nonce uniqueness check.
// - ID: Hash of the complete transaction including validator's execution evidence and signature.
//   Unique per execution attempt. Multiple IDs can exist for the same ProposalHash.
type Transaction struct {
	// Transaction ID (Keccak256 hash of the complete transaction data)
	ID Hash

	// User Proposal (signed by user before sending to validator)
	Validator  Address // Validator chosen to process this transaction
	From       Address // Sender address
	To         Address // Recipient address (can be empty for contract creation)
	Value      *BigInt // Amount to transfer
	Nonce      *BigInt // Replay protection - unique per (From, Nonce) pair
	BlockLimit uint64  // Transaction expires after this block number (0 = no limit)
	Data       []byte  // EVM CallData
	UserSig    []byte  // User signature (authorizes the proposal)

	// Execution Evidence (filled by Validator after execution)
	SequenceID   uint64            // Ordering for sponsored contracts
	ReadSet      map[string][]byte // Dependencies: keys AND values read during execution
	WriteSet     map[string][]byte // State changes (key -> new value)
	ValidatorSig []byte            // Validator signature (confirms execution correctness)
}

// NewTransactionProposal creates a new transaction proposal to be signed by the user.
// This is the first step in the 2-step transaction flow.
// blockLimit specifies the maximum block number for inclusion (0 = no limit).
func NewTransactionProposal(validator, from, to Address, value, nonce *BigInt, blockLimit uint64, data []byte) *Transaction {
	if value == nil {
		value = NewBigInt(0)
	}
	if nonce == nil {
		nonce = NewBigInt(0)
	}
	return &Transaction{
		Validator:  validator,
		From:       from,
		To:         to,
		Value:      value,
		Nonce:      nonce,
		BlockLimit: blockLimit,
		Data:       data,
		ReadSet:    make(map[string][]byte),
		WriteSet:   make(map[string][]byte),
	}
}

// NewTransaction creates a new unsigned transaction (legacy compatibility)
// Deprecated: Use NewTransactionProposal instead
func NewTransaction(from, to Address, value *BigInt, data []byte) *Transaction {
	if value == nil {
		value = NewBigInt(0)
	}
	return &Transaction{
		From:     from,
		To:       to,
		Value:    value,
		Nonce:    NewBigInt(0),
		Data:     data,
		ReadSet:  make(map[string][]byte),
		WriteSet: make(map[string][]byte),
	}
}

// SetExecutionEvidence sets the execution evidence from validator
// ReadSet now contains both keys and their values read during execution
func (tx *Transaction) SetExecutionEvidence(sequenceID uint64, readSet map[string][]byte, writeSet map[string][]byte) {
	tx.SequenceID = sequenceID
	tx.ReadSet = readSet
	tx.WriteSet = writeSet
}

// HashForUserSigning returns the hash that the user signs (the proposal).
// This is signed FIRST by the user before sending to the validator.
// This is also the "ProposalHash" - used to detect duplicate nonces.
// Includes: Validator, From, To, Value, Nonce, BlockLimit, Data
func (tx *Transaction) HashForUserSigning() []byte {
	var buf bytes.Buffer

	buf.Write(tx.Validator[:])
	buf.Write(tx.From[:])
	buf.Write(tx.To[:])
	if tx.Value != nil && tx.Value.Int != nil {
		buf.Write(tx.Value.Bytes())
	}
	if tx.Nonce != nil && tx.Nonce.Int != nil {
		buf.Write(tx.Nonce.Bytes())
	}
	// Include BlockLimit in the signed data
	blockLimitBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(blockLimitBytes, tx.BlockLimit)
	buf.Write(blockLimitBytes)
	buf.Write(tx.Data)

	return wallet.Keccak256(buf.Bytes())
}

// ProposalHash returns the hash of the user's proposal.
// This is an alias for HashForUserSigning() for clarity.
// Used to identify unique proposals by (From, Nonce) pair.
func (tx *Transaction) ProposalHash() Hash {
	return HashFromBytes(tx.HashForUserSigning())
}

// HashForValidatorSigning returns the hash that the validator signs.
// This is signed AFTER execution, includes the user proposal hash + execution evidence.
// Includes: UserProposalHash, UserSig, SequenceID, ReadSet (with values), WriteSet
func (tx *Transaction) HashForValidatorSigning() []byte {
	var buf bytes.Buffer

	// Include user proposal hash and signature
	buf.Write(tx.HashForUserSigning())
	buf.Write(tx.UserSig)

	// SequenceID
	seqBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(seqBytes, tx.SequenceID)
	buf.Write(seqBytes)

	// ReadSet (sorted by key for determinism) - now includes values
	sortedReadKeys := sortMapKeys(tx.ReadSet)
	for _, key := range sortedReadKeys {
		buf.WriteString(key)
		buf.Write(tx.ReadSet[key])
	}

	// WriteSet (sorted by key for determinism)
	sortedWriteKeys := sortMapKeys(tx.WriteSet)
	for _, key := range sortedWriteKeys {
		buf.WriteString(key)
		buf.Write(tx.WriteSet[key])
	}

	return wallet.Keccak256(buf.Bytes())
}

// ComputeID computes and sets the transaction ID
// The ID is computed from the validator signing hash + validator signature
func (tx *Transaction) ComputeID() {
	var buf bytes.Buffer

	buf.Write(tx.HashForValidatorSigning())
	buf.Write(tx.ValidatorSig)

	tx.ID = HashFromBytes(wallet.Keccak256(buf.Bytes()))
}

// SignAsUser signs the transaction proposal as the user.
// This is the FIRST step - user signs before sending to validator.
func (tx *Transaction) SignAsUser(w *wallet.Wallet) error {
	// Verify user address matches From
	userAddr, err := AddressFromHex(w.Address())
	if err != nil {
		return err
	}
	if userAddr != tx.From {
		return errors.New("wallet address does not match transaction From address")
	}

	hash := tx.HashForUserSigning()
	sig, err := w.Sign(hash)
	if err != nil {
		return err
	}

	tx.UserSig = sig
	return nil
}

// SignAsValidator signs the transaction as a validator after execution.
// This is the SECOND step - validator signs after filling ReadSet/WriteSet.
func (tx *Transaction) SignAsValidator(w *wallet.Wallet) error {
	// Verify validator address matches the one specified in the proposal
	validatorAddr, err := AddressFromHex(w.Address())
	if err != nil {
		return err
	}
	if validatorAddr != tx.Validator {
		return errors.New("wallet address does not match transaction Validator address")
	}

	// Verify user signature before signing
	if !tx.VerifyUserSignature() {
		return errors.New("invalid user signature - cannot sign as validator")
	}

	hash := tx.HashForValidatorSigning()
	sig, err := w.Sign(hash)
	if err != nil {
		return err
	}

	tx.ValidatorSig = sig
	tx.ComputeID()
	return nil
}

// VerifyValidatorSignature verifies the validator's signature
func (tx *Transaction) VerifyValidatorSignature() bool {
	if len(tx.ValidatorSig) == 0 {
		return false
	}
	hash := tx.HashForValidatorSigning()
	return wallet.VerifySignature(tx.Validator.Hex(), hash, tx.ValidatorSig)
}

// VerifyUserSignature verifies the user's signature
func (tx *Transaction) VerifyUserSignature() bool {
	if len(tx.UserSig) == 0 {
		return false
	}
	hash := tx.HashForUserSigning()
	return wallet.VerifySignature(tx.From.Hex(), hash, tx.UserSig)
}

// IsExpired returns true if the transaction has expired (current block > BlockLimit).
// Returns false if BlockLimit is 0 (no expiration).
func (tx *Transaction) IsExpired(currentBlock uint64) bool {
	if tx.BlockLimit == 0 {
		return false // No limit set
	}
	return currentBlock > tx.BlockLimit
}

// Verify performs full transaction verification (does not check expiration)
func (tx *Transaction) Verify() error {
	// First verify user signature (they signed the proposal first)
	if !tx.VerifyUserSignature() {
		return errors.New("invalid user signature")
	}

	// Then verify validator signature (they signed after execution)
	if !tx.VerifyValidatorSignature() {
		return errors.New("invalid validator signature")
	}

	// Verify ID matches computed ID
	var buf bytes.Buffer
	buf.Write(tx.HashForValidatorSigning())
	buf.Write(tx.ValidatorSig)
	expectedID := HashFromBytes(wallet.Keccak256(buf.Bytes()))

	if tx.ID != expectedID {
		return errors.New("transaction ID mismatch")
	}

	return nil
}

// VerifyForBlock performs full transaction verification including expiration check
func (tx *Transaction) VerifyForBlock(blockNumber uint64) error {
	// Check expiration first
	if tx.IsExpired(blockNumber) {
		return errors.New("transaction expired")
	}

	return tx.Verify()
}

// HasConflict checks if this transaction has any key conflicts with another
func (tx *Transaction) HasConflict(other *Transaction) bool {
	// Check if any WriteSet key in tx is in other's ReadSet or WriteSet
	for key := range tx.WriteSet {
		// Check other's ReadSet (now a map)
		if _, exists := other.ReadSet[key]; exists {
			return true
		}
		// Check other's WriteSet
		if _, exists := other.WriteSet[key]; exists {
			return true
		}
	}

	// Check if any ReadSet key in tx is in other's WriteSet
	for readKey := range tx.ReadSet {
		if _, exists := other.WriteSet[readKey]; exists {
			return true
		}
	}

	return false
}

// VerifyReadSetAgainstState verifies that the ReadSet values match the given state.
// This is used by miners to validate transactions without re-executing EVM.
func (tx *Transaction) VerifyReadSetAgainstState(getState func(key string) ([]byte, error)) error {
	for key, expectedValue := range tx.ReadSet {
		actualValue, err := getState(key)
		if err != nil {
			return err
		}
		if !bytes.Equal(actualValue, expectedValue) {
			return errors.New("ReadSet value mismatch for key: " + key)
		}
	}
	return nil
}

// GetReadSetKeys returns all keys from the ReadSet
func (tx *Transaction) GetReadSetKeys() []string {
	keys := make([]string, 0, len(tx.ReadSet))
	for k := range tx.ReadSet {
		keys = append(keys, k)
	}
	return keys
}

// sortMapKeys returns sorted keys from a map
func sortMapKeys(m map[string][]byte) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Simple bubble sort (for small maps)
	for i := 0; i < len(keys)-1; i++ {
		for j := 0; j < len(keys)-i-1; j++ {
			if keys[j] > keys[j+1] {
				keys[j], keys[j+1] = keys[j+1], keys[j]
			}
		}
	}
	return keys
}
