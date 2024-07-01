# 🚚 BSTSupplyChain - Bywise Standard Supply Chain Token 🚚

Welcome to the BSTSupplyChain smart contract! 🚀 This contract is designed to track and manage products throughout the supply chain on the Bywise blockchain, ensuring transparency and authenticity.

## 📋 Table of Contents

- [🛠 Prerequisites](#-prerequisites)
- [📦 Installation](#-installation)
- [🚀 Usage](#-usage)
- [📝 Code Explanation](#-code-explanation)
  - [🔧 Initialization](#-initialization)
  - [📜 Registering Products](#-registering-products)
  - [💼 Transferring Products](#-transferring-products)
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
2. Create a file named `BSTSupplyChain.js` and paste the smart contract code into it.
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

class BSTSupplyChain {
    _owner;
    _products = new StorageMap();
    _productCount = new StorageValue('0');

    constructor() {
        this._owner = new StorageValue(BywiseUtils.getTxSender());
    }

    owner() {  // @view
        return this._owner.get();
    }

    registerProduct(id, name, origin) {
        this._isOwner();
        this._isValidId(id);

        const product = {
            id: id,
            name: name,
            origin: origin,
            currentOwner: BywiseUtils.getTxSender(),
            history: []
        };

        this._products.set(id, product);
        this._productCount.set(this._productCount.getBigNumber().plus(1));

        BywiseUtils.emit('ProductRegistered', { id, name, origin });
    }
```

### 📜 Registering Products

Registering new products in the supply chain is secure and easy. Only the owner can register new products:

```javascript
    registerProduct(id, name, origin) {
        this._isOwner();
        this._isValidId(id);

        const product = {
            id: id,
            name: name,
            origin: origin,
            currentOwner: BywiseUtils.getTxSender(),
            history: []
        };

        this._products.set(id, product);
        this._productCount.set(this._productCount.getBigNumber().plus(1));

        BywiseUtils.emit('ProductRegistered', { id, name, origin });
    }
```

### 💼 Transferring Products

Transferring products within the supply chain is just as easy. The current owner can transfer products to another address:

```javascript
    transferProduct(id, newOwner) {
        this._isValidId(id);
        this._isValidAddress(newOwner);

        const product = this._products.get(id);
        if (product.currentOwner !== BywiseUtils.getTxSender()) {
            throw new Error('BSTSupplyChain: Only current owner can transfer');
        }

        product.history.push({
            owner: product.currentOwner,
            timestamp: Math.floor(Date.now() / 1000)
        });
        product.currentOwner = newOwner;

        this._products.set(id, product);

        BywiseUtils.emit('ProductTransferred', { id, newOwner });
    }

    getProduct(id) {  // @view
        this._isValidId(id);
        return this._products.get(id);
    }

    _isOwner() { // @private
        if (BywiseUtils.getTxSender() !== this._owner.get()) throw new Error('BSTSupplyChain: Only Owner');
    }

    _isValidId(id) { // @private
        if (!/^[0-9a-fA-F]{1,36}$/.test(id)) {
            throw new Error(`BSTSupplyChain: invalid product ID - ${id}`);
        }
    }

    _isValidAddress(value) { // @private
        if (!/^(BWS[0-9A-Z]+[0-9a-fA-F]{0,43})$/.test(value)) {
            throw new Error(`BSTSupplyChain: invalid address - ${value}`);
        }
    }
}

BywiseUtils.exportContract(new BSTSupplyChain());
```

## 🎉 Events

The contract emits events for various actions, making it easy to track activity:

- **ProductRegistered**: Emitted when a new product is registered.
- **ProductTransferred**: Emitted when a product is transferred to a new owner.

## 📜 License

This project is licensed under the MIT License. 📄
