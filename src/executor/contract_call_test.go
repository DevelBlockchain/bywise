package executor

import (
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/bywise/go-bywise/src/core"
	"github.com/bywise/go-bywise/src/storage"
)

// CalleeContract bytecode - Simple storage contract
// Compiled from CalleeContract.sol with solcjs --bin --optimize
// Constructor takes uint256 initialValue
const calleeContractBytecode = "6080604052348015600e575f5ffd5b506040516102d83803806102d8833981016040819052602b916036565b5f908155600255604c565b5f602082840312156045575f5ffd5b5051919050565b61027f806100595f395ff3fe608060405234801561000f575f5ffd5b506004361061007a575f3560e01c8063552410771161005857806355241077146100b45780635a9b0b89146100c9578063771602f7146100f4578063fc9c8d3914610107575f5ffd5b8063165c4a161461007e57806320965255146100a45780634b28f9a2146100ab575b5f5ffd5b61009161008c3660046101bc565b610132565b6040519081526020015b60405180910390f35b5f54610091565b61009160025481565b6100c76100c23660046101dc565b610146565b005b5f54600154600254604080519384526001600160a01b0390921660208401529082015260600161009b565b6100916101023660046101bc565b6101b1565b60015461011a906001600160a01b031681565b6040516001600160a01b03909116815260200161009b565b5f61013d8284610207565b90505b92915050565b5f8054828255600180546001600160a01b0319163317905560028054919261016d8361021e565b9091555050604080518281526020810184905233917f9518c152b4ba98316dbad99e4d836e150d04e478e759eac263a4e8676b358bb7910160405180910390a25050565b5f61013d8284610236565b5f5f604083850312156101cd575f5ffd5b50508035926020909101359150565b5f602082840312156101ec575f5ffd5b5035919050565b634e487b7160e01b5f52601160045260245ffd5b8082028115828204841417610140576101406101f3565b5f6001820161022f5761022f6101f3565b5060010190565b80820180821115610140576101406101f356fea2646970667358221220edcc028fd25bf303bd46f391db689be4d0a395cf4491409093c0ee566ca8903664736f6c634300081e0033"

// CallerContract bytecode - Contract that calls another contract
// Compiled from CallerContract.sol with solcjs --bin --optimize
// No constructor arguments
const callerContractBytecode = "6080604052348015600e575f5ffd5b505f80546001600160a01b031916331790556106b08061002d5f395ff3fe608060405234801561000f575f5ffd5b5060043610610085575f3560e01c80639f8be819116100585780639f8be81914610108578063abcc11d814610129578063ef5b75bd14610132578063fa47b8a51461013a575f5ffd5b80634959be7314610089578063643dfbf9146100b657806383a4354b146100e15780638da5cb5b146100f6575b5f5ffd5b61009c6100973660046105ae565b61014d565b604080519283526020830191909152015b60405180910390f35b6001546100c9906001600160a01b031681565b6040516001600160a01b0390911681526020016100ad565b6100f46100ef3660046105d7565b6102be565b005b5f546100c9906001600160a01b031681565b61011b610116366004610604565b61034f565b6040519081526020016100ad565b61011b60025481565b61011b61043f565b6100f4610148366004610624565b610527565b6001545f9081906001600160a01b03166101825760405162461bcd60e51b81526004016101799061063b565b60405180910390fd5b60015460405163771602f760e01b815260048101879052602481018690526001600160a01b0390911690819063771602f790604401602060405180830381865afa1580156101d2573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906101f69190610663565b604051635524107760e01b8152600481018690529093506001600160a01b038216906355241077906024015f604051808303815f87803b158015610238575f5ffd5b505af115801561024a573d5f5f3e3d5ffd5b50505050806001600160a01b031663209652556040518163ffffffff1660e01b8152600401602060405180830381865afa15801561028a573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906102ae9190610663565b6002819055915050935093915050565b6001600160a01b0381166103065760405162461bcd60e51b815260206004820152600f60248201526e496e76616c6964206164647265737360881b6044820152606401610179565b600180546001600160a01b0319166001600160a01b0383169081179091556040517fb6e69a2464c9d6f06843740e56663dd438e93d1b626092a0236aa338134210ba905f90a250565b6001545f906001600160a01b03166103795760405162461bcd60e51b81526004016101799061063b565b60015460405163771602f760e01b815260048101859052602481018490526001600160a01b03909116905f90829063771602f790604401602060405180830381865afa1580156103cb573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906103ef9190610663565b60028190556001546040518281529192506001600160a01b0316907f0ef30d9d387998289b691e2847ce85ecb0dcf656ec402134c2c5873f3326e6e49060200160405180910390a2949350505050565b6001545f906001600160a01b03166104695760405162461bcd60e51b81526004016101799061063b565b60015460408051632096525560e01b815290516001600160a01b03909216915f9183916320965255916004808201926020929091908290030181865afa1580156104b5573d5f5f3e3d5ffd5b505050506040513d601f19601f820116820180604052508101906104d99190610663565b60028190556001546040518281529192506001600160a01b0316907f0ef30d9d387998289b691e2847ce85ecb0dcf656ec402134c2c5873f3326e6e49060200160405180910390a292915050565b6001546001600160a01b031661054f5760405162461bcd60e51b81526004016101799061063b565b600154604051635524107760e01b8152600481018390526001600160a01b039091169081906355241077906024015f604051808303815f87803b158015610594575f5ffd5b505af11580156105a6573d5f5f3e3d5ffd5b505050505050565b5f5f5f606084860312156105c0575f5ffd5b505081359360208301359350604090920135919050565b5f602082840312156105e7575f5ffd5b81356001600160a01b03811681146105fd575f5ffd5b9392505050565b5f5f60408385031215610615575f5ffd5b50508035926020909101359150565b5f60208284031215610634575f5ffd5b5035919050565b6020808252600e908201526d10d85b1b1959481b9bdd081cd95d60921b604082015260600190565b5f60208284031215610673575f5ffd5b505191905056fea264697066735822122060b3e8df737a3299d33d512bee1c27b8f22592aa397e05b37f3563e5a44bc95c64736f6c634300081e0033"

