package executor

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
)

// SimpleERC20 bytecode compiled from contracts/SimpleERC20.sol
// Constructor: constructor(string _name, string _symbol, uint256 _initialSupply)
const simpleERC20Bytecode = "608060405234801561000f575f5ffd5b50604051610ba3380380610ba383398101604081905261002e9161015d565b5f610039848261024e565b506001610046838261024e565b506002805460ff1916601290811790915561006290600a610401565b61006c9082610413565b6003819055335f81815260046020908152604080832085905551938452919290917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a350505061042a565b634e487b7160e01b5f52604160045260245ffd5b5f82601f8301126100e3575f5ffd5b81516001600160401b038111156100fc576100fc6100c0565b604051601f8201601f19908116603f011681016001600160401b038111828210171561012a5761012a6100c0565b604052818152838201602001851015610141575f5ffd5b8160208501602083015e5f918101602001919091529392505050565b5f5f5f6060848603121561016f575f5ffd5b83516001600160401b03811115610184575f5ffd5b610190868287016100d4565b602086015190945090506001600160401b038111156101ad575f5ffd5b6101b9868287016100d4565b925050604084015190509250925092565b600181811c908216806101de57607f821691505b6020821081036101fc57634e487b7160e01b5f52602260045260245ffd5b50919050565b601f82111561024957805f5260205f20601f840160051c810160208510156102275750805b601f840160051c820191505b81811015610246575f8155600101610233565b50505b505050565b81516001600160401b03811115610267576102676100c0565b61027b8161027584546101ca565b84610202565b6020601f8211600181146102ad575f83156102965750848201515b5f19600385901b1c1916600184901b178455610246565b5f84815260208120601f198516915b828110156102dc57878501518255602094850194600190920191016102bc565b50848210156102f957868401515f19600387901b60f8161c191681555b50505050600190811b01905550565b634e487b7160e01b5f52601160045260245ffd5b6001815b60018411156103575780850481111561033b5761033b610308565b600184161561034957908102905b60019390931c928002610320565b935093915050565b5f8261036d575060016103fb565b8161037957505f6103fb565b816001811461038f5760028114610399576103b5565b60019150506103fb565b60ff8411156103aa576103aa610308565b50506001821b6103fb565b5060208310610133831016604e8410600b84101617156103d8575081810a6103fb565b6103e45f19848461031c565b805f19048211156103f7576103f7610308565b0290505b92915050565b5f61040c838361035f565b9392505050565b80820281158282048414176103fb576103fb610308565b61076c806104375f395ff3fe608060405234801561000f575f5ffd5b5060043610610090575f3560e01c8063313ce56711610063578063313ce567146100ff57806370a082311461011e57806395d89b411461013d578063a9059cbb14610145578063dd62ed3e14610158575f5ffd5b806306fdde0314610094578063095ea7b3146100b257806318160ddd146100d557806323b872dd146100ec575b5f5ffd5b61009c610182565b6040516100a991906105c1565b60405180910390f35b6100c56100c0366004610611565b61020d565b60405190151581526020016100a9565b6100de60035481565b6040519081526020016100a9565b6100c56100fa366004610639565b610279565b60025461010c9060ff1681565b60405160ff90911681526020016100a9565b6100de61012c366004610673565b60046020525f908152604090205481565b61009c610481565b6100c5610153366004610611565b61048e565b6100de610166366004610693565b600560209081525f928352604080842090915290825290205481565b5f805461018e906106c4565b80601f01602080910402602001604051908101604052809291908181526020018280546101ba906106c4565b80156102055780601f106101dc57610100808354040283529160200191610205565b820191905f5260205f20905b8154815290600101906020018083116101e857829003601f168201915b505050505081565b335f8181526005602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906102679086815260200190565b60405180910390a35060015b92915050565b5f6001600160a01b0383166102d05760405162461bcd60e51b81526020600482015260186024820152775472616e7366657220746f207a65726f206164647265737360401b60448201526064015b60405180910390fd5b6001600160a01b0384165f9081526004602052604090205482111561032e5760405162461bcd60e51b8152602060048201526014602482015273496e73756666696369656e742062616c616e636560601b60448201526064016102c7565b6001600160a01b0384165f9081526005602090815260408083203384529091529020548211156103995760405162461bcd60e51b8152602060048201526016602482015275496e73756666696369656e7420616c6c6f77616e636560501b60448201526064016102c7565b6001600160a01b0384165f90815260046020526040812080548492906103c0908490610710565b90915550506001600160a01b0383165f90815260046020526040812080548492906103ec908490610723565b90915550506001600160a01b0384165f90815260056020908152604080832033845290915281208054849290610423908490610710565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161046f91815260200190565b60405180910390a35060019392505050565b6001805461018e906106c4565b5f6001600160a01b0383166104e05760405162461bcd60e51b81526020600482015260186024820152775472616e7366657220746f207a65726f206164647265737360401b60448201526064016102c7565b335f908152600460205260409020548211156105355760405162461bcd60e51b8152602060048201526014602482015273496e73756666696369656e742062616c616e636560601b60448201526064016102c7565b335f9081526004602052604081208054849290610553908490610710565b90915550506001600160a01b0383165f908152600460205260408120805484929061057f908490610723565b90915550506040518281526001600160a01b0384169033907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef90602001610267565b602081525f82518060208401528060208501604085015e5f604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b038116811461060c575f5ffd5b919050565b5f5f60408385031215610622575f5ffd5b61062b836105f6565b946020939093013593505050565b5f5f5f6060848603121561064b575f5ffd5b610654846105f6565b9250610662602085016105f6565b929592945050506040919091013590565b5f60208284031215610683575f5ffd5b61068c826105f6565b9392505050565b5f5f604083850312156106a4575f5ffd5b6106ad836105f6565b91506106bb602084016105f6565b90509250929050565b600181811c908216806106d857607f821691505b6020821081036106f657634e487b7160e01b5f52602260045260245ffd5b50919050565b634e487b7160e01b5f52601160045260245ffd5b81810381811115610273576102736106fc565b80820180821115610273576102736106fc56fea2646970667358221220ad9a50036d1e4f96cbaef20f8ad4652d5363e48150aae75bb1b1c06728eccd2764736f6c634300081e0033"

