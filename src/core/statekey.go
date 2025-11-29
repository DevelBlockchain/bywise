package core

import (
	"encoding/hex"
)

// Key type prefixes for LevelDB
const (
	KeyTypeAccount      byte = 0x01 // Balance and Nonce
	KeyTypeStorage      byte = 0x02 // EVM memory slots
	KeyTypeCode         byte = 0x03 // Compiled contract code
	KeyTypeWalletConfig byte = 0x05 // Arbitrary wallet configurations
)

// StateKey represents a key in the state database
// Used in transactions for ReadSet and WriteSet tracking
type StateKey []byte

// String returns the hex representation for logs/debug
func (k StateKey) String() string {
	return hex.EncodeToString(k)
}

// Bytes returns the underlying byte slice
func (k StateKey) Bytes() []byte {
	return k
}

// Type returns the key type prefix
func (k StateKey) Type() byte {
	if len(k) == 0 {
		return 0
	}
	return k[0]
}

// Equal checks if two StateKeys are equal
func (k StateKey) Equal(other StateKey) bool {
	if len(k) != len(other) {
		return false
	}
	for i := range k {
		if k[i] != other[i] {
			return false
		}
	}
	return true
}

// Clone creates a copy of the StateKey
func (k StateKey) Clone() StateKey {
	if k == nil {
		return nil
	}
	clone := make(StateKey, len(k))
	copy(clone, k)
	return clone
}

// --- Key Constructors (Helpers) ---

// MakeAccountKey creates a key for account data (balance/nonce)
// Format: 0x01 + Address (21 bytes total)
func MakeAccountKey(address Address) StateKey {
	k := make([]byte, 21) // 1 prefix + 20 address
	k[0] = KeyTypeAccount
	copy(k[1:], address[:])
	return k
}

// MakeStorageKey creates a key for EVM contract storage
// Format: 0x02 + ContractAddress + Slot (53 bytes total)
func MakeStorageKey(contractAddress Address, slot Hash) StateKey {
	k := make([]byte, 53) // 1 prefix + 20 addr + 32 slot
	k[0] = KeyTypeStorage
	copy(k[1:], contractAddress[:])
	copy(k[21:], slot[:])
	return k
}

// MakeCodeKey creates a key for contract bytecode
// Format: 0x03 + ContractAddress (21 bytes total)
func MakeCodeKey(contractAddress Address) StateKey {
	k := make([]byte, 21)
	k[0] = KeyTypeCode
	copy(k[1:], contractAddress[:])
	return k
}

// MakeWalletConfigKey creates a key for wallet configuration
// Format: 0x05 + Address (21 bytes total)
func MakeWalletConfigKey(address Address) StateKey {
	k := make([]byte, 21)
	k[0] = KeyTypeWalletConfig
	copy(k[1:], address[:])
	return k
}

// ParseAccountKey extracts the address from an account key
func ParseAccountKey(k StateKey) (Address, bool) {
	if len(k) != 21 || k[0] != KeyTypeAccount {
		return Address{}, false
	}
	return AddressFromBytes(k[1:21]), true
}

// ParseStorageKey extracts contract address and slot from a storage key
func ParseStorageKey(k StateKey) (Address, Hash, bool) {
	if len(k) != 53 || k[0] != KeyTypeStorage {
		return Address{}, Hash{}, false
	}
	return AddressFromBytes(k[1:21]), HashFromBytes(k[21:53]), true
}

// ParseCodeKey extracts the address from a code key
func ParseCodeKey(k StateKey) (Address, bool) {
	if len(k) != 21 || k[0] != KeyTypeCode {
		return Address{}, false
	}
	return AddressFromBytes(k[1:21]), true
}
