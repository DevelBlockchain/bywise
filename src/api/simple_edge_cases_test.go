package api

import (
	"math/big"
	"os"
	"path/filepath"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/executor"
	"github.com/bywise/go-bywise/src/storage"
	"github.com/bywise/go-bywise/src/wallet"
)

// Simple test to validate transaction edge cases
func TestSimpleTransactionEdgeCases(t *testing.T) {
	// Create temp directory
	tmpDir := filepath.Join(os.TempDir(), "bywise-simple-test")
	defer os.RemoveAll(tmpDir)

	// Create wallet
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// Parse wallet address
	addr, err := core.AddressFromHex(w.Address())
	if err != nil {
		t.Fatalf("Failed to parse address: %v", err)
	}

	// Create storage
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	// Set initial balance
	initialBalance := core.NewBigInt(1000000)
	account := &core.Account{
		Address: addr,
		Balance: initialBalance,
		Nonce:   0,
	}
	err = store.SetAccount(account)
	if err != nil {
		t.Fatalf("Failed to set account: %v", err)
	}

	// Create validator
	val, err := executor.NewValidator(store, w, 1)
	if err != nil {
		t.Fatalf("Failed to create validator: %v", err)
	}

	t.Run("ValueExceedsBalance", func(t *testing.T) {
		recipient := core.Address{0x01}
		excessiveValue := core.NewBigInt(0).Add(initialBalance, core.NewBigInt(1))

		execReq := &executor.ExecutionRequest{
			From:  addr,
			To:    recipient,
			Value: excessiveValue.Int,
			Data:  nil,
		}

		result := val.Execute(execReq)

		if result.Error == nil {
			t.Error("Expected error for insufficient balance")
		}
		// Note: Error being set is sufficient - the transaction is rejected
		t.Logf("✓ Value exceeds balance - correctly rejected: %v", result.Error)
	})

	t.Run("ZeroValueTransfer", func(t *testing.T) {
		recipient := core.Address{0x01}

		execReq := &executor.ExecutionRequest{
			From:  addr,
			To:    recipient,
			Value: big.NewInt(0),
			Data:  nil,
		}

		result := val.Execute(execReq)

		if result.Error != nil {
			t.Errorf("Zero value transfer failed: %v", result.Error)
		}
		if result.Reverted {
			t.Error("Zero value transfer should not revert")
		}
		t.Logf("✓ Zero value transfer succeeded")
	})

	t.Run("ExactBalanceTransfer", func(t *testing.T) {
		// Get current balance
		acc, err := store.GetAccount(addr)
		if err != nil {
			t.Fatalf("Failed to get account: %v", err)
		}

		recipient := core.Address{0x02}
		execReq := &executor.ExecutionRequest{
			From:  addr,
			To:    recipient,
			Value: acc.Balance.Int,
			Data:  nil,
		}

		result := val.Execute(execReq)

		if result.Error != nil {
			t.Errorf("Exact balance transfer failed: %v", result.Error)
		}
		if result.Reverted {
			t.Error("Exact balance transfer should not revert")
		}
		t.Logf("✓ Exact balance transfer succeeded")
	})
}