// Function selectors for ERC20
const (
	// balanceOf(address) = 0x70a08231
	selectorBalanceOf = "70a08231"
	// transfer(address,uint256) = 0xa9059cbb
	selectorTransfer = "a9059cbb"
	// totalSupply() = 0x18160ddd
	selectorTotalSupply = "18160ddd"
	// decimals() = 0x313ce567
	selectorDecimals = "313ce567"
)

// setupE2EEVM creates a new EVM with storage for E2E testing
func setupE2EEVM(t *testing.T) (*EVM, *StateDB, func()) {
	tmpDir := t.TempDir()
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	stateDB := NewStateDB(store)

	ctx := &Context{
		Origin:      core.Address{},
		GasPrice:    big.NewInt(1),
		Coinbase:    core.Address{},
		GasLimit:    DefaultGasLimit,
		BlockNumber: big.NewInt(1),
		Time:        big.NewInt(1000),
		Difficulty:  big.NewInt(1),
		ChainID:     big.NewInt(1),
	}

	evm := NewEVM(ctx, stateDB)

	cleanup := func() {
		store.Close()
	}

	return evm, stateDB, cleanup
}

// encodeConstructorArgs encodes constructor arguments for SimpleERC20
// constructor(string _name, string _symbol, uint256 _initialSupply)
func encodeConstructorArgs(name, symbol string, initialSupply *big.Int) []byte {
	// ABI encoding for constructor(string, string, uint256)
	// Each dynamic type (string) has:
	// - 32 bytes: offset to data
	// - At the data location: 32 bytes length + padded string data

	// Offsets: name at 0x60 (96), symbol at variable, initialSupply inline
	// Structure:
	// [0x00-0x1f]: offset to name string (0x60 = 96)
	// [0x20-0x3f]: offset to symbol string
	// [0x40-0x5f]: initialSupply (uint256)
	// [0x60+]: name string data (length + data)
	// [variable]: symbol string data (length + data)

	result := make([]byte, 0)

	// Calculate offsets
	nameOffset := big.NewInt(96) // 0x60 - after the 3 params (3 * 32 = 96)
	nameLen := len(name)
	namePaddedLen := ((nameLen + 31) / 32) * 32 // Pad to 32 bytes
	symbolOffset := big.NewInt(int64(96 + 32 + namePaddedLen))

	// Param 1: offset to name
	result = append(result, padLeft(nameOffset.Bytes(), 32)...)
	// Param 2: offset to symbol
	result = append(result, padLeft(symbolOffset.Bytes(), 32)...)
	// Param 3: initialSupply
	result = append(result, padLeft(initialSupply.Bytes(), 32)...)

	// Name string data
	result = append(result, padLeft(big.NewInt(int64(nameLen)).Bytes(), 32)...)
	result = append(result, padRight([]byte(name), namePaddedLen)...)

	// Symbol string data
	symbolLen := len(symbol)
	symbolPaddedLen := ((symbolLen + 31) / 32) * 32
	result = append(result, padLeft(big.NewInt(int64(symbolLen)).Bytes(), 32)...)
	result = append(result, padRight([]byte(symbol), symbolPaddedLen)...)

	return result
}

