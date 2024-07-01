import BigNumber from 'bignumber.js';
import BywiseUtils, { StorageValue, StorageMap, StorageList } from 'bywise-utils.js';

const TOKEN_NAME = "TBRL";
const TOKEN_SYMBOL = "TBRL";
const INITIAL_AMOUNT = '1000000000';
const URL = 'TBRL';
const ICON = 'bafkreiho4m5gfhd5nk3abnttsadk5qsa3fr27a5idfsws4uzo7ba6tffvm';
const DECIMALS = 18;
const ENABLE_MINT = true;
const FEES = [];

class BST20 { // Bywise Standard Token 20

    _name;
    _symbolToken;
    _owner;
    _url = new StorageValue(URL);
    _icon = new StorageValue(ICON);
    _totalSupply = new StorageValue('0');
    _totalFee = new StorageValue('0');
    _balances = new StorageMap('0');
    _allowances = new StorageMap();
    _fees = new StorageList();
    _allowlist = new StorageMap('false');

    constructor() {
        this._name = TOKEN_NAME;
        this._symbolToken = TOKEN_SYMBOL;
        this._owner = new StorageValue(BywiseUtils.getTxSender());

        this._mint(BywiseUtils.getTxSender(), new BigNumber(INITIAL_AMOUNT));
        for (let i = 0; i < FEES.length; i++) {
            const fee = FEES[i];
            this.addFee(fee.address, fee.fee);
        }
    }

    name() {  // @view
        return this._name;
    }

    symbol() {  // @view
        return this._symbolToken;
    }

    url() {  // @view
        return this._url.get();
    }

    icon() {  // @view
        return this._icon.get();
    }

    owner() {  // @view
        return this._owner.get();
    }

    totalSupply() {  // @view
        return this._totalSupply.get();
    }

    decimals() {  // @view
        return DECIMALS;
    }

    balanceOf(account) { // @view
        this._isValidAddress(account);
        return this._balances.getBigNumber(account);
    }

    allowance(owner, spender) {  // @view
        this._isValidAddress(owner);
        this._isValidAddress(spender);

        if (this._allowances.has(owner)) {
            return this._allowances.getStorageMap(owner).getBigNumber(spender);
        }
        return new BigNumber('0');
    }

    totalFee() {  // @view
        return this._totalFee.get();
    }

    getFees(index) { // @view
        this._isValidInteger(index);
        return this._fees.get(index);
    }

    countFees() { // @view
        return this._fees.size();
    }

    isAllowlist(address) { // @view
        this._isValidAddress(address);
        return this._allowlist.get(address) === 'true';
    }

    mint(recipient, amount) {
        this._isOwner();
        if (!ENABLE_MINT) throw new Error('BST20: Cant mint this token');

        this._mint(recipient, amount);
        return true;
    }

    burn(amount) {
        let sender = BywiseUtils.getTxSender();
        this._burn(sender, amount);
        return true;
    }

    burnFrom(account, amount) {
        this._isValidAddress(account);
        this._decreaseAllowance(account, BywiseUtils.getTxSender(), amount);
        this._burn(account, amount);
        return true;
    }

    transfer(recipient, amount) {
        let sender = BywiseUtils.getTxSender();
        this._makeTransfer(sender, recipient, amount);
        return true;
    }

    transferFrom(from, to, amount) {
        let spender = BywiseUtils.getTxSender();
        this._decreaseAllowance(from, spender, amount);
        this._makeTransfer(from, to, amount);
        return true;
    }

    approve(spender, amount) {
        let owner = BywiseUtils.getTxSender();
        this._approve(spender, owner, amount);

        BywiseUtils.emit('Approval', {
            owner,
            spender,
            amount,
        });
        return true;
    }

    setURL(url) {
        this._isOwner();
        this._url.set(url);

        BywiseUtils.emit('New URL', { url });
    }

    setIcon(icon) {
        this._isOwner();
        this._icon.set(icon);

        BywiseUtils.emit('New icon', { icon });
    }

    changeOwner(newOwner) {
        this._isOwner();
        this._isValidAddress(newOwner);

        const oldOwner = this._owner.get();
        this._owner.set(newOwner);

        BywiseUtils.emit('New Owner', {
            oldOwner,
            newOwner,
        });
    }

    addFee(address, fee) {
        this._isOwner();
        this._isValidAddress(address);
        this._isValidPercent(fee);

        const total = this._totalFee.getBigNumber().plus(new BigNumber(fee));
        if (total.isGreaterThanOrEqualTo(new BigNumber('1'))) throw new Error('BST20: total fee cant be greater than 1');

        this._totalFee.set(total);
        this._fees.push({ address, fee });
        BywiseUtils.emit('New Fee', { address, fee });
    }

