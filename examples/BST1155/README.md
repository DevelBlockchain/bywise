# 🛠️ BST1155 - Bywise Standard Multi-Token (NFT & FT) 🛠️

Welcome to the BST1155 smart contract! 🚀 This contract is a Multi-Token standard on the Bywise blockchain, inspired by the ERC1155 standard. It allows you to create, manage, and transfer both fungible and non-fungible tokens within a single contract.

## 📋 Table of Contents

- [🛠 Prerequisites](#-prerequisites)
- [📦 Installation](#-installation)
- [🚀 Usage](#-usage)
- [📝 Code Explanation](#-code-explanation)
  - [🔧 Initialization](#-initialization)
  - [📜 Minting Tokens](#-minting-tokens)
  - [💼 Transferring Tokens](#-transferring-tokens)
- [🎉 Events](#-events)
- [📜 License](#-license)

## 🛠 Prerequisites

Before you get started, make sure you have the following:

- 🟢 Node.js (version 12 or higher)
- 🟢 npm (version 6 or higher)
- 🌐 Bywise blockchain node running locally or accessible via network

## 📦 Installation

1. Clone this repository:

```bash
git clone https://github.com/your-repository.git
cd your-repository
```

2. Install the required packages:

```bash
npm install bywise-utils
```

## 🚀 Usage

1. Ensure you have a Bywise blockchain node running locally or accessible via network.
2. Create a file named `BST1155.js` and paste the smart contract code into it.
3. Run the script to deploy the contract:

```bash
node deploy.js
```

## 📝 Code Explanation

Let's dive into the code and see how it works! 🌊

### 🔧 Initialization

The contract begins by importing necessary modules and defining the initial parameters:

```javascript
import BigNumber from 'bignumber.js';
import BywiseUtils, { StorageValue, StorageMap } from 'bywise-utils.js';

const TOKEN_NAME = "BMULTI";
const TOKEN_SYMBOL = "BMULTI";

class BST1155 {
    _name;
    _symbol;
    _owner;
    _balances = new StorageMap();

    constructor() {
        this._name = TOKEN_NAME;
        this._symbol = TOKEN_SYMBOL;
        this._owner = new StorageValue(BywiseUtils.getTxSender());
    }

    name() {  // @view
        return this._name;
    }

    symbol() {  // @view
        return this._symbol;
    }

    owner() {  // @view
        return this._owner.get();
    }

    balanceOf(account, id) { // @view
        this._isValidAddress(account);
        this._isValidTokenId(id);
        return this._balances.getBigNumber(`${account}:${id}`);
    }
```

### 📜 Minting Tokens

Minting new tokens is simple and secure. Only the owner can mint new tokens:

```javascript
    mint(to, id, amount) {
        this._isOwner();
        this._isValidAddress(to);
        this._isValidInteger(amount);

        let balanceKey = `${to}:${id}`;
        this._balances.set(balanceKey, this._balances.getBigNumber(balanceKey).plus(new BigNumber(amount)));

        BywiseUtils.emit('Mint', { to, id, amount });
    }
```

### 💼 Transferring Tokens

Transferring tokens is just as easy. Any token holder can transfer tokens to another address:

```javascript
    transfer(from, to, id, amount) {
        let sender = BywiseUtils.getTxSender();

        this._isValidAddress(from);
        this._isValidAddress(to);
        this._isValidInteger(amount);

        let balanceKeyFrom = `${from}:${id}`;
        let balanceKeyTo = `${to}:${id}`;

        this._balances.set(balanceKeyFrom, this._balances.getBigNumber(balanceKeyFrom).minus(new BigNumber(amount)));
        this._balances.set(balanceKeyTo, this._balances.getBigNumber(balanceKeyTo).plus(new BigNumber(amount)));

        BywiseUtils.emit('Transfer', { from, to, id, amount });
    }

    _isOwner() { // @private
        if (BywiseUtils.getTxSender() !== this._owner.get()) throw new Error('BST1155: Only Owner');
    }

    _isValidAddress(value) { // @private
        if (! /^(BWS[0-9A-Z]+[0-9a-fA-F]{0,43})$/.test(value)) {
            throw new Error(`BST1155: invalid address - ${value}`);
        }
    }

    _isValidTokenId(id) { // @private
        if (! /^[0-9]{1,36}$/.test(id)) {
            throw new Error(`BST1155: invalid token ID - ${id}`);
        }
    }

    _isValidInteger(value) { // @private
        if (! /^[0-9]{1,36}$/.test(value)) {
            throw new Error(`BST1155: invalid value - ${value}`);
        }
    }
}

BywiseUtils.exportContract(new BST1155());
```

## 🎉 Events

The contract emits events for various actions, making it easy to track activity:

- **Mint**: Emitted when new tokens are minted.
- **Transfer**: Emitted when tokens are transferred.

## 📜 License

This project is licensed under the MIT License. 📄