// padLeft pads a byte slice to the left with zeros
func padLeft(b []byte, size int) []byte {
	if len(b) >= size {
		return b[len(b)-size:]
	}
	result := make([]byte, size)
	copy(result[size-len(b):], b)
	return result
}

// padRight pads a byte slice to the right with zeros
func padRight(b []byte, size int) []byte {
	if len(b) >= size {
		return b[:size]
	}
	result := make([]byte, size)
	copy(result, b)
	return result
}

// encodeTransferCall encodes transfer(address,uint256) call data
func encodeTransferCall(to core.Address, amount *big.Int) []byte {
	selector, _ := hex.DecodeString(selectorTransfer)
	result := make([]byte, 4+64) // selector + 2 params
	copy(result[0:4], selector)
	copy(result[4+12:4+32], to[:])                    // address padded to 32 bytes
	copy(result[4+32:4+64], padLeft(amount.Bytes(), 32)) // uint256
	return result
}

// encodeBalanceOfCall encodes balanceOf(address) call data
func encodeBalanceOfCall(addr core.Address) []byte {
	selector, _ := hex.DecodeString(selectorBalanceOf)
	result := make([]byte, 4+32) // selector + address
	copy(result[0:4], selector)
	copy(result[4+12:4+32], addr[:]) // address padded to 32 bytes
	return result
}

// encodeTotalSupplyCall encodes totalSupply() call data
func encodeTotalSupplyCall() []byte {
	selector, _ := hex.DecodeString(selectorTotalSupply)
	return selector
}

