import BigNumber from 'bignumber.js'

const NOT_CREATE_NEW_VALUE = '3b61c123e0891ec819b46546e75cf3b707fa2003d7160f44849382d522d446e0';

const normaliseToStorage = (object) => {
    if (object instanceof StorageValue) {
        return JSON.stringify({
            uuid: object.getUUID(NOT_CREATE_NEW_VALUE),
            class: 'StorageValue'
        });
    } else if (object instanceof StorageMap) {
        return JSON.stringify({
            uuid: object.getUUID(NOT_CREATE_NEW_VALUE),
            class: 'StorageMap'
        });
    } else if (object instanceof StorageList) {
        return JSON.stringify({
            uuid: object.getUUID(NOT_CREATE_NEW_VALUE),
            class: 'StorageList'
        });
    } else if (object instanceof BigNumber) {
        return JSON.stringify(object.toString(10));
    } else {
        return JSON.stringify(object);
    }
}

const StorageValuefromUUID = (obj) => {
    if (obj.class !== 'StorageValue') throw new Error('object is not StorageValue')
    return new StorageValue(NOT_CREATE_NEW_VALUE + obj.uuid);
}

const StorageMapfromUUID = (obj) => {
    if (obj.class !== 'StorageMap') throw new Error('object is not StorageMap')
    return new StorageMap(NOT_CREATE_NEW_VALUE + obj.uuid);
}

const StorageListfromUUID = (obj) => {
    if (obj.class !== 'StorageList') throw new Error('object is not StorageList')
    return new StorageList(NOT_CREATE_NEW_VALUE + obj.uuid);
}

export class StorageValue {

    #uuid = ''

    constructor(value = '') {
        if (typeof value === 'string' && value.startsWith(NOT_CREATE_NEW_VALUE)) {
            this.#uuid = value.replace(NOT_CREATE_NEW_VALUE, '');
        } else {
            this.#uuid = blockchain.valueSet(normaliseToStorage(value));
        }
    }

    getUUID(key) {
        if (key === NOT_CREATE_NEW_VALUE) {
            return this.#uuid;
        }
        throw new Error('method not allowed');
    }

    toString() {
        return "StorageValue";
    }

