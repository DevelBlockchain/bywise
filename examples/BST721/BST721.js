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
    _balances = new StorageMap();
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

    mint(to, tokenId, uri) {
        this._isOwner();
        this._isValidAddress(to);
        this._isUniqueToken(tokenId);

        this._balances.set(to, this._balances.getBigNumber(to).plus(1));
        this._owners.set(tokenId, to);
        this._tokenURIs.set(tokenId, uri);
        this._tokenIdCounter.set(this._tokenIdCounter.getBigNumber().plus(1));

        BywiseUtils.emit('Transfer', { from: '0x0', to, tokenId });
        BywiseUtils.emit('Mint', { to, tokenId, uri });
    }

    transferFrom(from, to, tokenId) {
        let sender = BywiseUtils.getTxSender();
        this._isValidAddress(from);
        this._isValidAddress(to);
        this._isTokenOwnerOrApproved(sender, tokenId);

        this._balances.set(from, this._balances.getBigNumber(from).minus(1));
        this._balances.set(to, this._balances.getBigNumber(to).plus(1));
        this._owners.set(tokenId, to);
        this._allowances.delete(tokenId);

        BywiseUtils.emit('Transfer', { from, to, tokenId });
    }

    approve(to, tokenId) {
        let owner = BywiseUtils.getTxSender();
        this._isTokenOwner(owner, tokenId);

        this._allowances.set(tokenId, to);

        BywiseUtils.emit('Approval', { owner, to, tokenId });
    }

    getApproved(tokenId) { // @view
        this._isValidTokenId(tokenId);
        return this._allowances.get(tokenId) || '0x0';
    }

    setApprovalForAll(operator, approved) {
        this._isValidAddress(operator);
        let sender = BywiseUtils.getTxSender();
        this._allowances.set(`${sender}:${operator}`, approved);

        BywiseUtils.emit('ApprovalForAll', { owner: sender, operator, approved });
    }

    isApprovedForAll(owner, operator) { // @view
        this._isValidAddress(owner);
        this._isValidAddress(operator);
        return this._allowances.get(`${owner}:${operator}`) || false;
    }

    _isOwner() { // @private
        if (BywiseUtils.getTxSender() !== this._owner.get()) throw new Error('BST721: Only Owner');
    }

    _isValidAddress(value) { // @private
        if (!/^(BWS[0-9A-Z]+[0-9a-fA-F]{0,43})$/.test(value)) {
            throw new Error(`BST721: invalid address - ${value}`);
        }
    }

    _isValidTokenId(tokenId) { // @private
        if (!/^[0-9]{1,36}$/.test(tokenId)) {
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

    _isTokenOwnerOrApproved(account, tokenId) { // @private
        const owner = this._owners.get(tokenId);
        const approved = this.getApproved(tokenId);
        const operatorApproval = this.isApprovedForAll(owner, account);
        if (account !== owner && account !== approved && !operatorApproval) {
            throw new Error('BST721: transfer caller is not owner nor approved');
        }
    }
}

BywiseUtils.exportContract(new BST721());
