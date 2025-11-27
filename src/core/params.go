package core

import "encoding/json"

// ChainParams holds the blockchain network parameters
type ChainParams struct {
	// Initial coin supply minted to the genesis address
	InitialSupply *BigInt `json:"initialSupply"`

	// Minimum stake required for miners
	MinMinerStake *BigInt `json:"minMinerStake"`

	// Minimum stake required for validators
	MinValidatorStake *BigInt `json:"minValidatorStake"`
}

// DefaultChainParams returns the default chain parameters
func DefaultChainParams() *ChainParams {
	return &ChainParams{
		InitialSupply:     NewBigInt(1000000000000), // 1 trillion
		MinMinerStake:     NewBigInt(1000000),       // 1 million
		MinValidatorStake: NewBigInt(1000000),       // 1 million
	}
}

// Serialize serializes chain params to bytes
func (p *ChainParams) Serialize() ([]byte, error) {
	return json.Marshal(p)
}

// DeserializeChainParams deserializes chain params from bytes
func DeserializeChainParams(data []byte) (*ChainParams, error) {
	var params ChainParams
	if err := json.Unmarshal(data, &params); err != nil {
		return nil, err
	}
	return &params, nil
}