// Function selectors (primeiros 4 bytes do keccak256 da assinatura da função)
const (
	// CalleeContract
	selectorCalleeGetValue = "20965255" // getValue()
	selectorCalleeSetValue = "55241077" // setValue(uint256)
	selectorCalleeAdd      = "771602f7" // add(uint256,uint256)
	selectorCalleeMultiply = "165c4a16" // multiply(uint256,uint256)
	selectorCalleeGetInfo  = "5a9b0b89" // getInfo()

	// CallerContract
	selectorCallerSetCallee    = "83a4354b" // setCallee(address)
	selectorCallerCallGetValue = "ef5b75bd" // callGetValue()
	selectorCallerCallSetValue = "fa47b8a5" // callSetValue(uint256)
	selectorCallerCallAdd      = "9f8be819" // callAdd(uint256,uint256)
	selectorCallerCallMultiple = "4959be73" // callMultiple(uint256,uint256,uint256)
	selectorCallerLastResult   = "abcc11d8" // lastResult()
)

// setupContractCallEVM creates a new EVM for contract call testing
func setupContractCallEVM(t *testing.T) (*EVM, *StateDB, func()) {
	tmpDir := t.TempDir()
	store, err := storage.NewStorage(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create storage: %v", err)
	}

	stateDB := NewStateDB(store)

	ctx := &Context{
		Origin:      core.Address{},
		GasPrice:    big.NewInt(1000000000),
		Coinbase:    core.Address{0xFE, 0xED},
		GasLimit:    30000000,
		BlockNumber: big.NewInt(12345),
		Time:        big.NewInt(1700000000),
		Difficulty:  big.NewInt(1),
		ChainID:     big.NewInt(1),
	}

	evm := NewEVM(ctx, stateDB)

	cleanup := func() {
		store.Close()
	}

	return evm, stateDB, cleanup
}