// TestE2E_ERC20_DeployAndTransfer tests full ERC20 lifecycle
func TestE2E_ERC20_DeployAndTransfer(t *testing.T) {
	evm, stateDB, cleanup := setupE2EEVM(t)
	defer cleanup()

	// Define addresses
	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14}
	alice := core.Address{0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA}
	bob := core.Address{0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB, 0xBB}

	// Give deployer some ETH for deployment
	stateDB.SetBalance(deployer, big.NewInt(1e18))

	// ========================================
	// STEP 1: Deploy ERC20 contract
	// ========================================
	t.Log("Step 1: Deploying ERC20 contract...")

	bytecode, err := hex.DecodeString(simpleERC20Bytecode)
	if err != nil {
		t.Fatalf("Failed to decode bytecode: %v", err)
	}

	// Encode constructor arguments: name="TestToken", symbol="TT", initialSupply=1000000
	initialSupply := big.NewInt(1000000)
	constructorArgs := encodeConstructorArgs("TestToken", "TT", initialSupply)

	// Init code = bytecode + constructor args
	initCode := append(bytecode, constructorArgs...)

	// Calculate contract address first
	nonce := stateDB.GetNonce(deployer)
	contractAddr := createAddress(deployer, nonce)
	stateDB.SetNonce(deployer, nonce+1)

	t.Logf("Contract will be deployed at: %x", contractAddr)

	// Deploy contract using CREATE simulation
	// CallerAddress = deployer (msg.sender in constructor)
	// Address = contractAddr (where storage will be written)
	deployContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr, // Init code runs at the new contract address
		Value:         big.NewInt(0),
		Input:         []byte{},
		Code:          initCode,
		Gas:           5000000,
	}

	// Execute init code
	result := evm.Execute(deployContract)
	if result.Err != nil {
		t.Fatalf("Deployment failed: %v", result.Err)
	}

	// Store the runtime code at contract address
	stateDB.SetCode(contractAddr, result.ReturnData)

	t.Logf("Contract deployed! Runtime code size: %d bytes", len(result.ReturnData))
	t.Logf("Deployment gas used: %d", result.GasUsed)

	// ========================================
	// STEP 2: Verify totalSupply
	// ========================================
	t.Log("Step 2: Verifying totalSupply...")

	totalSupplyCall := encodeTotalSupplyCall()
	callContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         totalSupplyCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult := evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("totalSupply() call failed: %v", callResult.Err)
	}

	// totalSupply should be initialSupply * 10^18
	expectedTotalSupply := new(big.Int).Mul(initialSupply, new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))
	actualTotalSupply := new(big.Int).SetBytes(callResult.ReturnData)

	t.Logf("Expected totalSupply: %s", expectedTotalSupply.String())
	t.Logf("Actual totalSupply:   %s", actualTotalSupply.String())

	if actualTotalSupply.Cmp(expectedTotalSupply) != 0 {
		t.Errorf("totalSupply mismatch: expected %s, got %s", expectedTotalSupply.String(), actualTotalSupply.String())
	}

	// ========================================
	// STEP 3: Check deployer balance
	// ========================================
	t.Log("Step 3: Checking deployer balance...")

	balanceOfCall := encodeBalanceOfCall(deployer)
	callContract = &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         balanceOfCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("balanceOf(deployer) call failed: %v", callResult.Err)
	}

	deployerBalance := new(big.Int).SetBytes(callResult.ReturnData)
	t.Logf("Deployer balance: %s", deployerBalance.String())

	if deployerBalance.Cmp(expectedTotalSupply) != 0 {
		t.Errorf("Deployer should have all tokens: expected %s, got %s", expectedTotalSupply.String(), deployerBalance.String())
	}

	// ========================================
	// STEP 4: Transfer tokens to Alice
	// ========================================
	t.Log("Step 4: Transferring 100 tokens to Alice...")

	// Transfer 100 * 10^18 tokens
	transferAmount := new(big.Int).Mul(big.NewInt(100), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))
	transferCall := encodeTransferCall(alice, transferAmount)

	callContract = &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         transferCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("transfer(alice, 100) call failed: %v", callResult.Err)
	}
	if callResult.Reverted {
		t.Fatalf("transfer(alice, 100) was reverted")
	}

	// Check return value (should be true = 1)
	returnValue := new(big.Int).SetBytes(callResult.ReturnData)
	if returnValue.Cmp(big.NewInt(1)) != 0 {
		t.Errorf("transfer() should return true (1), got %s", returnValue.String())
	}

	t.Logf("Transfer to Alice successful! Gas used: %d", callResult.GasUsed)

	// ========================================
	// STEP 5: Verify Alice's balance
	// ========================================
	t.Log("Step 5: Verifying Alice's balance...")

	balanceOfCall = encodeBalanceOfCall(alice)
	callContract = &Contract{
		CallerAddress: alice,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         balanceOfCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("balanceOf(alice) call failed: %v", callResult.Err)
	}

	aliceBalance := new(big.Int).SetBytes(callResult.ReturnData)
	t.Logf("Alice balance: %s", aliceBalance.String())

	if aliceBalance.Cmp(transferAmount) != 0 {
		t.Errorf("Alice balance mismatch: expected %s, got %s", transferAmount.String(), aliceBalance.String())
	}

	// ========================================
	// STEP 6: Verify deployer's new balance
	// ========================================
	t.Log("Step 6: Verifying deployer's new balance...")

	balanceOfCall = encodeBalanceOfCall(deployer)
	callContract = &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         balanceOfCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("balanceOf(deployer) call failed: %v", callResult.Err)
	}

	newDeployerBalance := new(big.Int).SetBytes(callResult.ReturnData)
	expectedDeployerBalance := new(big.Int).Sub(expectedTotalSupply, transferAmount)
	t.Logf("Deployer new balance: %s", newDeployerBalance.String())

	if newDeployerBalance.Cmp(expectedDeployerBalance) != 0 {
		t.Errorf("Deployer balance mismatch: expected %s, got %s", expectedDeployerBalance.String(), newDeployerBalance.String())
	}

	// ========================================
	// STEP 7: Alice transfers to Bob
	// ========================================
	t.Log("Step 7: Alice transfers 50 tokens to Bob...")

	transferAmount2 := new(big.Int).Mul(big.NewInt(50), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))
	transferCall = encodeTransferCall(bob, transferAmount2)

	callContract = &Contract{
		CallerAddress: alice, // Alice is the sender
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         transferCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("Alice's transfer(bob, 50) call failed: %v", callResult.Err)
	}
	if callResult.Reverted {
		t.Fatalf("Alice's transfer(bob, 50) was reverted")
	}

	t.Logf("Transfer from Alice to Bob successful! Gas used: %d", callResult.GasUsed)

	// ========================================
	// STEP 8: Verify all final balances
	// ========================================
	t.Log("Step 8: Verifying all final balances...")

	// Check Alice's final balance (100 - 50 = 50 tokens)
	balanceOfCall = encodeBalanceOfCall(alice)
	callContract = &Contract{
		CallerAddress: alice,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         balanceOfCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("balanceOf(alice) call failed: %v", callResult.Err)
	}

	finalAliceBalance := new(big.Int).SetBytes(callResult.ReturnData)
	expectedAliceFinal := new(big.Int).Sub(transferAmount, transferAmount2)
	t.Logf("Alice final balance: %s (expected: %s)", finalAliceBalance.String(), expectedAliceFinal.String())

	if finalAliceBalance.Cmp(expectedAliceFinal) != 0 {
		t.Errorf("Alice final balance mismatch: expected %s, got %s", expectedAliceFinal.String(), finalAliceBalance.String())
	}

	// Check Bob's final balance (50 tokens)
	balanceOfCall = encodeBalanceOfCall(bob)
	callContract = &Contract{
		CallerAddress: bob,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         balanceOfCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if callResult.Err != nil {
		t.Fatalf("balanceOf(bob) call failed: %v", callResult.Err)
	}

	bobBalance := new(big.Int).SetBytes(callResult.ReturnData)
	t.Logf("Bob final balance: %s (expected: %s)", bobBalance.String(), transferAmount2.String())

	if bobBalance.Cmp(transferAmount2) != 0 {
		t.Errorf("Bob balance mismatch: expected %s, got %s", transferAmount2.String(), bobBalance.String())
	}

	// ========================================
	// STEP 9: Test insufficient balance revert
	// ========================================
	t.Log("Step 9: Testing insufficient balance revert...")

	// Try to transfer more than Bob has
	hugeAmount := new(big.Int).Mul(big.NewInt(1000), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))
	transferCall = encodeTransferCall(alice, hugeAmount)

	callContract = &Contract{
		CallerAddress: bob,
		Address:       contractAddr,
		Value:         big.NewInt(0),
		Input:         transferCall,
		Code:          result.ReturnData,
		Gas:           100000,
	}

	callResult = evm.Execute(callContract)
	if !callResult.Reverted && callResult.Err == nil {
		t.Error("Transfer with insufficient balance should have reverted")
	} else {
		t.Log("Transfer with insufficient balance correctly reverted!")
	}

	// ========================================
	// SUMMARY
	// ========================================
	t.Log("========================================")
	t.Log("E2E TEST SUMMARY - ALL CHECKS PASSED!")
	t.Log("========================================")
	t.Logf("Contract deployed at: %x", contractAddr)
	t.Logf("Total Supply: %s", expectedTotalSupply.String())
	t.Logf("Deployer final balance: %s", newDeployerBalance.String())
	t.Logf("Alice final balance: %s", finalAliceBalance.String())
	t.Logf("Bob final balance: %s", bobBalance.String())
}
