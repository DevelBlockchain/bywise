import BigNumber from 'bignumber.js';
import BlockchainInterface, { BlockchainAction, TransactionMessage } from './BlockchainInterface';
import { EnvironmentProvider } from '../services/environment.service';
import { ApplicationContext, TransactionEvent, TransactionEventEntry } from '../types';
import { WalletProvider } from '../services/wallet.service';
import { ETHProvider } from '../services/eth.service';
import BywiseRuntime from './BywiseRuntime';
import { ETHAction, ETHProxyData } from '../models';
import { BywiseHelper } from '@bywise/web3';
import { EventsProvider } from '../services/events.service';

export default class BlockchainBywise implements BlockchainInterface {

    static readonly MAX_VALUE_LENGTH = 1000000;
    static readonly MAX_KEY_LENGTH = 2048;

    environmentProvider;
    eventsProvider;
    walletProvider;
    ethProvider;

    constructor(applicationContext: ApplicationContext) {
        this.environmentProvider = new EnvironmentProvider(applicationContext);
        this.eventsProvider = new EventsProvider(applicationContext);
        this.walletProvider = new WalletProvider(applicationContext);
        this.ethProvider = new ETHProvider(applicationContext);
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

    getTxCreated = async (tx: TransactionMessage): Promise<string> => {
        return tx.ctx.tx ? tx.ctx.tx.created + '' : '';
    }

    getBlockHeight = async (tx: TransactionMessage): Promise<string> => {
        return tx.ctx.envContext.blockHeight + '';
    }

    getThisAddress = async (tx: TransactionMessage): Promise<string> => {
        return tx.contractAddress;
    }

    log = async (tx: TransactionMessage, ...parans: string[]): Promise<string> => {
        tx.ctx.output.logs.push(parans.join(' '))
        return '';
    }

    emitEvent = async (tx: TransactionMessage, eventName: string, data: string): Promise<string> => {
        if (!tx.ctx.tx) throw new Error('BVM: event hash not found');
        const eventEntries: TransactionEventEntry[] = [];
        const entries = Object.entries(JSON.parse(data));
        for (let j = 0; j < entries.length; j++) {
            const [entryKey, entryValue] = entries[j];
            if (!/^[a-zA-Z0-9_]{1,64}$/.test(entryKey)) throw new Error(`BVM: invalid event key - "${entryKey}"`);
            if (typeof entryValue !== 'string') throw new Error(`BVM: invalid event typeof - "${typeof entryValue}"`);
            if (!/^[a-zA-Z0-9_\.]{1,64}$/.test(entryValue)) throw new Error(`BVM: invalid event value - "${entryValue}"`);
            eventEntries.push({ key: entryKey, value: entryValue });
        }
        const event: TransactionEvent = {
            contractAddress: tx.contractAddress,
            eventName: eventName,
            entries: eventEntries,
            hash: tx.ctx.tx.hash
        }
        await this.eventsProvider.saveEvents(tx.ctx.envContext, event);
        tx.ctx.output.events.push(event);
        return '';
    }

    externalContract = async (tx: TransactionMessage, contractAddress: string, amount: string, method: string, ...inputs: string[]): Promise<string> => {
        const contract = await tx.getContract(contractAddress, method, inputs);

        await this.balanceTransfer(tx, contractAddress, amount);
        const output = await BywiseRuntime.execInContractSubContext(tx.bywiseRuntime, tx.getContract, tx.ctx, contractAddress, contract.bcc, tx.contractAddress, amount, contract.code)
        return `${output}`;
    }

    balanceTransfer = async (tx: TransactionMessage, recipient: string, amount: string): Promise<string> => {
        if (typeof amount !== 'string') throw new Error('BVM: invalid typeof amount')
        if (typeof recipient !== 'string') throw new Error('BVM: invalid typeof recipient')

        if (!BywiseHelper.isValidAmount(amount)) throw new Error('BVM: invalid amount')
        let amoutBN = new BigNumber(amount);

        let balanceAccount = await this.walletProvider.getWalletBalance(tx.ctx.envContext, tx.contractAddress);
        let balanceRecipient = await this.walletProvider.getWalletBalance(tx.ctx.envContext, recipient);
        if (amoutBN.isGreaterThan(balanceAccount.balance)) throw new Error('BVM: insuficient funds');

        balanceAccount.balance = balanceAccount.balance.minus(new BigNumber(amoutBN));
        balanceRecipient.balance = balanceRecipient.balance.plus(new BigNumber(amoutBN));

        this.walletProvider.setWalletBalance(tx.ctx.envContext, balanceAccount);
        this.walletProvider.setWalletBalance(tx.ctx.envContext, balanceRecipient);
        return '';
    }

    balanceOf = async (tx: TransactionMessage, address: string): Promise<string> => {
        if (typeof address !== 'string') throw new Error('BVM: invalid typeof address')

        const balanceDTO = await this.walletProvider.getWalletBalance(tx.ctx.envContext, address);
        return balanceDTO.balance.toString();
    }

    valueSet = async (tx: TransactionMessage, value: string, uuid?: string): Promise<string> => {
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')

        if (value.length > BlockchainBywise.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (uuid) {
            if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')
        } else {
            uuid = await await this.getUUID(tx);
        }
        const key = `V-${tx.contractAddress}-${uuid}`
        this.environmentProvider.set(tx.ctx.envContext, key, value);
        return uuid;
    }

    valueGet = async (tx: TransactionMessage, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')

        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')
        const key = `V-${tx.contractAddress}-${uuid}`
        if (await this.environmentProvider.has(tx.ctx.envContext, key)) {
            return await this.environmentProvider.get(tx.ctx.envContext, key);
        } else {
            return '';
        }
    }

    mapNew = async (tx: TransactionMessage, defaultValue: string): Promise<string> => {
        if (typeof defaultValue !== 'string') throw new Error('BVM: invalid typeof defaultValue')

        const uuid = await this.getUUID(tx);
        const mapKey = `M-${tx.contractAddress}-${uuid}-default`
        this.environmentProvider.set(tx.ctx.envContext, mapKey, defaultValue);
        return uuid;
    }

    mapSet = async (tx: TransactionMessage, key: string, value: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')
        if (value.length > BlockchainBywise.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (key.length > BlockchainBywise.MAX_KEY_LENGTH) throw new Error('BVM: key too large')

        const mapKey = `M-${tx.contractAddress}-${uuid}-default`;
        const searchKey = `M-${tx.contractAddress}-${uuid}-value-${key.replace(/-/gm, '_')}`;
        if (!await this.environmentProvider.has(tx.ctx.envContext, mapKey)) throw new Error('BVM: invalid map uuid')

        this.environmentProvider.set(tx.ctx.envContext, searchKey, value);
        return '';
    }

    mapGet = async (tx: TransactionMessage, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (key.length > BlockchainBywise.MAX_KEY_LENGTH) throw new Error('BVM: key too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        const mapKey = `M-${tx.contractAddress}-${uuid}-default`;
        const searchKey = `M-${tx.contractAddress}-${uuid}-value-${key.replace(/-/gm, '_')}`;
        if (!await this.environmentProvider.has(tx.ctx.envContext, mapKey)) throw new Error('BVM: invalid map uuid')

        if (await this.environmentProvider.has(tx.ctx.envContext, searchKey)) {
            return await this.environmentProvider.get(tx.ctx.envContext, searchKey);
        } else {
            return await this.environmentProvider.get(tx.ctx.envContext, mapKey);
        }
    }

    mapHas = async (tx: TransactionMessage, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (key.length > BlockchainBywise.MAX_KEY_LENGTH) throw new Error('BVM: key too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        const mapKey = `M-${tx.contractAddress}-${uuid}-default`;
        const searchKey = `M-${tx.contractAddress}-${uuid}-value-${key.replace(/-/gm, '_')}`;

        if (!await this.environmentProvider.has(tx.ctx.envContext, mapKey)) throw new Error('BVM: invalid map uuid')

        if (await this.environmentProvider.has(tx.ctx.envContext, searchKey)) {
            return '1';
        } else {
            return '0';
        }
    }

    mapDel = async (tx: TransactionMessage, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (key.length > BlockchainBywise.MAX_KEY_LENGTH) throw new Error('BVM: key too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        const mapKey = `M-${tx.contractAddress}-${uuid}-default`;
        const searchKey = `M-${tx.contractAddress}-${uuid}-value-${key.replace(/-/gm, '_')}`;

        if (!await this.environmentProvider.has(tx.ctx.envContext, mapKey)) throw new Error('BVM: invalid map uuid')

        if (await this.environmentProvider.has(tx.ctx.envContext, searchKey)) {
            this.environmentProvider.delete(tx.ctx.envContext, searchKey);
        }
        return '';
    }

    listNew = async (tx: TransactionMessage): Promise<string> => {
        const uuid = await this.getUUID(tx);
        this.environmentProvider.set(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`, '0');
        return uuid;
    }

    listSize = async (tx: TransactionMessage, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')

        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid');
        if (!await this.environmentProvider.has(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`)) throw new Error('BVM: list not found');

        return await this.environmentProvider.get(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`);
    }

    listGet = async (tx: TransactionMessage, index: string, uuid: string): Promise<string> => {
        if (typeof index !== 'string') throw new Error('BVM: invalid typeof index')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (index.length > BlockchainBywise.MAX_KEY_LENGTH) throw new Error('BVM: index too large')
        if (!/^[0-9]+$/.test(index)) throw new Error('BVM: index need be integer number')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let indexBN = new BigNumber(index);
        let size = new BigNumber(await this.environmentProvider.get(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`));
        if (indexBN.isGreaterThanOrEqualTo(size)) throw new Error('BVM: index out of array');

        const key = `L-${tx.contractAddress}-${uuid}-value-${indexBN.toFixed(0)}`
        return await this.environmentProvider.get(tx.ctx.envContext, key);
    }

    listSet = async (tx: TransactionMessage, index: string, value: string, uuid: string): Promise<string> => {
        if (typeof index !== 'string') throw new Error('BVM: invalid typeof index')
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (value.length > BlockchainBywise.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (index.length > BlockchainBywise.MAX_KEY_LENGTH) throw new Error('BVM: index too large')
        if (!/^[0-9]+$/.test(index)) throw new Error('BVM: index need be integer number')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let indexBN = new BigNumber(index);
        let size = new BigNumber(await this.environmentProvider.get(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`));
        if (indexBN.isGreaterThanOrEqualTo(size)) throw new Error('BVM: index out of array');

        const key = `L-${tx.contractAddress}-${uuid}-value-${indexBN.toFixed(0)}`;
        this.environmentProvider.set(tx.ctx.envContext, key, value);
        return '';
    }

    listPush = async (tx: TransactionMessage, value: string, uuid: string): Promise<string> => {
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value')
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (value.length > BlockchainBywise.MAX_VALUE_LENGTH) throw new Error('BVM: value too large')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let size = new BigNumber(await this.environmentProvider.get(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`));
        let newSize = size.plus(1).toFixed(0);

        this.environmentProvider.set(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-value-${size.toFixed(0)}`, value);
        this.environmentProvider.set(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`, newSize);
        return '';
    }

    listPop = async (tx: TransactionMessage, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid')
        if (!await this.isUUID(uuid)) throw new Error('BVM: invalid uuid')

        let size = new BigNumber(await this.environmentProvider.get(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`));
        if (size.isEqualTo(0)) throw new Error('BVM: array is empty')
        let newSize = size.minus(1).toFixed(0);

        const returnValue = await this.environmentProvider.get(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-value-${newSize}`);
        this.environmentProvider.delete(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-value-${newSize}`);
        this.environmentProvider.set(tx.ctx.envContext, `L-${tx.contractAddress}-${uuid}-size`, newSize);
        return returnValue;
    }

    newProxyAction = async (tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        const proxyParans: ETHProxyData = JSON.parse(proxyData);
        tx.ctx.output.cost += await this.ethProvider.costAction(proxyChain, proxyAction, proxyParans);
        let bywiseTx = tx.ctx.tx;
        if (!bywiseTx) throw new Error(`BVM: bywise tx not found`);
        const action: ETHAction = {
            proposalId: bywiseTx.hash,
            from: tx.contractAddress,
            proxyChain: proxyChain,
            proxyAction: proxyAction,
            proxyAddresses: proxyParans.addresses,
            proxyValues: proxyParans.values,
            proxyStrings: proxyParans.strings,
            proxyData: proxyParans.data,
            error: [],
            done: false,
        }
        await this.ethProvider.newAction(action);

        if (tx.ctx.enableWriteProxy) {
            await this.ethProvider.registerAction(action);
        }
        return '';
    }

    costProxyAction = async (tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        const proxyParans: ETHProxyData = JSON.parse(proxyData);
        const cost = await this.ethProvider.costAction(proxyChain, proxyAction, proxyParans);
        return `${cost}`;
    }

    readProxyAction = async (tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        if (tx.ctx.enableReadProxy) {
            const proxyParans: ETHProxyData = JSON.parse(proxyData);
            const returnStr = await this.ethProvider.readAction(proxyChain, proxyAction, proxyParans);
            tx.ctx.proxyMock = [returnStr, ...tx.ctx.proxyMock];
            return returnStr;
        } else {
            const returnStr = tx.ctx.proxyMock.pop();
            if (returnStr === undefined) throw new Error('BVM: invalid readProxyAction');
            return returnStr;
        }
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