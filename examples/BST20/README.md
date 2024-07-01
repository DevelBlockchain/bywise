# BST20 - Bywise Standard Token 20

This is a standard smart contract for creating tokens on the Bywise blockchain, inspired by the ERC20 standard. This contract allows for the creation, transfer, and management of tokens, along with additional Bywise-specific functionalities.

## Table of Contents

- [Installation](#installation)
- [Initial Setup](#initial-setup)
- [Available Functions](#available-functions)
  - [View Functions](#view-functions)
  - [Transaction Functions](#transaction-functions)
  - [Configuration Functions](#configuration-functions)
- [Private Functions](#private-functions)
- [Events](#events)
- [Usage Example](#usage-example)
- [License](#license)

## Installation

To use this contract, you will need `bywise-utils.js` and `bignumber.js`.

```bash
npm install bywise-utils bignumber.js
```

## Initial Setup

Define the initial parameters of the token:

```javascript
const TOKEN_NAME = "TBRL";
const TOKEN_SYMBOL = "TBRL";
const INITIAL_AMOUNT = '1000000000';
const URL = 'TBRL';
const ICON = 'bafkreiho4m5gfhd5nk3abnttsadk5qsa3fr27a5idfsws4uzo7ba6tffvm';
const DECIMALS = 18;
const ENABLE_MINT = true;
const FEES = [];
```

## Available Functions

### View Functions

- **name()**: Returns the name of the token.
- **symbol()**: Returns the symbol of the token.
- **url()**: Returns the URL associated with the token.
- **icon()**: Returns the icon associated with the token.
- **owner()**: Returns the owner of the contract.
- **totalSupply()**: Returns the total supply of tokens issued.
- **decimals()**: Returns the number of decimals of the token.
- **balanceOf(account)**: Returns the balance of the given address.
- **allowance(owner, spender)**: Returns the transfer allowance from the owner to the spender.
- **totalFee()**: Returns the total accumulated fees.
- **getFees(index)**: Returns the fee at the given index.
- **countFees()**: Returns the number of configured fees.
- **isAllowlist(address)**: Checks if the address is in the allowlist.

### Transaction Functions

- **mint(recipient, amount)**: Mints new tokens to the recipient.
- **transfer(recipient, amount)**: Transfers tokens from the sender to the recipient.
- **transferError(recipient, amount)**: Simulates a transfer with an error.
- **transferFrom(from, to, amount)**: Transfers tokens on behalf of another address.
- **transferMultisign(from, to, amount)**: Transfers tokens with multiple signatures.
- **approve(spender, amount)**: Approves an amount to be spent by the spender.

### Configuration Functions

- **setURL(url)**: Sets the URL associated with the token.
- **setIcon(icon)**: Sets the icon associated with the token.
- **changeOwner(newOwner)**: Transfers ownership of the contract to a new owner.
- **addFee(address, fee)**: Adds a new fee.
- **removeFee()**: Removes the last added fee.
- **setAllowlist(address, enable)**: Adds or removes an address from the allowlist.

## Private Functions

- **_isOwner()**: Checks if the sender is the owner of the contract.
- **_makeTransfer(from, to, amount)**: Executes a token transfer.
- **_transfer(from, to, amount)**: Transfers tokens from one address to another.
- **_mint(recipient, amount)**: Mints new tokens to the recipient.
- **_approve(spender, owner, amount)**: Approves an amount to be spent by the spender.
- **_decreaseAllowance(spender, owner, amount)**: Decreases the transfer allowance from the owner.
- **_isValidInteger(value)**: Validates if the value is a valid integer.
- **_isValidBoolean(value)**: Validates if the value is a valid boolean.
- **_isValidPercent(value)**: Validates if the value is a valid percentage.
- **_isValidAddress(value)**: Validates if the value is a valid address.

## Events

The contract emits events for various actions such as transfers, approvals, ownership changes, URL and icon settings, fee additions and removals, and allowlist changes.

- **Transfer**: Emitted on token transfers.
- **Approve**: Emitted on spending approvals.
- **New URL**: Emitted when setting a new URL.
- **New Icon**: Emitted when setting a new icon.
- **New Owner**: Emitted when changing the owner of the contract.
- **New Fee**: Emitted when adding a new fee.
- **Remove Fee**: Emitted when removing a fee.
- **Set Allowlist**: Emitted when changing the allowlist.

## Usage Example

Here is an example of how to deploy and interact with the BST20 contract:

```javascript
import BywiseUtils from 'bywise-utils.js';
import BigNumber from 'bignumber.js';

class BST20 {
  // ... (contract code here)
}

// Export the contract
BywiseUtils.exportContract(new BST20());
```

## License

This project is licensed under the [MIT License](LICENSE).