// Helper to deploy a contract
func deployContract(t *testing.T, evm *EVM, stateDB *StateDB, deployer core.Address, bytecode string, constructorArgs ...[]byte) core.Address {
	// Decode bytecode
	initCode, err := hex.DecodeString(bytecode)
	if err != nil {
		t.Fatalf("Failed to decode bytecode: %v", err)
	}

	// Append constructor args
	for _, arg := range constructorArgs {
		initCode = append(initCode, arg...)
	}

	// Calculate contract address
	nonce := stateDB.GetNonce(deployer)
	contractAddr := createAddress(deployer, nonce)
	stateDB.SetNonce(deployer, nonce+1)

	// Deploy
	deployContract := &Contract{
		CallerAddress: deployer,
		Address:       contractAddr,
		Code:          initCode,
		Input:         []byte{},
		Value:         big.NewInt(0),
		Gas:           50000000,
	}

	result := evm.Execute(deployContract)
	if result.Err != nil {
		t.Fatalf("Failed to deploy contract: %v", result.Err)
	}
	if result.Reverted {
		t.Fatalf("Contract deployment reverted: %s", string(result.ReturnData))
	}

	// Store deployed code
	stateDB.SetCode(contractAddr, result.ReturnData)

	t.Logf("Contract deployed at: 0x%x (code size: %d bytes)", contractAddr, len(result.ReturnData))

	return contractAddr
}

// Helper to call a contract
func callContract(t *testing.T, evm *EVM, caller core.Address, contractAddr core.Address, code []byte, selector string, args ...[]byte) ([]byte, error) {
	calldata, err := hex.DecodeString(selector)
	if err != nil {
		return nil, err
	}

	for _, arg := range args {
		calldata = append(calldata, arg...)
	}

	contract := &Contract{
		CallerAddress: caller,
		Address:       contractAddr,
		Code:          code,
		Input:         calldata,
		Value:         big.NewInt(0),
		Gas:           5000000,
	}

	result := evm.Execute(contract)
	if result.Err != nil {
		return nil, result.Err
	}
	if result.Reverted {
		return nil, ErrExecutionReverted
	}

	return result.ReturnData, nil
}

func TestE2E_ContractCallsContract_BasicFlow(t *testing.T) {
	t.Log("\n========== E2E TEST: CONTRACT CALLS CONTRACT - BASIC FLOW ==========")

	evm, stateDB, cleanup := setupContractCallEVM(t)
	defer cleanup()

	// Define addresses
	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a}

	// Give deployer some ETH
	stateDB.SetBalance(deployer, big.NewInt(1000000000000000000))

	// ==== Step 1: Deploy CalleeContract with initial value = 42 ====
	t.Log("\n--- Step 1: Deploy CalleeContract ---")
	calleeInitValue := make([]byte, 32)
	big.NewInt(42).FillBytes(calleeInitValue)

	calleeAddr := deployContract(t, evm, stateDB, deployer, calleeContractBytecode, calleeInitValue)
	calleeCode := stateDB.GetCode(calleeAddr)

	// ==== Step 2: Deploy CallerContract ====
	t.Log("\n--- Step 2: Deploy CallerContract ---")
	callerAddr := deployContract(t, evm, stateDB, deployer, callerContractBytecode)
	callerCode := stateDB.GetCode(callerAddr)

	// ==== Step 3: Set callee address in caller contract ====
	t.Log("\n--- Step 3: Set Callee Address ---")
	calleeAddrArg := make([]byte, 32)
	copy(calleeAddrArg[12:], calleeAddr[:]) // address is padded to 32 bytes

	_, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerSetCallee, calleeAddrArg)
	if err != nil {
		t.Fatalf("Failed to set callee address: %v", err)
	}
	t.Logf("Callee address set to: 0x%x", calleeAddr)

	// ==== Step 4: Call getValue() through caller contract ====
	t.Log("\n--- Step 4: Call getValue() through Caller ---")
	getValueResult, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerCallGetValue)
	if err != nil {
		t.Fatalf("Failed to call getValue through caller: %v", err)
	}

	value := new(big.Int).SetBytes(getValueResult)
	t.Logf("Value retrieved through caller: %s (expected: 42)", value.String())

	if value.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("getValue mismatch: got %s, want 42", value.String())
	}

	// ==== Step 5: Call setValue(100) through caller contract ====
	t.Log("\n--- Step 5: Call setValue(100) through Caller ---")
	newValue := make([]byte, 32)
	big.NewInt(100).FillBytes(newValue)

	_, err = callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerCallSetValue, newValue)
	if err != nil {
		t.Fatalf("Failed to call setValue through caller: %v", err)
	}
	t.Log("setValue(100) called successfully")

	// ==== Step 6: Verify value was updated ====
	t.Log("\n--- Step 6: Verify Value Update ---")
	getValueResult2, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerCallGetValue)
	if err != nil {
		t.Fatalf("Failed to get updated value: %v", err)
	}

	updatedValue := new(big.Int).SetBytes(getValueResult2)
	t.Logf("Updated value: %s (expected: 100)", updatedValue.String())

	if updatedValue.Cmp(big.NewInt(100)) != 0 {
		t.Errorf("Updated value mismatch: got %s, want 100", updatedValue.String())
	}

	// ==== Step 7: Call add(25, 17) through caller contract ====
	t.Log("\n--- Step 7: Call add(25, 17) through Caller ---")
	arg1 := make([]byte, 32)
	arg2 := make([]byte, 32)
	big.NewInt(25).FillBytes(arg1)
	big.NewInt(17).FillBytes(arg2)

	addResult, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerCallAdd, arg1, arg2)
	if err != nil {
		t.Fatalf("Failed to call add through caller: %v", err)
	}

	sum := new(big.Int).SetBytes(addResult)
	t.Logf("add(25, 17) = %s (expected: 42)", sum.String())

	if sum.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("add result mismatch: got %s, want 42", sum.String())
	}

	// ==== Step 8: Direct call to callee to verify it works independently ====
	t.Log("\n--- Step 8: Direct Call to Callee (verify independence) ---")
	directGetValue, err := callContract(t, evm, deployer, calleeAddr, calleeCode, selectorCalleeGetValue)
	if err != nil {
		t.Fatalf("Failed to call callee directly: %v", err)
	}

	directValue := new(big.Int).SetBytes(directGetValue)
	t.Logf("Direct call getValue() = %s", directValue.String())

	if directValue.Cmp(big.NewInt(100)) != 0 {
		t.Errorf("Direct call mismatch: got %s, want 100", directValue.String())
	}

	t.Log("\n========== CONTRACT CALLS CONTRACT TEST PASSED! ==========")
}

