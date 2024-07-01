import BigNumber from 'bignumber.js';
import BywiseUtils, { StorageValue, StorageMap } from 'bywise-utils.js';

const TOKEN_NAME = "BMULTI";
const TOKEN_SYMBOL = "BMULTI";

class BST1155 {
    _name;
    _symbol;
    _owner;
    _balances = new StorageMap();
    _operatorApprovals = new StorageMap();

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

    balanceOfBatch(accounts, ids) { // @view
        if (accounts.length !== ids.length) {
            throw new Error('BST1155: accounts and ids length mismatch');
        }

        return accounts.map((account, i) => this.balanceOf(account, ids[i]));
    }

    setApprovalForAll(operator, approved) {
        this._isValidAddress(operator);
        let sender = BywiseUtils.getTxSender();
        this._operatorApprovals.set(`${sender}:${operator}`, approved);
        BywiseUtils.emit('ApprovalForAll', { account: sender, operator, approved });
    }

    isApprovedForAll(account, operator) { // @view
        this._isValidAddress(account);
        this._isValidAddress(operator);
        return this._operatorApprovals.get(`${account}:${operator}`) || false;
    }

    mint(to, id, amount) {
        this._isOwner();
        this._isValidAddress(to);
        this._isValidInteger(amount);

        let balanceKey = `${to}:${id}`;
        this._balances.set(balanceKey, this._balances.getBigNumber(balanceKey).plus(new BigNumber(amount)));
        BywiseUtils.emit('Mint', { to, id, amount });
    }

    mintBatch(to, ids, amounts) {
        this._isOwner();
        if (ids.length !== amounts.length) {
            throw new Error('BST1155: ids and amounts length mismatch');
        }

        ids.forEach((id, i) => this.mint(to, id, amounts[i]));
    }

    transfer(from, to, id, amount) {
        let sender = BywiseUtils.getTxSender();
        this._isValidAddress(from);
        this._isValidAddress(to);
        this._isValidInteger(amount);
        this._checkApproval(from, sender);

        let balanceKeyFrom = `${from}:${id}`;
        let balanceKeyTo = `${to}:${id}`;

        if (this._balances.getBigNumber(balanceKeyFrom).isLessThan(amount)) {
            throw new Error('BST1155: insufficient balance for transfer');
        }

        this._balances.set(balanceKeyFrom, this._balances.getBigNumber(balanceKeyFrom).minus(new BigNumber(amount)));
        this._balances.set(balanceKeyTo, this._balances.getBigNumber(balanceKeyTo).plus(new BigNumber(amount)));
        BywiseUtils.emit('TransferSingle', { operator: sender, from, to, id, amount });
    }

    transferBatch(from, to, ids, amounts) {
        if (ids.length !== amounts.length) {
            throw new Error('BST1155: ids and amounts length mismatch');
        }

        ids.forEach((id, i) => this.transfer(from, to, id, amounts[i]));
        BywiseUtils.emit('TransferBatch', { operator: BywiseUtils.getTxSender(), from, to, ids, amounts });
    }

    _isOwner() { // @private
        if (BywiseUtils.getTxSender() !== this._owner.get()) throw new Error('BST1155: Only Owner');
    }

    _isValidAddress(value) { // @private
        if (!/^(BWS[0-9A-Z]+[0-9a-fA-F]{0,43})$/.test(value)) {
            throw new Error(`BST1155: invalid address - ${value}`);
        }
    }

    _isValidTokenId(id) { // @private
        if (!/^[0-9]{1,36}$/.test(id)) {
            throw new Error(`BST1155: invalid token ID - ${id}`);
        }
    }

    _isValidInteger(value) { // @private
        if (!/^[0-9]{1,36}$/.test(value)) {
            throw new Error(`BST1155: invalid value - ${value}`);
        }
    }

    _checkApproval(owner, operator) { // @private
        if (owner !== operator && !this.isApprovedForAll(owner, operator)) {
            throw new Error('BST1155: transfer caller is not owner nor approved');
        }
    }
}

BywiseUtils.exportContract(new BST1155());