    set(newValue) {
        blockchain.valueSet(normaliseToStorage(newValue), this.#uuid);
    }

    get() {
        return JSON.parse(blockchain.valueGet(this.#uuid));
    }

    getStorageMap() {
        return StorageMapfromUUID(this.get());
    }

    getStorageList() {
        return StorageListfromUUID(this.get());
    }

    getBigNumber() {
        return new BigNumber(this.get());
    }
}

export class StorageMap {

    #uuid = ''

    constructor(defaultValue = '') {
        if (typeof defaultValue === 'string' && defaultValue.startsWith(NOT_CREATE_NEW_VALUE)) {
            this.#uuid = defaultValue.replace(NOT_CREATE_NEW_VALUE, '');
        } else {
            this.#uuid = blockchain.mapNew(normaliseToStorage(defaultValue));
        }
    }

    getUUID(key) {
        if (key === NOT_CREATE_NEW_VALUE) {
            return this.#uuid;
        }
        throw new Error('method not allowed');
    }

    toString() {
        return "StorageMap";
    }

    has(key) {
        if (typeof key !== 'string') throw new Error('invalid typeof key')
        return blockchain.mapHas(key, this.#uuid) === '1';
    }

    del(key) {
        if (typeof key !== 'string') throw new Error('invalid typeof key')
        blockchain.mapDel(key, this.#uuid);
    }

    get(key) {
        if (typeof key !== 'string') throw new Error('invalid typeof key')

        return JSON.parse(blockchain.mapGet(key, this.#uuid));
    }

    getStorageMap(key) {
        return StorageMapfromUUID(this.get(key));
    }

    getStorageList(key) {
        return StorageListfromUUID(this.get(key));
    }

    getBigNumber(key) {
        return new BigNumber(this.get(key));
    }

    set(key, newValue) {
        if (typeof key !== 'string') throw new Error('invalid typeof key')
        blockchain.mapSet(key, normaliseToStorage(newValue), this.#uuid);
    }
}

export class StorageList {

    #uuid = ''

    constructor(value = '') {
        if (typeof value === 'string' && value.startsWith(NOT_CREATE_NEW_VALUE)) {
            this.#uuid = value.replace(NOT_CREATE_NEW_VALUE, '');
        } else {
            this.#uuid = blockchain.listNew();
        }
    }

    getUUID(key) {
        if (key === NOT_CREATE_NEW_VALUE) {
            return this.#uuid;
        }
        throw new Error('method not allowed');
    }

    toString() {
        return "StorageList";
    }

    size() {
        return blockchain.listSize(this.#uuid);
    }

    get(index) {
        return JSON.parse(blockchain.listGet(index, this.#uuid));
    }

    getStorageMap(index) {
        return StorageMapfromUUID(this.get(index));
    }

    getStorageList(index) {
        return StorageListfromUUID(this.get(index));
    }

    getBigNumber(index) {
        return new BigNumber(this.get(index));
    }

    set(index, newValue) {
        blockchain.listSet(index, normaliseToStorage(newValue), this.#uuid);
    }

    push(newValue) {
        blockchain.listPush(normaliseToStorage(newValue), this.#uuid);
    }

    pop() {
        return JSON.parse(blockchain.listPop(this.#uuid));
    }

    popStorageValue() {
        return StorageValuefromUUID(this.pop());
    }

    popStorageMap() {
        return StorageMapfromUUID(this.pop());
    }

    popStorageList() {
        return StorageListfromUUID(this.pop());
    }

    popBigNumber() {
        return new BigNumber(this.pop());
    }
}

const getThisAddress = () => {
    return blockchain.getThisAddress();
}

const getChain = () => {
    return blockchain.getChain();
}

const getTxAmount = () => {
    return new BigNumber(blockchain.getTxAmount());
}

const getTx = () => {
    return JSON.parse(blockchain.getTx());
}

const getTxSender = () => {
    return blockchain.getTxSender();
}

const balanceOf = (address) => {
    return new BigNumber(blockchain.balanceOf(address));
}

const transfer = (address, amount) => {
    return blockchain.balanceTransfer(address, amount);
}

const getBlockHeight = () => {
    return new BigNumber(blockchain.getBlockHeight());
}

const exportContract = (contract) => {
    const VIEW_COMMENT = /(\/\/.*\@view.*$)/m;
    const PRIV_COMMENT = /(\/\/.*\@private.*$)/m;
    const PAYABLE_COMMENT = /(\/\/.*\@payable.*$)/m;
    const STRIP_COMMENTS = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/mg;
    const ARGUMENT_NAMES = /([^\s,]+)/g;
    const getFunction = (method, func) => {
        if (method === 'constructor') return null;
        const removedStrings = func.toString().replace(/"(.*?)"/mg, '').replace(/'(.*?)'/mg, "");
        const fnStr = func.toString().replace(STRIP_COMMENTS, '');
        const view = VIEW_COMMENT.test(removedStrings);
        const priv = PRIV_COMMENT.test(removedStrings);
        const payable = PAYABLE_COMMENT.test(removedStrings);
        let parans = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
        if (parans === null) {
            parans = [];
        }
        if (priv) return null;
        return {
            name: method,
            view: view,
            payable: payable,
            parameters: parans.map(n => ({ name: n, type: ['string'] })),
            returns: ['string']
        };
    }
    const methods = Object.entries(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(contract)));
    const abi = [];
    methods.forEach(([method, func]) => {
        const publicMethod = getFunction(method, func.value);
        if (publicMethod) {
            abi.push(publicMethod)
        }
    });

    globalThis.contract = contract;
    globalThis.abi = abi;
}

const getRandom = (type = 'float') => {
    if (typeof type !== 'string') throw new Error('invalid typeof type')
    return parseFloat(blockchain.getRandom(type));
}

const getContract = (contractAddress, methods = []) => {
    const contract = {
        _amount: '0'
    };
    for (let i = 0; i < methods.length; i++) {
        const method = methods[i];
        contract[method] = (...parans) => {
            return blockchain.externalContract(contractAddress, contract._amount, method, ...parans);
        }
    }
    return contract;
}

const emit = (event, parameters = {}) => {
    blockchain.emitEvent(event, JSON.stringify(parameters));
    return '';
}

const read = (network, actionContract, proxyData = {
    addresses: [],
    values: [],
    strings: [],
    data: [],
}) => {
    return blockchain.readProxyAction(network, actionContract, JSON.stringify(proxyData));
}

const writeCost = (network, actionContract = '', proxyData = {
    addresses: [],
    values: [],
    strings: [],
    data: [],
}) => {
    return blockchain.costProxyAction(network, actionContract, JSON.stringify(proxyData));
}

const write = (network, actionContract, proxyData = {
    addresses: [],
    values: [],
    strings: [],
    data: [],
}) => {
    return blockchain.newProxyAction(network, actionContract, JSON.stringify(proxyData));
}

const BywiseUtils = {
    balanceOf,
    transfer,
    getBlockHeight,
    getThisAddress,
    getContract,
    exportContract,
    getRandom,
    getTxAmount,
    getTx,
    getTxSender,
    getChain,
    emit,
    read,
    write,
    writeCost,
}
export default BywiseUtils;