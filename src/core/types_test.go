package core

import (
	"testing"
)

func TestHashFromBytes(t *testing.T) {
	// Test with exact 32 bytes
	data := make([]byte, 32)
	for i := range data {
		data[i] = byte(i)
	}
	hash := HashFromBytes(data)
	for i := range hash {
		if hash[i] != byte(i) {
			t.Errorf("Hash byte mismatch at index %d", i)
		}
	}

	// Test with less than 32 bytes
	shortData := []byte{1, 2, 3}
	shortHash := HashFromBytes(shortData)
	if shortHash[0] != 1 || shortHash[1] != 2 || shortHash[2] != 3 {
		t.Error("Short data not copied correctly")
	}

	// Test with more than 32 bytes
	longData := make([]byte, 64)
	for i := range longData {
		longData[i] = byte(i)
	}
	longHash := HashFromBytes(longData)
	for i := 0; i < 32; i++ {
		if longHash[i] != byte(i) {
			t.Errorf("Long data hash byte mismatch at index %d", i)
		}
	}
}

func TestHashFromHex(t *testing.T) {
	hexStr := "0x0102030405060708091011121314151617181920212223242526272829303132"
	hash, err := HashFromHex(hexStr)
	if err != nil {
		t.Fatalf("Failed to parse hex: %v", err)
	}

	if hash[0] != 0x01 || hash[31] != 0x32 {
		t.Error("Hash bytes not correct")
	}

	// Test without 0x prefix
	hash2, err := HashFromHex(hexStr[2:])
	if err != nil {
		t.Fatalf("Failed to parse hex without prefix: %v", err)
	}
	if hash != hash2 {
		t.Error("Hash should be same with or without 0x prefix")
	}
}

func TestHashHex(t *testing.T) {
	hash := Hash{0x01, 0x02, 0x03}
	hex := hash.Hex()
	if hex[:2] != "0x" {
		t.Error("Hex should start with 0x")
	}
	if len(hex) != 66 { // 0x + 64 hex chars
		t.Errorf("Hex length should be 66, got %d", len(hex))
	}
}

func TestHashIsEmpty(t *testing.T) {
	empty := EmptyHash()
	if !empty.IsEmpty() {
		t.Error("Empty hash should be empty")
	}

	notEmpty := Hash{0x01}
	if notEmpty.IsEmpty() {
		t.Error("Non-empty hash should not be empty")
	}
}

func TestAddressFromBytes(t *testing.T) {
	// Test with exact 20 bytes
	data := make([]byte, 20)
	for i := range data {
		data[i] = byte(i)
	}
	addr := AddressFromBytes(data)
	for i := range addr {
		if addr[i] != byte(i) {
			t.Errorf("Address byte mismatch at index %d", i)
		}
	}

	// Test with more than 20 bytes (should take last 20)
	longData := make([]byte, 32)
	for i := range longData {
		longData[i] = byte(i)
	}
	longAddr := AddressFromBytes(longData)
	for i := 0; i < 20; i++ {
		if longAddr[i] != byte(i+12) {
			t.Errorf("Long data address byte mismatch at index %d: got %d, expected %d", i, longAddr[i], i+12)
		}
	}
}

func TestAddressFromHex(t *testing.T) {
	hexStr := "0x742d35Cc6634C0532925a3b844Bc9e7595f50000"
	addr, err := AddressFromHex(hexStr)
	if err != nil {
		t.Fatalf("Failed to parse address hex: %v", err)
	}

	// Address hex is lowercase, compare case-insensitively
	expected := "0x742d35cc6634c0532925a3b844bc9e7595f50000"
	if addr.Hex() != expected {
		t.Errorf("Address hex mismatch: got %s, expected %s", addr.Hex(), expected)
	}
}

func TestBigInt(t *testing.T) {
	a := NewBigInt(100)
	b := NewBigInt(50)

	// Test addition
	c := new(BigInt).Add(a, b)
	if c.String() != "150" {
		t.Errorf("Addition failed: got %s, expected 150", c.String())
	}

	// Test subtraction
	d := new(BigInt).Sub(a, b)
	if d.String() != "50" {
		t.Errorf("Subtraction failed: got %s, expected 50", d.String())
	}

	// Test comparison
	if a.Cmp(b) <= 0 {
		t.Error("100 should be greater than 50")
	}

	// Test IsZero
	zero := NewBigInt(0)
	if !zero.IsZero() {
		t.Error("Zero should be zero")
	}
	if a.IsZero() {
		t.Error("100 should not be zero")
	}
}

func TestBigIntFromString(t *testing.T) {
	b, ok := NewBigIntFromString("1000000000000000000", 10)
	if !ok {
		t.Fatal("Failed to parse big int from string")
	}
	if b.String() != "1000000000000000000" {
		t.Errorf("BigInt string mismatch: got %s", b.String())
	}

	// Test hex
	hexBig, ok := NewBigIntFromString("ff", 16)
	if !ok {
		t.Fatal("Failed to parse hex big int")
	}
	if hexBig.String() != "255" {
		t.Errorf("Hex BigInt value mismatch: got %s, expected 255", hexBig.String())
	}
}
