import { BywiseHelper } from '@bywise/web3';
import BigNumber from 'bignumber.js';
import { ETHProxyData } from '../models';
import { ETHProvider } from '../services/eth.service';
import { ApplicationContext } from '../types';
import BlockchainInterface, { BlockchainAction, TransactionMessage } from './BlockchainInterface';
import BywiseRuntime from './BywiseRuntime';

class Memory {
    data: any;

    constructor(data = {}) {
        this.data = data;
    }

    has(key: string): boolean {
        return this.data[key] !== undefined;
    }

    get(key: string): string {
        return this.data[key];
    }

    set(key: string, value: string): string {
        return this.data[key] = value;
    }

    delete(key: string): void {
        this.data[key] = undefined;
    }
}

export default class BlockchainDebug implements BlockchainInterface {

    static MAX_VALUE_LENGTH = 1000000;
    static MAX_KEY_LENGTH = 2048;

    balances = new Memory();
    memory = new Memory();
    ethProvider;

    constructor(applicationContext: ApplicationContext, backup?: any) {
        this.ethProvider = new ETHProvider(applicationContext);
        this.loadData(backup);
    }

    loadData(backup?: any) {
        if (backup) {
            this.balances = new Memory(backup.balances);
            this.memory = new Memory(backup.memory);
        }
    }

    export() {
        return {
            balances: this.balances.data,
            memory: this.memory.data,
        };
    }

    getUUID = async (tx: TransactionMessage) => {
        const charset = '0123456789abcdef';
        let uuid = '';
        for (let i = 0; i < 32; i++) {
            uuid += charset[Math.floor(tx.random() * charset.length)];
        }
        return uuid;
    }

    isUUID = async (uuid: string) => {
        return /^[a-f0-9]{32}$/.test(uuid);
    }

    getTxCreated = async (tx: TransactionMessage): Promise<string> => {

        return tx.ctx.tx ? tx.ctx.tx.created + '' : '';
    }

    getBlockHeight = async (tx: TransactionMessage): Promise<string> => {

        return tx.ctx.block.height + '';
    }

    getThisAddress = async (tx: TransactionMessage): Promise<string> => {
        return tx.contractAddress;
    }

    log = async (tx: TransactionMessage, ...parans: string[]): Promise<string> => {
        tx.ctx.output.logs.push(parans.join(' '))

        return '';
    }

    emitEvent = async (tx: TransactionMessage, event: string, data: string): Promise<string> => {
        tx.ctx.output.events.push({
            from: tx.contractAddress,
            event: event,
            data: data
        })
        return '';
    }

    getTxSender = async (tx: TransactionMessage): Promise<string> => {
        return tx.sender;
    }

    getTxAmount = async (tx: TransactionMessage): Promise<string> => {
        return tx.value;
    }

    getTx = async (tx: TransactionMessage): Promise<string> => {
        if (!tx.ctx.tx) throw new Error('BVM: getTx - transaction not found')
        return JSON.stringify(tx.ctx.tx);
    }

    getChain = async (tx: TransactionMessage): Promise<string> => {
        return tx.ctx.tx ? tx.ctx.tx.chain : '';
    }

    payFee = async (from: string, fee: string): Promise<string> => {
        if (typeof from !== 'string') throw new Error('BVM: invalid typeof from')

        let amoutBN = new BigNumber(fee);
        let balanceAccount = new BigNumber(await this.internalBalanceOf(from));
        if (amoutBN.isGreaterThan(balanceAccount)) throw new Error('BVM: insuficient funds');
        this.balances.set(from, balanceAccount.minus(amoutBN).toString());
        return '';
    }

    internalTransfer = async (from: string, to: string, amount: string): Promise<string> => {
        if (typeof amount !== 'string') throw new Error('BVM: invalid typeof amount')
        if (typeof from !== 'string') throw new Error('BVM: invalid typeof from')
        if (typeof to !== 'string') throw new Error('BVM: invalid typeof to')

        if (!BywiseHelper.isValidAmount(amount)) throw new Error('BVM: invalid amount')

        let amoutBN = new BigNumber(amount);
        let balanceAccount = new BigNumber(await this.internalBalanceOf(from));
        let balanceRecipient = new BigNumber(await this.internalBalanceOf(to));
        if (amoutBN.isGreaterThan(balanceAccount)) throw new Error('BVM: insuficient funds');
        this.balances.set(from, balanceAccount.minus(amoutBN).toString());
        this.balances.set(to, balanceRecipient.plus(amoutBN).toString());

        return '';
    }

    internalBalanceOf = async (address: string): Promise<string> => {
        if (typeof address !== 'string') throw new Error('BVM: invalid typeof address')

        if (this.balances.has(address)) {
            return this.balances.get(address)
        } else {
            return '0'
        }
    }