func TestE2E_ContractCallsContract_MultipleOperations(t *testing.T) {
	t.Log("\n========== E2E TEST: CONTRACT CALLS CONTRACT - MULTIPLE OPERATIONS ==========")

	evm, stateDB, cleanup := setupContractCallEVM(t)
	defer cleanup()

	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a}

	stateDB.SetBalance(deployer, big.NewInt(1000000000000000000))

	// Deploy both contracts
	t.Log("\n--- Deploy Contracts ---")
	calleeInitValue := make([]byte, 32)
	big.NewInt(10).FillBytes(calleeInitValue)

	calleeAddr := deployContract(t, evm, stateDB, deployer, calleeContractBytecode, calleeInitValue)
	calleeCode := stateDB.GetCode(calleeAddr)

	callerAddr := deployContract(t, evm, stateDB, deployer, callerContractBytecode)
	callerCode := stateDB.GetCode(callerAddr)

	// Set callee address
	calleeAddrArg := make([]byte, 32)
	copy(calleeAddrArg[12:], calleeAddr[:])
	_, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerSetCallee, calleeAddrArg)
	if err != nil {
		t.Fatalf("Failed to set callee: %v", err)
	}

	// ==== Test: Call callMultiple(5, 8, 999) ====
	// This should: add(5,8)=13, setValue(999), getValue()=999
	t.Log("\n--- Test: callMultiple(5, 8, 999) ---")

	arg1 := make([]byte, 32)
	arg2 := make([]byte, 32)
	arg3 := make([]byte, 32)
	big.NewInt(5).FillBytes(arg1)
	big.NewInt(8).FillBytes(arg2)
	big.NewInt(999).FillBytes(arg3)

	multipleResult, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerCallMultiple, arg1, arg2, arg3)
	if err != nil {
		t.Fatalf("Failed to call callMultiple: %v", err)
	}

	// Result should be two uint256: sum (13) and finalValue (999)
	sumResult := new(big.Int).SetBytes(multipleResult[0:32])
	finalValue := new(big.Int).SetBytes(multipleResult[32:64])

	t.Logf("callMultiple results:")
	t.Logf("  sum = %s (expected: 13)", sumResult.String())
	t.Logf("  finalValue = %s (expected: 999)", finalValue.String())

	if sumResult.Cmp(big.NewInt(13)) != 0 {
		t.Errorf("sum mismatch: got %s, want 13", sumResult.String())
	}

	if finalValue.Cmp(big.NewInt(999)) != 0 {
		t.Errorf("finalValue mismatch: got %s, want 999", finalValue.String())
	}

	// ==== Verify state was persisted ====
	t.Log("\n--- Verify State Persistence ---")
	verifyValue, err := callContract(t, evm, deployer, calleeAddr, calleeCode, selectorCalleeGetValue)
	if err != nil {
		t.Fatalf("Failed to verify value: %v", err)
	}

	persistedValue := new(big.Int).SetBytes(verifyValue)
	t.Logf("Persisted value in callee: %s", persistedValue.String())

	if persistedValue.Cmp(big.NewInt(999)) != 0 {
		t.Errorf("Persisted value mismatch: got %s, want 999", persistedValue.String())
	}

	t.Log("\n========== MULTIPLE OPERATIONS TEST PASSED! ==========")
}

