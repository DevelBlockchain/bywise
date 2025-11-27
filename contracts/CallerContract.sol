// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Interface para o contrato chamado
interface ICallee {
    function getValue() external view returns (uint256);
    function setValue(uint256 _value) external;
    function add(uint256 a, uint256 b) external pure returns (uint256);
}

// Contrato que chama outro contrato
contract CallerContract {
    address public owner;
    address public calleeAddress;
    uint256 public lastResult;

    event CallMade(address indexed callee, uint256 result);
    event CalleeSet(address indexed newCallee);

    constructor() {
        owner = msg.sender;
    }

    // Define o endereço do contrato a ser chamado
    function setCallee(address _calleeAddress) external {
        require(_calleeAddress != address(0), "Invalid address");
        calleeAddress = _calleeAddress;
        emit CalleeSet(_calleeAddress);
    }

    // Chama getValue() no contrato callee
    function callGetValue() external returns (uint256) {
        require(calleeAddress != address(0), "Callee not set");
        ICallee callee = ICallee(calleeAddress);
        uint256 value = callee.getValue();
        lastResult = value;
        emit CallMade(calleeAddress, value);
        return value;
    }

    // Chama setValue() no contrato callee
    function callSetValue(uint256 _value) external {
        require(calleeAddress != address(0), "Callee not set");
        ICallee callee = ICallee(calleeAddress);
        callee.setValue(_value);
    }

    // Chama add() no contrato callee
    function callAdd(uint256 a, uint256 b) external returns (uint256) {
        require(calleeAddress != address(0), "Callee not set");
        ICallee callee = ICallee(calleeAddress);
        uint256 result = callee.add(a, b);
        lastResult = result;
        emit CallMade(calleeAddress, result);
        return result;
    }

    // Chama múltiplas funções em sequência
    function callMultiple(uint256 a, uint256 b, uint256 newValue) external returns (uint256 sum, uint256 finalValue) {
        require(calleeAddress != address(0), "Callee not set");
        ICallee callee = ICallee(calleeAddress);

        // Chama add
        sum = callee.add(a, b);

        // Seta um novo valor
        callee.setValue(newValue);

        // Lê o valor
        finalValue = callee.getValue();

        lastResult = finalValue;
        return (sum, finalValue);
    }
}
