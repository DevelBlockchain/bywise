import BywiseUtils, { StorageValue, StorageMap } from 'bywise-utils';

const TOKEN_NAME = "SimpleToken";
const TOKEN_SYMBOL = "TKN";
const INITIAL_AMOUNT = "5000";

function checkAmountIsInteger(value) {
    if (! /^[0-9]{1,36}$/.test(value)) {
        throw new Error(`invalid amount - ${value}`);
    }
}

function isValidAddress(value) {
    if (! /^(BWS1[MT][CU][0-9a-fA-F]{40}[0-9a-zA-Z]{0,64}[0-9a-fA-F]{3})|(BWS000000000000000000000000000000000000000000000)$/.test(value)) {
        throw new Error(`invalid address - ${value}`);
    }
}

class ERC20 {

    _name;
    _symbolToken;
    _totalSupply = new StorageValue('0');
    _balances = new StorageMap('0');
    _allowances = new StorageMap();

    constructor(name, symbolToken) {
        this._name = name;
        this._symbolToken = symbolToken;
        this._mint(BywiseUtils.getTxSender(), (BigInt(INITIAL_AMOUNT) * BigInt(10 ** parseInt(this.decimals()))));
    }

    name() {  // @view
        return this._name;
    }

    symbol() {  // @view
        return this._symbolToken
    }

    totalSupply() {  // @view
        return this._totalSupply.get();
    }

    decimals() {  // @view
        return 18;
    }

    balanceOf(account) { // @view
        isValidAddress(account);
        return this._balances.get(account);
    }

    allowance(owner, spender) {  // @view
        isValidAddress(owner);
        isValidAddress(spender);
        if (this._allowances.has(owner)) {
            return this._allowances.getStorageMap(owner).get(spender);
        }
        return '0';
    }

    transfer(recipient, amount) {
        isValidAddress(recipient);
        checkAmountIsInteger(amount);

        let sender = BywiseUtils.getTxSender();
        this._transfer(sender, recipient, amount);
        return true;
    }

    transferFrom(from, to, amount) {
        isValidAddress(from);
        isValidAddress(to);
        checkAmountIsInteger(amount);

        let spender = BywiseUtils.getTxSender();

        this._decreaseAllowance(spender, from, amount);
        this._transfer(from, to, amount);
        return true;
    }

    approve(spender, amount) {
        isValidAddress(spender);
        checkAmountIsInteger(amount);

        let owner = BywiseUtils.getTxSender();
        this._approve(spender, owner, amount);
        return true;
    }

    _transfer(from, to, amount) { // @private
        amount = BigInt(amount);

        let fromBalance = BigInt(this._balances.get(from));
        if (amount > fromBalance) throw new Error('insuficient funds');
        fromBalance -= amount;
        this._balances.set(from, fromBalance.toString())
        
        let toBalance = BigInt(this._balances.get(to));
        toBalance += amount;
        this._balances.set(to, toBalance.toString())
    }

    _mint(recipient, amount) { // @private
        isValidAddress(recipient);
        checkAmountIsInteger(amount);

        amount = BigInt(amount);

        let recipientBalance = BigInt(this._balances.get(recipient));
        recipientBalance += amount;
        this._balances.set(recipient, recipientBalance.toString());
        let totalSupply = BigInt(this._totalSupply.get());
        totalSupply += amount;
        this._totalSupply.set(totalSupply.toString());
    }

    _approve(spender, owner, amount) { // @private
        if (!this._allowances.has(owner)) {
            this._allowances.set(owner, new StorageMap('0'));
        }
        this._allowances.getStorageMap(owner).set(spender, amount);
    }

    _decreaseAllowance(spender, owner, amount) { // @private
        amount = BigInt(amount);
        let allowance = BigInt(this.allowance(owner, spender));
        if (amount > allowance) throw new Error('decreased allowance below zero');
        allowance -= amount;
        this._approve(spender, owner, allowance.toString())
    }
}

BywiseUtils.exportContract(new ERC20(TOKEN_NAME,  TOKEN_SYMBOL));