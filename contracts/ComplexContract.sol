// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Base contract for inheritance testing
abstract contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// Interface for testing
interface ICounter {
    function getCount() external view returns (uint256);
}

// Main complex contract
contract ComplexContract is Ownable, ICounter {
    // Struct definition
    struct User {
        uint256 id;
        string name;
        uint256 balance;
        bool active;
    }

    // State variables
    uint256 public counter;
    uint256[] public numbers;
    mapping(address => User) public users;
    mapping(address => mapping(uint256 => bool)) public userPermissions;

    // Events
    event UserCreated(address indexed userAddr, uint256 id, string name);
    event NumberAdded(uint256 indexed index, uint256 value);
    event CounterIncremented(uint256 oldValue, uint256 newValue);
    event LoopCompleted(uint256 iterations, uint256 result);

    // Constructor
    constructor(uint256 initialCounter) {
        owner = msg.sender;
        counter = initialCounter;
    }

    // Implement interface
    function getCount() external view override returns (uint256) {
        return counter;
    }

    // Function with loops
    function sumRange(uint256 start, uint256 end) public pure returns (uint256) {
        require(end >= start, "Invalid range");
        uint256 sum = 0;
        for (uint256 i = start; i <= end; i++) {
            sum += i;
        }
        return sum;
    }

    // Function with while loop
    function factorial(uint256 n) public pure returns (uint256) {
        require(n <= 20, "Too large"); // Prevent overflow
        if (n <= 1) return 1;
        uint256 result = 1;
        uint256 i = 2;
        while (i <= n) {
            result *= i;
            i++;
        }
        return result;
    }

    // Array operations
    function addNumber(uint256 num) public {
        numbers.push(num);
        emit NumberAdded(numbers.length - 1, num);
    }

    function getNumbersLength() public view returns (uint256) {
        return numbers.length;
    }

    function sumAllNumbers() public view returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < numbers.length; i++) {
            sum += numbers[i];
        }
        return sum;
    }

    // Struct operations
    function createUser(address userAddr, uint256 id, string memory name, uint256 initialBalance) public onlyOwner {
        users[userAddr] = User({
            id: id,
            name: name,
            balance: initialBalance,
            active: true
        });
        emit UserCreated(userAddr, id, name);
    }

    function getUserBalance(address userAddr) public view returns (uint256) {
        return users[userAddr].balance;
    }

    function isUserActive(address userAddr) public view returns (bool) {
        return users[userAddr].active;
    }

    function deactivateUser(address userAddr) public onlyOwner {
        users[userAddr].active = false;
    }

    // Nested mapping operations
    function setPermission(address userAddr, uint256 permissionId, bool granted) public onlyOwner {
        userPermissions[userAddr][permissionId] = granted;
    }

    function hasPermission(address userAddr, uint256 permissionId) public view returns (bool) {
        return userPermissions[userAddr][permissionId];
    }

    // Bitwise operations
    function bitwiseOps(uint256 a, uint256 b) public pure returns (uint256 andResult, uint256 orResult, uint256 xorResult, uint256 notA) {
        andResult = a & b;
        orResult = a | b;
        xorResult = a ^ b;
        notA = ~a;
    }

    // Shift operations
    function shiftOps(uint256 value, uint256 bits) public pure returns (uint256 leftShift, uint256 rightShift) {
        leftShift = value << bits;
        rightShift = value >> bits;
    }

    // Comparison operations
    function compare(int256 a, int256 b) public pure returns (bool lt, bool gt, bool eq, bool slt, bool sgt) {
        lt = a < b;
        gt = a > b;
        eq = a == b;
        // Signed comparisons (using int256)
        slt = a < b;
        sgt = a > b;
    }

    // Modular arithmetic
    function modArith(uint256 a, uint256 b, uint256 m) public pure returns (uint256 addMod, uint256 mulMod) {
        require(m > 0, "Modulus must be > 0");
        addMod = addmod(a, b, m);
        mulMod = mulmod(a, b, m);
    }

    // Exponentiation
    function power(uint256 base, uint256 exp) public pure returns (uint256) {
        if (exp == 0) return 1;
        uint256 result = 1;
        for (uint256 i = 0; i < exp; i++) {
            result *= base;
        }
        return result;
    }

    // Increment counter (tests state modification)
    function incrementCounter() public returns (uint256) {
        uint256 oldValue = counter;
        counter++;
        emit CounterIncremented(oldValue, counter);
        return counter;
    }

    // Multiple return values
    function getStats() public view returns (uint256 count, uint256 numCount, address ownerAddr) {
        count = counter;
        numCount = numbers.length;
        ownerAddr = owner;
    }

    // Hash operations
    function hashData(bytes memory data) public pure returns (bytes32) {
        return keccak256(data);
    }

    // Address operations
    function getAddressInfo(address addr) public view returns (uint256 balance, uint256 codeSize) {
        balance = addr.balance;
        assembly {
            codeSize := extcodesize(addr)
        }
    }

    // Memory operations with different sizes
    function memoryTest(uint256 value) public pure returns (uint256) {
        uint256[] memory tempArray = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            tempArray[i] = value + i;
        }
        uint256 sum = 0;
        for (uint256 i = 0; i < 10; i++) {
            sum += tempArray[i];
        }
        return sum;
    }

    // Conditional logic
    function conditionalTest(uint256 value) public pure returns (string memory) {
        if (value < 10) {
            return "small";
        } else if (value < 100) {
            return "medium";
        } else {
            return "large";
        }
    }

    // Ternary operator
    function max(uint256 a, uint256 b) public pure returns (uint256) {
        return a > b ? a : b;
    }

    function min(uint256 a, uint256 b) public pure returns (uint256) {
        return a < b ? a : b;
    }

    // Sign extension test
    function signExtendTest(int8 value) public pure returns (int256) {
        return int256(value);
    }

    // Byte operations
    function byteAt(bytes32 data, uint256 index) public pure returns (bytes1) {
        require(index < 32, "Index out of bounds");
        return data[index];
    }

    // Block info
    function getBlockInfo() public view returns (
        uint256 blockNum,
        uint256 blockTime,
        uint256 blockGasLimit,
        address coinbaseAddr
    ) {
        blockNum = block.number;
        blockTime = block.timestamp;
        blockGasLimit = block.gaslimit;
        coinbaseAddr = block.coinbase;
    }

    // Transaction info
    function getTxInfo() public view returns (
        address txOrigin,
        uint256 gasPrice
    ) {
        txOrigin = tx.origin;
        gasPrice = tx.gasprice;
    }

    // Receive ether
    receive() external payable {}

    // Fallback
    fallback() external payable {}

    // Get contract balance
    function getContractBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
