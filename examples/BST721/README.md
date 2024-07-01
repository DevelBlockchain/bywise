# 🎨 BST721 - Bywise Standard Token 721 (NFT) 🎨

Welcome to the BST721 smart contract! 🚀 This contract is a Non-Fungible Token (NFT) standard on the Bywise blockchain, inspired by the ERC721 standard. It allows you to create, manage, and transfer unique tokens that represent ownership of digital or physical assets.

## 📋 Table of Contents

- [🛠 Prerequisites](#-prerequisites)
- [📦 Installation](#-installation)
- [🚀 Usage](#-usage)
- [📝 Code Explanation](#-code-explanation)
  - [🔧 Initialization](#-initialization)
  - [📜 Minting NFTs](#-minting-nfts)
  - [💼 Transferring NFTs](#-transferring-nfts)
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
2. Create a file named `BST721.js` and paste the smart contract code into it.
3. Run the script to deploy the contract:

```bash
node deploy.js
```

## 📝 Code Explanation

Let's dive into the code and see how it works! 🌊

### 🔧 Initialization

The contract begins by importing necessary modules and defining the initial parameters:

```javascript
import BywiseUtils, { StorageValue, StorageMap } from 'bywise-utils.js';

const TOKEN_NAME = "BNFT";
const TOKEN_SYMBOL = "BNFT";

class BST721 {
    _name;
    _symbol;
    _owner;
    _tokenIdCounter = new StorageValue('0');
    _owners = new StorageMap();
    _tokenURIs = new StorageMap();
    _balances = new StorageMap('0');
    _allowances = new StorageMap();

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

    balanceOf(account) { // @view
        this._isValidAddress(account);
        return this._balances.getBigNumber(account);
    }

    ownerOf(tokenId) {  // @view
        this._isValidTokenId(tokenId);
        return this._owners.get(tokenId);
    }

    tokenURI(tokenId) {  // @view
        this._isValidTokenId(tokenId);
        return this._tokenURIs.get(tokenId);
    }
```

### 📜 Minting NFTs

Minting new NFTs is simple and secure. Only the owner can mint new tokens:

```javascript
    mint(to, tokenId, uri) {
        this._isOwner();
        this._isValidAddress(to);
        this._isUniqueToken(tokenId);

        this._balances.set(to, this._balances.getBigNumber(to).plus(1));
        this._owners.set(tokenId, to);
        this._tokenURIs.set(tokenId, uri);
        this._tokenIdCounter.set(this._tokenIdCounter.getBigNumber().plus(1));

        BywiseUtils.emit('Mint', { to, tokenId, uri });
    }
```

### 💼 Transferring NFTs

Transferring NFTs is just as easy. The current owner can transfer tokens to another address:

```javascript
    transferFrom(from, to, tokenId) {
        let sender = BywiseUtils.getTxSender();

        this._isValidAddress(from);
        this._isValidAddress(to);
        this._isTokenOwner(from, tokenId);

        this._balances.set(from, this._balances.getBigNumber(from).minus(1));
        this._balances.set(to, this._balances.getBigNumber(to).plus(1));
        this._owners.set(tokenId, to);

        BywiseUtils.emit('Transfer', { from, to, tokenId });
    }

    approve(to, tokenId) {
        let owner = BywiseUtils.getTxSender();
        this._isTokenOwner(owner, tokenId);

        this._allowances.set(tokenId, to);

        BywiseUtils.emit('Approval', { owner, to, tokenId });
    }

    _isOwner() { // @private
        if (BywiseUtils.getTxSender() !== this._owner.get()) throw new Error('BST721: Only Owner');
    }

    _isValidAddress(value) { // @private
        if (! /^(BWS[0-9A-Z]+[0-9a-fA-F]{0,43})$/.test(value)) {
            throw new Error(`BST721: invalid address - ${value}`);
        }
    }

    _isValidTokenId(tokenId) { // @private
        if (! /^[0-9]{1,36}$/.test(tokenId)) {
            throw new Error(`BST721: invalid token ID - ${tokenId}`);
        }
    }

    _isUniqueToken(tokenId) { // @private
        if (this._owners.has(tokenId)) {
            throw new Error(`BST721: token ID already exists - ${tokenId}`);
        }
    }

    _isTokenOwner(account, tokenId) { // @private
        if (this._owners.get(tokenId) !== account) {
            throw new Error(`BST721: not the token owner - ${tokenId}`);
        }
    }
}

BywiseUtils.exportContract(new BST721());
```

## 🎉 Events

The contract emits events for various actions, making it easy to track activity:

- **Mint**: Emitted when a new NFT is minted.
- **Transfer**: Emitted when an NFT is transferred.
- **Approval**: Emitted when an NFT is approved for transfer.

## 📜 License

This project is licensed under the MIT License. 📄