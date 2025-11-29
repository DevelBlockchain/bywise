package core

import (
	"encoding/json"
	"errors"
)

// Account represents an account's state
type Account struct {
	Address Address `json:"address"`
	Balance *BigInt `json:"balance"`
	Nonce   uint64  `json:"nonce"`
}

// NewAccount creates a new account with zero balance
func NewAccount(address Address) *Account {
	return &Account{
		Address: address,
		Balance: NewBigInt(0),
		Nonce:   0,
	}
}

// AddBalance adds to the account balance
func (a *Account) AddBalance(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot add negative amount")
	}
	a.Balance = new(BigInt).Add(a.Balance, amount)
	return nil
}

// SubBalance subtracts from the account balance
func (a *Account) SubBalance(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot subtract negative amount")
	}
	if a.Balance.Cmp(amount) < 0 {
		return errors.New("insufficient balance")
	}
	a.Balance = new(BigInt).Sub(a.Balance, amount)
	return nil
}

// IncrementNonce increments the account nonce
func (a *Account) IncrementNonce() {
	a.Nonce++
}

// Serialize serializes the account to bytes
func (a *Account) Serialize() ([]byte, error) {
	return json.Marshal(a)
}

// DeserializeAccount deserializes an account from bytes
func DeserializeAccount(data []byte) (*Account, error) {
	var acc Account
	if err := json.Unmarshal(data, &acc); err != nil {
		return nil, err
	}
	return &acc, nil
}