    removeFee() {
        this._isOwner();
        const fee = this._fees.pop();

        const total = this._totalFee.getBigNumber().minus(new BigNumber(fee.fee));
        this._totalFee.set(total);

        BywiseUtils.emit('Remove Fee', fee);
    }

    setAllowlist(address, enable) {
        this._isOwner();
        this._isValidAddress(address);
        this._isValidBoolean(enable);

        this._allowlist.set(address, enable);
        BywiseUtils.emit('Set Allowlist', { address, enable });
    }

    _isOwner() { // @private
        if (BywiseUtils.getTxSender() !== this._owner.get()) throw new Error('BST20: Only Owner');
    }

    _makeTransfer(from, to, amount) { // @private
        this._isValidAddress(from);
        this._isValidAddress(to);
        this._isValidInteger(amount);

        let amountBN = new BigNumber(amount);

        const size = this._fees.size();
        const isAllowlistFrom = this.isAllowlist(from);
        const isAllowlistTo = this.isAllowlist(to);
        if (!(isAllowlistFrom || isAllowlistTo)) {
            for (let i = 0; i < size; i++) {
                const fee = this._fees.get(i);

                const feeAmount = new BigNumber(amountBN.multipliedBy(new BigNumber(fee.fee)).toFixed(0));
                if (feeAmount.isGreaterThan(new BigNumber('0'))) {
                    this._transfer(from, fee.address, feeAmount);
                    amountBN = amountBN.minus(feeAmount);
                }
            }
        }
        this._transfer(from, to, amountBN);
    }

    _transfer(from, to, amount) { // @private
        let fromBalance = this._balances.getBigNumber(from);

        if (amount.isLessThan(new BigNumber('0'))) throw new Error('BST20: transfer amount below zero');
        if (amount.isGreaterThan(fromBalance)) throw new Error('BST20: insufficient funds');

        this._balances.set(from, fromBalance.minus(amount));

        let toBalance = this._balances.getBigNumber(to);
        this._balances.set(to, toBalance.plus(amount));

        BywiseUtils.emit('Transfer', {
            from,
            to,
            amount: amount.toString(),
        });
    }

    _mint(recipient, amount) { // @private
        this._isValidAddress(recipient);
        this._isValidInteger(amount);

        const amountBN = new BigNumber(amount);

        let recipientBalance = this._balances.getBigNumber(recipient);
        this._balances.set(recipient, recipientBalance.plus(amountBN));
        this._totalSupply.set(this._totalSupply.getBigNumber().plus(amountBN));

        BywiseUtils.emit('Mint', {
            recipient,
            amount,
        });
    }

    _burn(account, amount) { // @private
        this._isValidAddress(account);
        this._isValidInteger(amount);

        const amountBN = new BigNumber(amount);
        let accountBalance = this._balances.getBigNumber(account);

        if (amountBN.isGreaterThan(accountBalance)) throw new Error('BST20: burn amount exceeds balance');

        this._balances.set(account, accountBalance.minus(amountBN));
        this._totalSupply.set(this._totalSupply.getBigNumber().minus(amountBN));

        BywiseUtils.emit('Burn', {
            account,
            amount,
        });
    }

    _approve(spender, owner, amount) { // @private
        this._isValidAddress(spender);
        this._isValidAddress(owner);
        this._isValidInteger(amount);

        if (!this._allowances.has(owner)) {
            this._allowances.set(owner, new StorageMap('0'));
        }
        this._allowances.getStorageMap(owner).set(spender, amount);
    }

    _decreaseAllowance(spender, owner, amount) { // @private
        this._isValidAddress(spender);
        this._isValidAddress(owner);
        this._isValidInteger(amount);

        amount = new BigNumber(amount);
        const allowance = this.allowance(owner, spender);
        if (amount.isGreaterThan(allowance)) throw new Error('BST20: decreased allowance below zero');

        this._approve(spender, owner, allowance.minus(amount).toString());
    }

    _isValidInteger(value) { // @private
        if (!/^[0-9]{1,36}$/.test(value)) {
            throw new Error(`BST20: invalid value - ${value}`);
        }
    }

    _isValidBoolean(value) { // @private
        if (!/^true|false$/.test(value)) {
            throw new Error(`BST20: invalid boolean - ${value}`);
        }
    }

    _isValidPercent(value) { // @private
        if (!/^0.[0-9]{1,18}$/.test(value)) {
            throw new Error(`BST20: invalid percent - ${value}`);
        }
    }

    _isValidAddress(value) { // @private
        if (!/^(BWS[0-9A-Z]+[0-9a-fA-F]{0,43})$/.test(value)) {
            throw new Error(`BST20: invalid address - ${value}`);
        }
    }
}

BywiseUtils.exportContract(new BST20());
