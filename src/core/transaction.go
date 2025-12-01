package core

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/bywise/go-bywise/src/wallet"
	"github.com/ethereum/go-ethereum/crypto"
)

// TransactionProposal represents a user-signed transaction proposal.
// This is what users create and sign before sending to validators.
// It gets propagated in the proposals mempool.
type TransactionProposal struct {
	TxType     uint8   // Transaction type (0 = transfer, 1 = contract call, etc)
	Validator  Address // Validator chosen to process
	From       Address // Sender address
	To         Address // Recipient address (empty for contract creation)
	Value      *BigInt // Amount to transfer (uint256)
	Nonce      *BigInt // Replay protection (uint256)
	BlockLimit uint64  // Transaction expires after this block (0 = no limit)
	Data       []byte  // EVM CallData or contract init code
	UserSig    []byte  // User's signature on the proposal
}

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
	TxType     uint8   // Transaction type (0 = transfer, 1 = contract call, etc)
	Validator  Address // Validator chosen to process this transaction
	From       Address // Sender address
	To         Address // Recipient address (can be empty for contract creation)
	Value      *BigInt // Amount to transfer (uint256)
	Nonce      *BigInt // Replay protection - unique per (From, Nonce) pair (uint256)
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
func NewTransactionProposal(txType uint8, validator, from, to Address, value, nonce *BigInt, blockLimit uint64, data []byte) *Transaction {
	if value == nil {
		value = NewBigInt(0)
	}
	if nonce == nil {
		nonce = NewBigInt(0)
	}
	return &Transaction{
		TxType:     txType,
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
// Includes: TxType, Validator, From, To, Value, Nonce, BlockLimit, Data
func (tx *Transaction) HashForUserSigning() []byte {
	var buf bytes.Buffer

	buf.WriteByte(tx.TxType)
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
	proposalHash := tx.HashForUserSigning()
	buf.Write(proposalHash)
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

	preHashData := buf.Bytes()
	result := wallet.Keccak256(preHashData)

	// Debug logging to help diagnose signature issues
	if false {  // Set to true for detailed debugging
		fmt.Printf("[DEBUG] HashForValidatorSigning:\n")
		fmt.Printf("  ProposalHash: %x\n", proposalHash)
		fmt.Printf("  UserSig: %x\n", tx.UserSig)
		fmt.Printf("  SequenceID: %d\n", tx.SequenceID)
		fmt.Printf("  ReadSet: %d keys\n", len(tx.ReadSet))
		for _, k := range sortedReadKeys {
			fmt.Printf("    %x -> %x\n", k, tx.ReadSet[k])
		}
		fmt.Printf("  WriteSet: %d keys\n", len(tx.WriteSet))
		for _, k := range sortedWriteKeys {
			fmt.Printf("    %x -> %x\n", k, tx.WriteSet[k])
		}
		fmt.Printf("  PreHash length: %d\n", len(preHashData))
		fmt.Printf("  Result hash: %x\n", result)
	}

	return result
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
	valid := wallet.VerifySignature(tx.Validator.Hex(), hash, tx.ValidatorSig)
	if !valid {
		// Try to recover what address actually signed this
		pubKey, err := crypto.SigToPub(hash, tx.ValidatorSig)
		var recoveredAddr string
		if err == nil {
			recoveredAddr = crypto.PubkeyToAddress(*pubKey).Hex()
		} else {
			recoveredAddr = fmt.Sprintf("(recovery failed: %v)", err)
		}

		fmt.Printf("[DEBUG] VerifyValidatorSignature failed:\n")
		fmt.Printf("  Expected Validator: %s\n", tx.Validator.Hex())
		fmt.Printf("  Recovered Address:  %s\n", recoveredAddr)
		fmt.Printf("  Hash: %x\n", hash)
		fmt.Printf("  ValidatorSig: %x\n", tx.ValidatorSig)
		fmt.Printf("  UserSig: %x\n", tx.UserSig)
		fmt.Printf("  ReadSet size: %d\n", len(tx.ReadSet))
		fmt.Printf("  WriteSet size: %d\n", len(tx.WriteSet))
		sortedReadKeys := sortMapKeys(tx.ReadSet)
		fmt.Printf("  ReadSet keys (hex): ")
		for i, k := range sortedReadKeys {
			if i > 0 {
				fmt.Printf(", ")
			}
			fmt.Printf("%x", []byte(k))  // Convert string to []byte first
		}
		fmt.Printf("\n")
		sortedWriteKeys := sortMapKeys(tx.WriteSet)
		fmt.Printf("  WriteSet keys (hex): ")
		for i, k := range sortedWriteKeys {
			if i > 0 {
				fmt.Printf(", ")
			}
			fmt.Printf("%x", []byte(k))  // Convert string to []byte first
		}
		fmt.Printf("\n")

		// Show detailed comparison
		fmt.Printf("  ReadSet details:\n")
		for _, k := range sortedReadKeys {
			fmt.Printf("    key=%x value=%x (len=%d)\n", []byte(k), tx.ReadSet[k], len(tx.ReadSet[k]))
		}
		fmt.Printf("  WriteSet details:\n")
		for _, k := range sortedWriteKeys {
			fmt.Printf("    key=%x value=%x (len=%d)\n", []byte(k), tx.WriteSet[k], len(tx.WriteSet[k]))
		}
	}
	return valid
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

// transactionJSON is used for JSON marshaling with hex-encoded keys
type transactionJSON struct {
	ID           Hash              `json:"id"`
	TxType       uint8             `json:"txType"`
	Validator    Address           `json:"validator"`
	From         Address           `json:"from"`
	To           Address           `json:"to"`
	Value        *BigInt           `json:"value"`
	Nonce        *BigInt           `json:"nonce"`
	BlockLimit   uint64            `json:"blockLimit"`
	Data         []byte            `json:"data"`
	UserSig      []byte            `json:"userSig"`
	SequenceID   uint64            `json:"sequenceID"`
	ReadSet      map[string]string `json:"readSet"`  // hex key -> hex value
	WriteSet     map[string]string `json:"writeSet"` // hex key -> hex value
	ValidatorSig []byte            `json:"validatorSig"`
}

// MarshalJSON implements custom JSON marshaling with hex-encoded ReadSet/WriteSet keys
func (tx *Transaction) MarshalJSON() ([]byte, error) {
	// Encode ReadSet and WriteSet keys/values as hex strings
	readSetHex := make(map[string]string)
	for k, v := range tx.ReadSet {
		keyHex := fmt.Sprintf("%x", []byte(k))
		valueHex := fmt.Sprintf("%x", v)
		readSetHex[keyHex] = valueHex
	}

	writeSetHex := make(map[string]string)
	for k, v := range tx.WriteSet {
		keyHex := fmt.Sprintf("%x", []byte(k))
		valueHex := fmt.Sprintf("%x", v)
		writeSetHex[keyHex] = valueHex
	}

	return json.Marshal(&transactionJSON{
		ID:           tx.ID,
		TxType:       tx.TxType,
		Validator:    tx.Validator,
		From:         tx.From,
		To:           tx.To,
		Value:        tx.Value,
		Nonce:        tx.Nonce,
		BlockLimit:   tx.BlockLimit,
		Data:         tx.Data,
		UserSig:      tx.UserSig,
		SequenceID:   tx.SequenceID,
		ReadSet:      readSetHex,
		WriteSet:     writeSetHex,
		ValidatorSig: tx.ValidatorSig,
	})
}

// UnmarshalJSON implements custom JSON unmarshaling with hex-decoded ReadSet/WriteSet keys
func (tx *Transaction) UnmarshalJSON(data []byte) error {
	var txJSON transactionJSON
	if err := json.Unmarshal(data, &txJSON); err != nil {
		return err
	}

	// Decode ReadSet keys/values from hex
	readSet := make(map[string][]byte)
	for keyHex, valueHex := range txJSON.ReadSet {
		// Decode key
		keyBytes, err := hex.DecodeString(keyHex)
		if err != nil {
			return fmt.Errorf("failed to decode ReadSet key %s: %v", keyHex, err)
		}

		// Decode value
		valueBytes, err := hex.DecodeString(valueHex)
		if err != nil {
			return fmt.Errorf("failed to decode ReadSet value for key %s: %v", keyHex, err)
		}

		readSet[string(keyBytes)] = valueBytes
	}

	// Decode WriteSet keys/values from hex
	writeSet := make(map[string][]byte)
	for keyHex, valueHex := range txJSON.WriteSet {
		// Decode key
		keyBytes, err := hex.DecodeString(keyHex)
		if err != nil {
			return fmt.Errorf("failed to decode WriteSet key %s: %v", keyHex, err)
		}

		// Decode value
		valueBytes, err := hex.DecodeString(valueHex)
		if err != nil {
			return fmt.Errorf("failed to decode WriteSet value for key %s: %v", keyHex, err)
		}

		writeSet[string(keyBytes)] = valueBytes
	}

	// Populate transaction
	tx.ID = txJSON.ID
	tx.TxType = txJSON.TxType
	tx.Validator = txJSON.Validator
	tx.From = txJSON.From
	tx.To = txJSON.To
	tx.Value = txJSON.Value
	tx.Nonce = txJSON.Nonce
	tx.BlockLimit = txJSON.BlockLimit
	tx.Data = txJSON.Data
	tx.UserSig = txJSON.UserSig
	tx.SequenceID = txJSON.SequenceID
	tx.ReadSet = readSet
	tx.WriteSet = writeSet
	tx.ValidatorSig = txJSON.ValidatorSig

	return nil
}
