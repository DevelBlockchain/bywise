// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Contrato que será chamado por outro contrato
contract CalleeContract {
    uint256 private value;
    address public caller;
    uint256 public callCount;

    event ValueSet(uint256 oldValue, uint256 newValue, address indexed setter);
    event ValueRead(uint256 value, address indexed reader);

    constructor(uint256 initialValue) {
        value = initialValue;
        callCount = 0;
    }

    // Retorna o valor armazenado
    function getValue() external view returns (uint256) {
        return value;
    }

    // Define um novo valor
    function setValue(uint256 _value) external {
        uint256 oldValue = value;
        value = _value;
        caller = msg.sender;
        callCount++;
        emit ValueSet(oldValue, _value, msg.sender);
    }

    // Função pura que soma dois números
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        return a + b;
    }

    // Função pura que multiplica dois números
    function multiply(uint256 a, uint256 b) external pure returns (uint256) {
        return a * b;
    }

    // Retorna informações do estado
    function getInfo() external view returns (uint256 currentValue, address lastCaller, uint256 totalCalls) {
        return (value, caller, callCount);
    }
}