func TestE2E_ContractCallsContract_StateIsolation(t *testing.T) {
	t.Log("\n========== E2E TEST: CONTRACT CALLS CONTRACT - STATE ISOLATION ==========")

	evm, stateDB, cleanup := setupContractCallEVM(t)
	defer cleanup()

	deployer := core.Address{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
		0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a}

	stateDB.SetBalance(deployer, big.NewInt(1000000000000000000))

	// Deploy first callee
	t.Log("\n--- Deploy First Callee (value=100) ---")
	initValue1 := make([]byte, 32)
	big.NewInt(100).FillBytes(initValue1)
	callee1Addr := deployContract(t, evm, stateDB, deployer, calleeContractBytecode, initValue1)
	callee1Code := stateDB.GetCode(callee1Addr)

	// Deploy second callee
	t.Log("\n--- Deploy Second Callee (value=200) ---")
	initValue2 := make([]byte, 32)
	big.NewInt(200).FillBytes(initValue2)
	callee2Addr := deployContract(t, evm, stateDB, deployer, calleeContractBytecode, initValue2)
	_ = stateDB.GetCode(callee2Addr) // Get code for potential future use

	// Deploy caller
	t.Log("\n--- Deploy Caller ---")
	callerAddr := deployContract(t, evm, stateDB, deployer, callerContractBytecode)
	callerCode := stateDB.GetCode(callerAddr)

	// ==== Test switching between callees ====
	t.Log("\n--- Test: Point caller to first callee ---")
	callee1AddrArg := make([]byte, 32)
	copy(callee1AddrArg[12:], callee1Addr[:])
	_, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerSetCallee, callee1AddrArg)
	if err != nil {
		t.Fatalf("Failed to set callee1: %v", err)
	}

	value1, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerCallGetValue)
	if err != nil {
		t.Fatalf("Failed to get value from callee1: %v", err)
	}
	val1 := new(big.Int).SetBytes(value1)
	t.Logf("Value from callee1: %s (expected: 100)", val1.String())

	if val1.Cmp(big.NewInt(100)) != 0 {
		t.Errorf("callee1 value mismatch: got %s, want 100", val1.String())
	}

	// Switch to second callee
	t.Log("\n--- Test: Point caller to second callee ---")
	callee2AddrArg := make([]byte, 32)
	copy(callee2AddrArg[12:], callee2Addr[:])
	_, err = callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerSetCallee, callee2AddrArg)
	if err != nil {
		t.Fatalf("Failed to set callee2: %v", err)
	}

	value2, err := callContract(t, evm, deployer, callerAddr, callerCode, selectorCallerCallGetValue)
	if err != nil {
		t.Fatalf("Failed to get value from callee2: %v", err)
	}
	val2 := new(big.Int).SetBytes(value2)
	t.Logf("Value from callee2: %s (expected: 200)", val2.String())

	if val2.Cmp(big.NewInt(200)) != 0 {
		t.Errorf("callee2 value mismatch: got %s, want 200", val2.String())
	}

	// Verify first callee's state wasn't affected
	t.Log("\n--- Verify callee1 state unchanged ---")
	directValue1, err := callContract(t, evm, deployer, callee1Addr, callee1Code, selectorCalleeGetValue)
	if err != nil {
		t.Fatalf("Failed to verify callee1: %v", err)
	}
	directVal1 := new(big.Int).SetBytes(directValue1)
	t.Logf("Direct call to callee1: %s (expected: 100)", directVal1.String())

	if directVal1.Cmp(big.NewInt(100)) != 0 {
		t.Errorf("callee1 state was corrupted: got %s, want 100", directVal1.String())
	}

	t.Log("\n========== STATE ISOLATION TEST PASSED! ==========")
}
