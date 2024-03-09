import BigNumber from 'bignumber.js';
import BywiseUtils, {StorageValue, StorageMap, StorageList } from 'bywise-utils.js';

const TOKEN_NAME = "SimpleToken";
const TOKEN_SYMBOL = "TKN";
const INITIAL_AMOUNT = "5000";

function checkAmountIsInteger(value) {
    if (! /^[0-9]{1,36}$/.test(value)) {
        throw new Error(`invalid amount - ${value}`);
    }
}

function isValidAddress(value) {
    if (! /^(BWS1[MT][CU][0-9a-fA-F]{40}[0-9a-zA-Z]{0,64}[0-9a-fA-F]{3})$/.test(value)) {
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

        this._mint(BywiseUtils.getTxSender(), (new BigNumber(INITIAL_AMOUNT).multipliedBy(10 ** this.decimals())));
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
        return this._balances.getBigNumber(account);
    }

    allowance(owner, spender) {  // @view
        isValidAddress(owner);
        isValidAddress(spender);
        if (this._allowances.has(owner)) {
            return this._allowances.getStorageMap(owner).getBigNumber(spender);
        }
        return new BigNumber('0');
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

        let spender = BywiseUtils.getSender();

        this._decreaseAllowance(spender, from, amount);
        this._transfer(from, to, amount);
        return true;
    }

    approve(spender, amount) {
        isValidAddress(spender);
        checkAmountIsInteger(amount);

        let owner = BywiseUtils.getSender();
        this._approve(spender, owner, amount);
        return true;
    }

    _transfer(from, to, amount) { // @private
        amount = new BigNumber(amount);

        let fromBalance = this._balances.getBigNumber(from);
        let toBalance = this._balances.getBigNumber(to);

        if (amount.isGreaterThan(fromBalance)) throw new Error('insuficient funds');

        this._balances.set(from, fromBalance.minus(amount))
        this._balances.set(to, toBalance.plus(amount))
    }

    _mint(recipient, amount) { // @private
        isValidAddress(recipient);
        checkAmountIsInteger(amount);

        amount = new BigNumber(amount);

        let recipientBalance = this._balances.getBigNumber(recipient);
        this._balances.set(recipient, recipientBalance.plus(amount));
        this._totalSupply.set(this._totalSupply.getBigNumber().plus(amount));
    }

    _approve(spender, owner, amount) { // @private
        if (!this._allowances.has(owner)) {
            this._allowances.set(owner, new StorageMap('0'));
        }
        this._allowances.getStorageMap(owner).set(spender, amount);
    }

    _decreaseAllowance(spender, owner, amount) { // @private
        amount = new BigNumber(amount);
        const allowance = this.allowance(owner, spender);
        if (amount.isGreaterThan(allowance)) throw new Error('decreased allowance below zero');

        this._approve(spender, owner, allowance.minus(amount).toString())
    }
}

BywiseUtils.exportContract(new ERC20(TOKEN_NAME,  TOKEN_SYMBOL));