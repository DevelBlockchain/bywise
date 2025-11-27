package core

import (
	"encoding/hex"
	"errors"
	"math/big"

	"github.com/bywise/go-bywise/src/wallet"
)

// Hash represents a 32-byte hash (Keccak256)
type Hash [32]byte

// EmptyHash returns an empty hash
func EmptyHash() Hash {
	return Hash{}
}

// Bytes returns the hash as a byte slice
func (h Hash) Bytes() []byte {
	return h[:]
}

// Hex returns the hash as a hex string with 0x prefix
func (h Hash) Hex() string {
	return "0x" + hex.EncodeToString(h[:])
}

// String implements Stringer
func (h Hash) String() string {
	return h.Hex()
}

// IsEmpty returns true if the hash is all zeros
func (h Hash) IsEmpty() bool {
	return h == Hash{}
}

// HashFromBytes creates a Hash from bytes
func HashFromBytes(b []byte) Hash {
	var h Hash
	if len(b) >= 32 {
		copy(h[:], b[:32])
	} else {
		copy(h[:], b)
	}
	return h
}

// HashFromHex creates a Hash from a hex string (with or without 0x prefix)
func HashFromHex(s string) (Hash, error) {
	if len(s) >= 2 && s[:2] == "0x" {
		s = s[2:]
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return Hash{}, err
	}
	return HashFromBytes(b), nil
}

// HashData computes the Keccak256 hash of data
func HashData(data []byte) Hash {
	return HashFromBytes(wallet.Keccak256(data))
}

// Address represents a 20-byte Ethereum-compatible address
type Address [20]byte

// EmptyAddress returns an empty address
func EmptyAddress() Address {
	return Address{}
}

// Bytes returns the address as a byte slice
func (a Address) Bytes() []byte {
	return a[:]
}

// Hex returns the address as a hex string with 0x prefix
func (a Address) Hex() string {
	return "0x" + hex.EncodeToString(a[:])
}

// String implements Stringer
func (a Address) String() string {
	return a.Hex()
}

// IsEmpty returns true if the address is all zeros
func (a Address) IsEmpty() bool {
	return a == Address{}
}

// AddressFromBytes creates an Address from bytes
func AddressFromBytes(b []byte) Address {
	var addr Address
	if len(b) >= 20 {
		copy(addr[:], b[len(b)-20:])
	} else {
		copy(addr[20-len(b):], b)
	}
	return addr
}

// AddressFromHex creates an Address from a hex string (with or without 0x prefix)
func AddressFromHex(s string) (Address, error) {
	if len(s) >= 2 && s[:2] == "0x" {
		s = s[2:]
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return Address{}, err
	}
	return AddressFromBytes(b), nil
}

// BigInt wraps big.Int for easier JSON serialization
type BigInt struct {
	*big.Int
}

// NewBigInt creates a new BigInt from int64
func NewBigInt(x int64) *BigInt {
	return &BigInt{big.NewInt(x)}
}

// NewBigIntFromString creates a BigInt from a string
func NewBigIntFromString(s string, base int) (*BigInt, bool) {
	i := new(big.Int)
	i, ok := i.SetString(s, base)
	if !ok {
		return nil, false
	}
	return &BigInt{i}, true
}

// Bytes returns the BigInt as bytes
func (b *BigInt) Bytes() []byte {
	if b.Int == nil {
		return []byte{0}
	}
	return b.Int.Bytes()
}

// BigIntFromBytes creates a BigInt from bytes
func BigIntFromBytes(data []byte) *BigInt {
	i := new(big.Int).SetBytes(data)
	return &BigInt{i}
}

// String returns the string representation
func (b *BigInt) String() string {
	if b.Int == nil {
		return "0"
	}
	return b.Int.String()
}

// Cmp compares two BigInts
func (b *BigInt) Cmp(other *BigInt) int {
	if b.Int == nil && other.Int == nil {
		return 0
	}
	if b.Int == nil {
		return -1
	}
	if other.Int == nil {
		return 1
	}
	return b.Int.Cmp(other.Int)
}

// Add adds two BigInts
func (b *BigInt) Add(x, y *BigInt) *BigInt {
	if b.Int == nil {
		b.Int = new(big.Int)
	}
	b.Int.Add(x.Int, y.Int)
	return b
}

// Sub subtracts two BigInts
func (b *BigInt) Sub(x, y *BigInt) *BigInt {
	if b.Int == nil {
		b.Int = new(big.Int)
	}
	b.Int.Sub(x.Int, y.Int)
	return b
}

// IsZero returns true if the value is zero
func (b *BigInt) IsZero() bool {
	return b.Int == nil || b.Int.Sign() == 0
}

// MarshalJSON implements json.Marshaler
func (b *BigInt) MarshalJSON() ([]byte, error) {
	if b.Int == nil {
		return []byte(`"0"`), nil
	}
	return []byte(`"` + b.Int.String() + `"`), nil
}

// UnmarshalJSON implements json.Unmarshaler
func (b *BigInt) UnmarshalJSON(data []byte) error {
	// Remove quotes
	str := string(data)
	if len(str) >= 2 && str[0] == '"' && str[len(str)-1] == '"' {
		str = str[1 : len(str)-1]
	}

	if b.Int == nil {
		b.Int = new(big.Int)
	}

	_, ok := b.Int.SetString(str, 10)
	if !ok {
		return errors.New("invalid BigInt value: " + str)
	}
	return nil
}