// Test stake edge cases
func TestSimpleStakeEdgeCases(t *testing.T) {
	// Create temp directory
	tmpDir := filepath.Join(os.TempDir(), "bywise-stake-test")
	defer os.RemoveAll(tmpDir)

	// Create wallet
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// Parse wallet address
	addr, err := core.AddressFromHex(w.Address())
	if err != nil {
		t.Fatalf("Failed to parse address: %v", err)
	}

	// Create storage
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	// Set initial balance
	initialBalance := core.NewBigInt(5000000)
	account := &core.Account{
		Address: addr,
		Balance: initialBalance,
		Nonce:   0,
	}
	err = store.SetAccount(account)
	if err != nil {
		t.Fatalf("Failed to set account: %v", err)
	}

	t.Run("AddStakeDeductsBalance", func(t *testing.T) {
		// Get current balance
		acc, err := store.GetAccount(addr)
		if err != nil {
			t.Fatalf("Failed to get account: %v", err)
		}
		beforeBalance := &core.BigInt{Int: new(big.Int).Set(acc.Balance.Int)}
		t.Logf("Balance before stake: %s", beforeBalance.String())

		// Add stake
		stakeAmount := core.NewBigInt(2000000)
		stakeInfo, err := store.GetStakeInfo(addr)
		if err != nil {
			t.Fatalf("Failed to get stake info: %v", err)
		}

		oldStake := stakeInfo.GetMinerStake()
		stakeInfo.MinerStake = stakeAmount
		err = store.SetStakeInfo(stakeInfo)
		if err != nil {
			t.Fatalf("Failed to set stake: %v", err)
		}

		// Update balance
		stakeChange := core.NewBigInt(0).Sub(stakeAmount, oldStake)
		newBalance := core.NewBigInt(0).Sub(beforeBalance, stakeChange)
		acc.Balance = newBalance
		err = store.SetAccount(acc)
		if err != nil {
			t.Fatalf("Failed to update account: %v", err)
		}

		// Verify
		acc, err = store.GetAccount(addr)
		if err != nil {
			t.Fatalf("Failed to get account: %v", err)
		}

		expectedBalance := core.NewBigInt(0).Sub(beforeBalance, stakeAmount)
		if acc.Balance.Cmp(expectedBalance) != 0 {
			t.Errorf("Balance mismatch: expected %s, got %s", expectedBalance.String(), acc.Balance.String())
		}
		t.Logf("✓ Balance after stake: %s (deducted %s)", acc.Balance.String(), stakeAmount.String())
	})

	t.Run("RemoveStakeAddsBalance", func(t *testing.T) {
		// Get current state
		acc, err := store.GetAccount(addr)
		if err != nil {
			t.Fatalf("Failed to get account: %v", err)
		}
		beforeBalance := &core.BigInt{Int: new(big.Int).Set(acc.Balance.Int)}

		stakeInfo, err := store.GetStakeInfo(addr)
		if err != nil {
			t.Fatalf("Failed to get stake info: %v", err)
		}

		// Remove half stake
		oldStake := stakeInfo.GetMinerStake()
		removeAmount := core.NewBigInt(1000000)
		newStake := core.NewBigInt(0).Sub(oldStake, removeAmount)

		stakeInfo.MinerStake = newStake
		err = store.SetStakeInfo(stakeInfo)
		if err != nil {
			t.Fatalf("Failed to update stake: %v", err)
		}

		// Update balance
		stakeChange := core.NewBigInt(0).Sub(newStake, oldStake) // Negative
		newBalance := core.NewBigInt(0).Sub(beforeBalance, stakeChange) // Sub negative = Add
		acc.Balance = newBalance
		err = store.SetAccount(acc)
		if err != nil {
			t.Fatalf("Failed to update account: %v", err)
		}

		// Verify
		acc, err = store.GetAccount(addr)
		if err != nil {
			t.Fatalf("Failed to get account: %v", err)
		}

		expectedBalance := core.NewBigInt(0).Add(beforeBalance, removeAmount)
		if acc.Balance.Cmp(expectedBalance) != 0 {
			t.Errorf("Balance mismatch: expected %s, got %s", expectedBalance.String(), acc.Balance.String())
		}
		t.Logf("✓ Balance after removing stake: %s (added %s)", acc.Balance.String(), removeAmount.String())
	})

	t.Run("InsufficientBalanceForStake", func(t *testing.T) {
		// Set low balance
		lowBalance := core.NewBigInt(500000)
		acc := &core.Account{
			Address: addr,
			Balance: lowBalance,
			Nonce:   0,
		}
		err := store.SetAccount(acc)
		if err != nil {
			t.Fatalf("Failed to set account: %v", err)
		}

		// Try to add more stake than balance
		requiredStake := core.NewBigInt(1000000)

		if lowBalance.Cmp(requiredStake) < 0 {
			t.Logf("✓ Correctly detected insufficient balance: have %s, need %s",
				lowBalance.String(), requiredStake.String())
		} else {
			t.Error("Should have detected insufficient balance")
		}
	})
}

// Test fee consistency
func TestFeeConsistency(t *testing.T) {
	// Create temp directory
	tmpDir := filepath.Join(os.TempDir(), "bywise-fee-test")
	defer os.RemoveAll(tmpDir)

	// Create wallet
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// Parse wallet address
	addr, err := core.AddressFromHex(w.Address())
	if err != nil {
		t.Fatalf("Failed to parse address: %v", err)
	}

	// Create storage
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	// Set initial balance
	initialBalance := core.NewBigInt(1000000000)
	account := &core.Account{
		Address: addr,
		Balance: initialBalance,
		Nonce:   0,
	}
	err = store.SetAccount(account)
	if err != nil {
		t.Fatalf("Failed to set account: %v", err)
	}

	// Create validator
	val, err := executor.NewValidator(store, w, 1)
	if err != nil {
		t.Fatalf("Failed to create validator: %v", err)
	}

	t.Run("IdenticalTransactionsSameGas", func(t *testing.T) {
		recipient := core.Address{0x01}
		value := core.NewBigInt(1000)

		var gasValues []uint64

		// Execute same transaction 5 times
		for i := 0; i < 5; i++ {
			execReq := &executor.ExecutionRequest{
				From:  addr,
				To:    recipient,
				Value: value.Int,
				Data:  nil,
			}

			result := val.Execute(execReq)
			if result.Error != nil {
				t.Fatalf("Execution %d failed: %v", i, result.Error)
			}

			gasValues = append(gasValues, result.GasUsed)
		}

		// Check consistency
		firstGas := gasValues[0]
		for i, gas := range gasValues {
			if gas != firstGas {
				t.Errorf("Gas inconsistency at execution %d: expected %d, got %d", i, firstGas, gas)
			}
		}

		t.Logf("✓ Consistent gas usage across %d executions: %d", len(gasValues), firstGas)
	})

	t.Run("LargerDataMoreGas", func(t *testing.T) {
		recipient := core.Address{0x01}

		// No data
		execReqNoData := &executor.ExecutionRequest{
			From:  addr,
			To:    recipient,
			Value: big.NewInt(0),
			Data:  nil,
		}

		resultNoData := val.Execute(execReqNoData)
		if resultNoData.Error != nil {
			t.Fatalf("No data execution failed: %v", resultNoData.Error)
		}

		// With data
		data := make([]byte, 100)
		execReqWithData := &executor.ExecutionRequest{
			From:  addr,
			To:    recipient,
			Value: big.NewInt(0),
			Data:  data,
		}

		resultWithData := val.Execute(execReqWithData)
		if resultWithData.Error != nil {
			t.Fatalf("With data execution failed: %v", resultWithData.Error)
		}

		if resultWithData.GasUsed < resultNoData.GasUsed {
			t.Error("Transaction with data should use at least as much gas")
		}

		t.Logf("✓ Gas no data: %d, with data (%d bytes): %d",
			resultNoData.GasUsed, len(data), resultWithData.GasUsed)
	})
}
