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

// StakeInfo represents staking information for a validator/miner
// A node can be both a miner and validator if it has sufficient stake for each role
type StakeInfo struct {
	Address        Address `json:"address"`
	MinerStake     *BigInt `json:"minerStake"`     // Stake for mining
	ValidatorStake *BigInt `json:"validatorStake"` // Stake for validation
	IsValidator    bool    `json:"isValidator"`    // Has sufficient validator stake
	IsMiner        bool    `json:"isMiner"`        // Has sufficient miner stake
	Rewards        *BigInt `json:"rewards"`
	SlashCount     uint64  `json:"slashCount"`
	IsActive       bool    `json:"isActive"` // Active if either miner or validator

	// Deprecated: Use MinerStake + ValidatorStake instead
	// Kept for backwards compatibility during migration
	StakeAmount *BigInt `json:"stakeAmount,omitempty"`
}

// NewStakeInfo creates a new stake info
func NewStakeInfo(address Address) *StakeInfo {
	return &StakeInfo{
		Address:        address,
		MinerStake:     NewBigInt(0),
		ValidatorStake: NewBigInt(0),
		IsValidator:    false,
		IsMiner:        false,
		Rewards:        NewBigInt(0),
		SlashCount:     0,
		IsActive:       false,
	}
}

// TotalStake returns the total stake (miner + validator)
func (s *StakeInfo) TotalStake() *BigInt {
	total := new(BigInt).Add(s.MinerStake, s.ValidatorStake)
	// Add legacy stake if present
	if s.StakeAmount != nil && !s.StakeAmount.IsZero() {
		total = new(BigInt).Add(total, s.StakeAmount)
	}
	return total
}

// GetMinerStake returns the effective miner stake (including legacy)
func (s *StakeInfo) GetMinerStake() *BigInt {
	if s.MinerStake == nil {
		s.MinerStake = NewBigInt(0)
	}
	// If using legacy stake and is miner, use legacy stake
	if s.StakeAmount != nil && !s.StakeAmount.IsZero() && s.IsMiner && s.MinerStake.IsZero() {
		return s.StakeAmount
	}
	return s.MinerStake
}

// GetValidatorStake returns the effective validator stake (including legacy)
func (s *StakeInfo) GetValidatorStake() *BigInt {
	if s.ValidatorStake == nil {
		s.ValidatorStake = NewBigInt(0)
	}
	// If using legacy stake and is validator, use legacy stake
	if s.StakeAmount != nil && !s.StakeAmount.IsZero() && s.IsValidator && s.ValidatorStake.IsZero() {
		return s.StakeAmount
	}
	return s.ValidatorStake
}

// AddMinerStake adds to the miner stake amount
func (s *StakeInfo) AddMinerStake(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot add negative stake")
	}
	if s.MinerStake == nil {
		s.MinerStake = NewBigInt(0)
	}
	s.MinerStake = new(BigInt).Add(s.MinerStake, amount)
	return nil
}

// RemoveMinerStake removes from the miner stake amount
func (s *StakeInfo) RemoveMinerStake(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot remove negative stake")
	}
	if s.MinerStake == nil {
		s.MinerStake = NewBigInt(0)
	}
	if s.MinerStake.Cmp(amount) < 0 {
		return errors.New("insufficient miner stake")
	}
	s.MinerStake = new(BigInt).Sub(s.MinerStake, amount)
	return nil
}

// AddValidatorStake adds to the validator stake amount
func (s *StakeInfo) AddValidatorStake(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot add negative stake")
	}
	if s.ValidatorStake == nil {
		s.ValidatorStake = NewBigInt(0)
	}
	s.ValidatorStake = new(BigInt).Add(s.ValidatorStake, amount)
	return nil
}

// RemoveValidatorStake removes from the validator stake amount
func (s *StakeInfo) RemoveValidatorStake(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot remove negative stake")
	}
	if s.ValidatorStake == nil {
		s.ValidatorStake = NewBigInt(0)
	}
	if s.ValidatorStake.Cmp(amount) < 0 {
		return errors.New("insufficient validator stake")
	}
	s.ValidatorStake = new(BigInt).Sub(s.ValidatorStake, amount)
	return nil
}

// AddStake adds to the stake amount (deprecated - use AddMinerStake or AddValidatorStake)
func (s *StakeInfo) AddStake(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot add negative stake")
	}
	if s.StakeAmount == nil {
		s.StakeAmount = NewBigInt(0)
	}
	s.StakeAmount = new(BigInt).Add(s.StakeAmount, amount)
	return nil
}

// RemoveStake removes from the stake amount (deprecated - use RemoveMinerStake or RemoveValidatorStake)
func (s *StakeInfo) RemoveStake(amount *BigInt) error {
	if amount.Cmp(NewBigInt(0)) < 0 {
		return errors.New("cannot remove negative stake")
	}
	if s.StakeAmount == nil {
		s.StakeAmount = NewBigInt(0)
	}
	if s.StakeAmount.Cmp(amount) < 0 {
		return errors.New("insufficient stake")
	}
	s.StakeAmount = new(BigInt).Sub(s.StakeAmount, amount)
	return nil
}

// UpdateActiveStatus updates the IsActive flag based on miner and validator status
func (s *StakeInfo) UpdateActiveStatus() {
	s.IsActive = s.IsMiner || s.IsValidator
}

// AddReward adds to the rewards
func (s *StakeInfo) AddReward(amount *BigInt) {
	s.Rewards = new(BigInt).Add(s.Rewards, amount)
}

// Slash records a slash event and confiscates stake
func (s *StakeInfo) Slash() *BigInt {
	confiscated := s.StakeAmount
	s.StakeAmount = NewBigInt(0)
	s.SlashCount++
	s.IsActive = false
	return confiscated
}

// Serialize serializes stake info to bytes
func (s *StakeInfo) Serialize() ([]byte, error) {
	return json.Marshal(s)
}

// DeserializeStakeInfo deserializes stake info from bytes
func DeserializeStakeInfo(data []byte) (*StakeInfo, error) {
	var info StakeInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}
	return &info, nil
}