    externalContract = async (tx: TransactionMessage, contractAddress: string, amount: string, method: string, ...inputs: string[]): Promise<string> => {
        const contract = await tx.getContract(contractAddress, method, inputs);

        await this.internalTransfer(tx.contractAddress, contractAddress, amount);
        const output = await BywiseRuntime.execInContractSubContext(tx.bywiseRuntime, tx.getContract, tx.ctx, contractAddress, contract.bcc, tx.contractAddress, amount, contract.code)
        return `${output}`;
    }

    balanceTransfer = async (tx: TransactionMessage, recipient: string, amount: string): Promise<string> => {
        return await this.internalTransfer(tx.contractAddress, recipient, amount);
    }

    balanceOf = async (tx: TransactionMessage, address: string): Promise<string> => {
        return await this.internalBalanceOf(address);
    }

    valueSet = async (tx: TransactionMessage, value: string, uuid?: string): Promise<string> => {
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')

        if (value.length > BlockchainDebug.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (uuid) {
            if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')
        } else {
            uuid = await await this.getUUID(tx);
        }
        const key = `V-${tx.contractAddress}-${uuid}`
        this.memory.set(key, value);

        return uuid;
    }

    valueGet = async (tx: TransactionMessage, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')

        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')
        const key = `V-${tx.contractAddress}-${uuid}`

        if (this.memory.has(key)) {
            return this.memory.get(key);
        } else {
            return '';
        }
    }

    mapNew = async (tx: TransactionMessage, defaultValue: string): Promise<string> => {
        if (typeof defaultValue !== 'string') throw new Error('BVM: invalid typeof defaultValue')

        const uuid = await this.getUUID(tx);
        const key = `M-${tx.contractAddress}-${uuid}`
        this.memory.set(key, defaultValue);

        return uuid;
    }

    mapSet = async (tx: TransactionMessage, key: string, value: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')
        if (value.length > BlockchainDebug.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (key.length > BlockchainDebug.MAX_KEY_LENGTH) throw new Error('BVM: key too large')

        const mapKey = `M-${tx.contractAddress}-${uuid}`;
        if (!this.memory.has(mapKey)) throw new Error('BVM: invalid map uuid')

        this.memory.set(`M-${tx.contractAddress}-${uuid}-${key}`, value);

        return '';
    }

    mapGet = async (tx: TransactionMessage, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (key.length > BlockchainDebug.MAX_KEY_LENGTH) throw new Error('BVM: key too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        const mapKey = `M-${tx.contractAddress}-${uuid}`;
        if (!this.memory.has(mapKey)) throw new Error('BVM: invalid map uuid')

        const searchKey = `M-${tx.contractAddress}-${uuid}-${key}`;

        if (this.memory.has(searchKey)) {
            return this.memory.get(searchKey);
        } else {
            return this.memory.get(mapKey);
        }
    }

    mapHas = async (tx: TransactionMessage, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (key.length > BlockchainDebug.MAX_KEY_LENGTH) throw new Error('BVM: key too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        const searchKey = `M-${tx.contractAddress}-${uuid}-${key}`;

        if (this.memory.has(searchKey)) {
            return '1';
        } else {
            return '0';
        }
    }

    mapDel = async (tx: TransactionMessage, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (key.length > BlockchainDebug.MAX_KEY_LENGTH) throw new Error('BVM: key too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        const searchKey = `M-${tx.contractAddress}-${uuid}-${key}`;
        if (this.memory.has(searchKey)) {
            this.memory.delete(searchKey);
        }

        return '';
    }

    listNew = async (tx: TransactionMessage): Promise<string> => {
        const uuid = await this.getUUID(tx);
        this.memory.set(`L-${tx.contractAddress}-${uuid}`, '0');

        return uuid;
    }

    listSize = async (tx: TransactionMessage, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')

        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid');
        if (!this.memory.has(`L-${tx.contractAddress}-${uuid}`)) throw new Error('BVM: list not found');


        return this.memory.get(`L-${tx.contractAddress}-${uuid}`);
    }

    listGet = async (tx: TransactionMessage, index: string, uuid: string): Promise<string> => {
        if (typeof index !== 'string') throw new Error('BVM: invalid typeof index')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (index.length > BlockchainDebug.MAX_KEY_LENGTH) throw new Error('BVM: index too large')
        if (!/^[0-9]+$/.test(index)) throw new Error('BVM: index need be integer number')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let indexBN = new BigNumber(index);
        let size = new BigNumber(this.memory.get(`L-${tx.contractAddress}-${uuid}`));
        if (indexBN.isGreaterThanOrEqualTo(size)) throw new Error('BVM: index out of array');

        const key = `L-${tx.contractAddress}-${uuid}-${indexBN.toFixed(0)}`

        return this.memory.get(key);
    }

    listSet = async (tx: TransactionMessage, index: string, value: string, uuid: string): Promise<string> => {
        if (typeof index !== 'string') throw new Error('BVM: invalid typeof index')
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (value.length > BlockchainDebug.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (index.length > BlockchainDebug.MAX_KEY_LENGTH) throw new Error('BVM: index too large')
        if (!/^[0-9]+$/.test(index)) throw new Error('BVM: index need be integer number')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let indexBN = new BigNumber(index);
        let size = new BigNumber(this.memory.get(`L-${tx.contractAddress}-${uuid}`));
        if (indexBN.isGreaterThanOrEqualTo(size)) throw new Error('BVM: index out of array');

        const key = `L-${tx.contractAddress}-${uuid}-${indexBN.toFixed(0)}`;
        this.memory.set(key, value);

        return '';
    }

    listPush = async (tx: TransactionMessage, value: string, uuid: string): Promise<string> => {
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (value.length > BlockchainDebug.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let size = new BigNumber(this.memory.get(`L-${tx.contractAddress}-${uuid}`));
        let newSize = size.plus(1).toFixed(0);

        this.memory.set(`L-${tx.contractAddress}-${uuid}-${size.toFixed(0)}`, value);
        this.memory.set(`L-${tx.contractAddress}-${uuid}`, newSize);

        return '';
    }

    listPop = async (tx: TransactionMessage, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let size = new BigNumber(this.memory.get(`L-${tx.contractAddress}-${uuid}`));
        if (size.isEqualTo(0)) throw new Error('BVM: array is empty')
        let newSize = size.minus(1).toFixed(0);

        const returnValue = this.memory.get(`L-${tx.contractAddress}-${uuid}-${newSize}`);
        this.memory.delete(`L-${tx.contractAddress}-${uuid}-${newSize}`);
        this.memory.set(`L-${tx.contractAddress}-${uuid}`, newSize);

        return returnValue;
    }

    newProxyAction = async (tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        const proxyParans: ETHProxyData = JSON.parse(proxyData);
        tx.ctx.output.cost += await this.ethProvider.costAction(proxyChain, proxyAction, proxyParans);
        // do nothing
        return '';
    }

    costProxyAction = async (tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        const proxyParans: ETHProxyData = JSON.parse(proxyData);
        const cost = await this.ethProvider.costAction(proxyChain, proxyAction, proxyParans);
        return `${cost}`;
    }

    readProxyAction = async (tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        const proxyParans: ETHProxyData = JSON.parse(proxyData);
        const returnStr = await this.ethProvider.readAction(proxyChain, proxyAction, proxyParans);
        return returnStr;
    }

    getRandom = async (tx: TransactionMessage, type: string): Promise<string> => {
        if (typeof type !== 'string') throw new Error('BVM: invalid typeof type')

        return `${tx.random()}`;
    }

    exposeMethods = () => {
        const methods: BlockchainAction[] = [];
        methods.push({ action: this.log, name: 'log' });
        methods.push({ action: this.emitEvent, name: 'emitEvent' });
        methods.push({ action: this.getThisAddress, name: 'getThisAddress' });
        methods.push({ action: this.getBlockHeight, name: 'getBlockHeight' });
        methods.push({ action: this.getTxCreated, name: 'getTxCreated' });
        methods.push({ action: this.getTxSender, name: 'getTxSender' });
        methods.push({ action: this.getTxAmount, name: 'getTxAmount' });
        methods.push({ action: this.getTx, name: 'getTx' });
        methods.push({ action: this.getChain, name: 'getChain' });
        methods.push({ action: this.externalContract, name: 'externalContract' });
        methods.push({ action: this.balanceTransfer, name: 'balanceTransfer' });
        methods.push({ action: this.balanceOf, name: 'balancesGet' });
        methods.push({ action: this.valueSet, name: 'valueSet' });
        methods.push({ action: this.valueGet, name: 'valueGet' });
        methods.push({ action: this.mapNew, name: 'mapNew' });
        methods.push({ action: this.mapSet, name: 'mapSet' });
        methods.push({ action: this.mapGet, name: 'mapGet' });
        methods.push({ action: this.mapHas, name: 'mapHas' });
        methods.push({ action: this.mapDel, name: 'mapDel' });
        methods.push({ action: this.listNew, name: 'listNew' });
        methods.push({ action: this.listSize, name: 'listSize' });
        methods.push({ action: this.listGet, name: 'listGet' });
        methods.push({ action: this.listSet, name: 'listSet' });
        methods.push({ action: this.listPush, name: 'listPush' });
        methods.push({ action: this.listPop, name: 'listPop' });
        methods.push({ action: this.newProxyAction, name: 'newProxyAction' });
        methods.push({ action: this.costProxyAction, name: 'costProxyAction' });
        methods.push({ action: this.readProxyAction, name: 'readProxyAction' });
        methods.push({ action: this.getRandom, name: 'getRandom' });
        return methods;
    }
}