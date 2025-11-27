package core

import (
	"testing"
)

func TestMakeAccountKey(t *testing.T) {
	addr := Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14}

	key := MakeAccountKey(addr)

	if len(key) != 21 {
		t.Errorf("Account key should be 21 bytes, got %d", len(key))
	}

	if key[0] != KeyTypeAccount {
		t.Errorf("Account key should start with KeyTypeAccount (0x01), got 0x%02x", key[0])
	}

	for i := 0; i < 20; i++ {
		if key[i+1] != addr[i] {
			t.Errorf("Address byte mismatch at index %d", i)
		}
	}
}

func TestMakeStorageKey(t *testing.T) {
	addr := Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14}
	slot := Hash{0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29,
		0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33,
		0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f}

	key := MakeStorageKey(addr, slot)

	if len(key) != 53 {
		t.Errorf("Storage key should be 53 bytes, got %d", len(key))
	}

	if key[0] != KeyTypeStorage {
		t.Errorf("Storage key should start with KeyTypeStorage (0x02), got 0x%02x", key[0])
	}

	for i := 0; i < 20; i++ {
		if key[i+1] != addr[i] {
			t.Errorf("Address byte mismatch at index %d", i)
		}
	}

	for i := 0; i < 32; i++ {
		if key[i+21] != slot[i] {
			t.Errorf("Slot byte mismatch at index %d", i)
		}
	}
}

func TestMakeCodeKey(t *testing.T) {
	addr := Address{0x01}
	key := MakeCodeKey(addr)

	if len(key) != 21 {
		t.Errorf("Code key should be 21 bytes, got %d", len(key))
	}

	if key[0] != KeyTypeCode {
		t.Errorf("Code key should start with KeyTypeCode (0x03), got 0x%02x", key[0])
	}
}

func TestMakeStakeKey(t *testing.T) {
	addr := Address{0x01}
	key := MakeStakeKey(addr)

	if len(key) != 21 {
		t.Errorf("Stake key should be 21 bytes, got %d", len(key))
	}

	if key[0] != KeyTypeStake {
		t.Errorf("Stake key should start with KeyTypeStake (0x04), got 0x%02x", key[0])
	}
}

func TestMakeWalletConfigKey(t *testing.T) {
	addr := Address{0x01}
	key := MakeWalletConfigKey(addr)

	if len(key) != 21 {
		t.Errorf("WalletConfig key should be 21 bytes, got %d", len(key))
	}

	if key[0] != KeyTypeWalletConfig {
		t.Errorf("WalletConfig key should start with KeyTypeWalletConfig (0x05), got 0x%02x", key[0])
	}
}

func TestParseAccountKey(t *testing.T) {
	originalAddr := Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14}

	key := MakeAccountKey(originalAddr)
	parsedAddr, ok := ParseAccountKey(key)

	if !ok {
		t.Fatal("Failed to parse account key")
	}

	if parsedAddr != originalAddr {
		t.Error("Parsed address does not match original")
	}

	// Test with invalid key
	_, ok = ParseAccountKey(StateKey{0x02, 0x01}) // Wrong type
	if ok {
		t.Error("Should fail to parse key with wrong type")
	}

	_, ok = ParseAccountKey(StateKey{0x01}) // Too short
	if ok {
		t.Error("Should fail to parse key that's too short")
	}
}

func TestParseStorageKey(t *testing.T) {
	originalAddr := Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14}
	originalSlot := Hash{0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29,
		0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33,
		0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f}

	key := MakeStorageKey(originalAddr, originalSlot)
	parsedAddr, parsedSlot, ok := ParseStorageKey(key)

	if !ok {
		t.Fatal("Failed to parse storage key")
	}

	if parsedAddr != originalAddr {
		t.Error("Parsed address does not match original")
	}

	if parsedSlot != originalSlot {
		t.Error("Parsed slot does not match original")
	}
}

func TestStateKeyEqual(t *testing.T) {
	addr := Address{0x01}
	key1 := MakeAccountKey(addr)
	key2 := MakeAccountKey(addr)
	key3 := MakeStakeKey(addr)

	if !key1.Equal(key2) {
		t.Error("Same keys should be equal")
	}

	if key1.Equal(key3) {
		t.Error("Different keys should not be equal")
	}
}

func TestStateKeyClone(t *testing.T) {
	addr := Address{0x01, 0x02, 0x03}
	original := MakeAccountKey(addr)
	clone := original.Clone()

	if !original.Equal(clone) {
		t.Error("Clone should equal original")
	}

	// Modify clone and ensure original is unchanged
	clone[0] = 0xFF
	if original[0] == 0xFF {
		t.Error("Modifying clone should not affect original")
	}
}

func TestStateKeyType(t *testing.T) {
	addr := Address{0x01}

	if MakeAccountKey(addr).Type() != KeyTypeAccount {
		t.Error("Account key type should be KeyTypeAccount")
	}

	if MakeStorageKey(addr, Hash{}).Type() != KeyTypeStorage {
		t.Error("Storage key type should be KeyTypeStorage")
	}

	if MakeCodeKey(addr).Type() != KeyTypeCode {
		t.Error("Code key type should be KeyTypeCode")
	}

	if MakeStakeKey(addr).Type() != KeyTypeStake {
		t.Error("Stake key type should be KeyTypeStake")
	}

	if MakeWalletConfigKey(addr).Type() != KeyTypeWalletConfig {
		t.Error("WalletConfig key type should be KeyTypeWalletConfig")
	}
}
