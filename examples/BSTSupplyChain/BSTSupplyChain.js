import BywiseUtils, { StorageValue, StorageMap } from 'bywise-utils.js';

class BSTSupplyChain {
    _owner;
    _products = new StorageMap();
    _productCount = new StorageValue('0');
    _paused = new StorageValue(false);

    constructor() {
        this._owner = new StorageValue(BywiseUtils.getTxSender());
    }

    owner() {  // @view
        return this._owner.get();
    }

    productCount() { // @view
        return this._productCount.get();
    }

    paused() { // @view
        return this._paused.get();
    }

    registerProduct(id, name, origin) {
        this._isOwner();
        this._isNotPaused();
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

        BywiseUtils.emit('ProductRegistered', { id, name, origin, owner: BywiseUtils.getTxSender() });
    }

    transferProduct(id, newOwner) {
        this._isNotPaused();
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

        BywiseUtils.emit('ProductTransferred', { id, newOwner, previousOwner: BywiseUtils.getTxSender() });
    }

    getProduct(id) {  // @view
        this._isValidId(id);
        return this._products.get(id);
    }

    updateProduct(id, name, origin) {
        this._isOwner();
        this._isNotPaused();
        this._isValidId(id);

        const product = this._products.get(id);
        product.name = name;
        product.origin = origin;

        this._products.set(id, product);

        BywiseUtils.emit('ProductUpdated', { id, name, origin });
    }

    removeProduct(id) {
        this._isOwner();
        this._isNotPaused();
        this._isValidId(id);

        this._products.delete(id);
        this._productCount.set(this._productCount.getBigNumber().minus(1));

        BywiseUtils.emit('ProductRemoved', { id });
    }

    pause() {
        this._isOwner();
        this._paused.set(true);
        BywiseUtils.emit('Paused', {});
    }

    unpause() {
        this._isOwner();
        this._paused.set(false);
        BywiseUtils.emit('Unpaused', {});
    }

    _isOwner() { // @private
        if (BywiseUtils.getTxSender() !== this._owner.get()) throw new Error('BSTSupplyChain: Only Owner');
    }

    _isNotPaused() { // @private
        if (this._paused.get()) throw new Error('BSTSupplyChain: Contract is paused');
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
