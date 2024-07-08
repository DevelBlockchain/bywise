import helper from '../utils/helper';
import { RuntimeContext } from './RuntimeContext';
import { BywiseRuntimeInstance } from './BywiseRuntimeInstance';
import BigNumber from 'bignumber.js';
import { TransactionEvent, TransactionEventEntry } from '@bywise/web3';

export type BlockchainAction = {
    action: ((vm: BywiseRuntimeInstance, ctx: RuntimeContext, ...parans: any[]) => Promise<string>),
    name: string,
}

export default class BlockchainInterface {

    static readonly MAX_VALUE_LENGTH = 1000000;
    static readonly MAX_INDEX_LENGTH = 20;

    getUUID = async (ctx: RuntimeContext) => {
        let eventIntexString = await ctx.get(`${ctx.contractAddress}-CI`);
        let index = BigInt(eventIntexString ? eventIntexString : '0');
        index++;
        const uuid = index.toString();
        await ctx.set(`${ctx.contractAddress}-CI`, index.toString());
        return uuid;
    }

    isUUID = (uuid: string) => {
        return /^[0-9]{1,20}$/.test(uuid);
    }

    getTxSender = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        return ctx.sender;
    }

    getTxAmount = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        return ctx.amount;
    }

    getTx = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        return JSON.stringify(ctx.tx);
    }

    getChain = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        return ctx.tx.chain;
    }

    getTxCreated = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        return ctx.tx.created.toString();
    }

    getBlockHeight = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        return ctx.env.blockHeight + '';
    }

    getThisAddress = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        return ctx.contractAddress;
    }

    log = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, ...parans: string[]): Promise<string> => {
        ctx.logs.push(parans.join(' '))
        return '';
    }

    emitEvent = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, eventName: string, data: string): Promise<string> => {
        if (eventName.length == 0) throw new Error(`BVM: invalid event name - "${eventName}"`);
        const eventEntries: TransactionEventEntry[] = [];
        const entries = Object.entries(JSON.parse(data));
        for (let j = 0; j < entries.length; j++) {
            const [entryKey, entryValue] = entries[j];
            if (entryKey.length == 0) throw new Error(`BVM: invalid event key - "${entryKey}"`);
            if (Array.isArray(entryValue)) {
                for (let i = 0; i < entryValue.length; i++) {
                    let value = entryValue[i];
                    if (typeof value !== 'string') throw new Error(`BVM: invalid event typeof - "${typeof value}"`);
                    if (value.length == 0) throw new Error(`BVM: invalid event value - "${value}"`);
                    eventEntries.push({ key: entryKey, value: value });
                }
            } else {
                if (typeof entryValue !== 'string') throw new Error(`BVM: invalid event typeof - "${typeof entryValue}"`);
                if (entryValue.length == 0) throw new Error(`BVM: invalid event value - "${entryValue}"`);
                eventEntries.push({ key: entryKey, value: entryValue });
            }
        }
        const event: TransactionEvent = {
            contractAddress: ctx.contractAddress,
            eventName: eventName,
            entries: eventEntries,
            hash: ctx.tx.hash
        }
        ctx.events.push(event);
        return '';
    }

    externalContract = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, contractAddress: string, amount: string, method: string, ...inputs: string[]): Promise<string> => {
        const contract = await vm.getContract(ctx, amount, contractAddress, method, inputs);

        if (!(new BigNumber(amount)).isZero()) {
            if (!contract.payable) throw new Error(`Method not is payable`);
            ctx.balanceSub(ctx.contractAddress, amount);
            ctx.balanceAdd(contractAddress, amount);
        }

        let currentSender = ctx.sender;
        let currentAmount = ctx.amount;
        let lastAddress = ctx.contractAddress;
        ctx.virtualMachineStack++;
        ctx.sender = ctx.contractAddress;
        ctx.amount = amount;

        if(ctx.virtualMachineStack > 5) throw new Error('VM: Stack Overflow');

        const result = await vm.exec(ctx, contract.wc, contract.exeCode);
        if (result.error) throw new Error(result.error);

        ctx.virtualMachineStack--;
        ctx.sender = currentSender;
        ctx.amount = currentAmount;
        ctx.contractAddress = lastAddress;
        return `${result.result}`;
    }

    balanceTransfer = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, recipient: string, amount: string): Promise<string> => {
        ctx.balanceSub(ctx.contractAddress, amount);
        ctx.balanceAdd(recipient, amount);
        return '';
    }

    balanceOf = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, address: string): Promise<string> => {
        if (typeof address !== 'string') throw new Error('BVM: invalid typeof address');

        const balance = await ctx.get(`${address}-WB`);
        if (balance) {
            return balance;
        }
        return '0';
    }

    valueSet = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, value: string, uuid?: string): Promise<string> => {
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value');

        if (value.length > BlockchainInterface.MAX_VALUE_LENGTH) throw new Error('BVM: value too large');
        if (uuid) {
            if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');
        } else {
            uuid = await this.getUUID(ctx);
        }
        const key = `${ctx.contractAddress}-V-${uuid}`
        await ctx.set(key, value);
        return uuid;
    }

    valueGet = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');

        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');
        const key = `${ctx.contractAddress}-V-${uuid}`;
        return await ctx.get(key);
    }

    mapNew = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, defaultValue: string): Promise<string> => {
        if (typeof defaultValue !== 'string') throw new Error('BVM: invalid typeof defaultValue');

        const uuid = await this.getUUID(ctx);
        const mapKey = `${ctx.contractAddress}-MD-${uuid}`
        await ctx.set(mapKey, defaultValue);
        return uuid;
    }

    mapSet = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, key: string, value: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key');
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value');
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');
        if (value.length > BlockchainInterface.MAX_VALUE_LENGTH) throw new Error('BVM: value too large');
        if (key.length == 0) throw new Error('BVM: invalid map key');

        const mapKey = `${ctx.contractAddress}-MD-${uuid}`;
        const searchKey = `${ctx.contractAddress}-MV-${uuid}-${helper.stringToHash(key)}`;
        if (!await ctx.has(mapKey)) throw new Error('BVM: invalid map uuid')
        await ctx.set(searchKey, value);
        return '';
    }

    mapGet = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key');
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (key.length == 0) throw new Error('BVM: invalid map key');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');

        const mapKey = `${ctx.contractAddress}-MD-${uuid}`;
        const searchKey = `${ctx.contractAddress}-MV-${uuid}-${helper.stringToHash(key)}`;
        if (!await ctx.has(mapKey)) throw new Error('BVM: invalid map uuid')

        if (await ctx.has(searchKey)) {
            return await ctx.get(searchKey);
        } else {
            return await ctx.get(mapKey);
        }
    }

    mapHas = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key');
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (key.length == 0) throw new Error('BVM: invalid map key');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');

        const mapKey = `${ctx.contractAddress}-MD-${uuid}`;
        const searchKey = `${ctx.contractAddress}-MV-${uuid}-${helper.stringToHash(key)}`;

        if (!await ctx.has(mapKey)) throw new Error('BVM: invalid map uuid')
        if (await ctx.has(searchKey)) {
            return '1';
        } else {
            return '0';
        }
    }

    mapDel = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, key: string, uuid: string): Promise<string> => {
        if (typeof key !== 'string') throw new Error('BVM: invalid typeof key');
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (key.length == 0) throw new Error('BVM: invalid map key');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');

        const mapKey = `${ctx.contractAddress}-MD-${uuid}`;
        const searchKey = `${ctx.contractAddress}-MV-${uuid}-${helper.stringToHash(key)}`;
        if (!await ctx.has(mapKey)) throw new Error('BVM: invalid map uuid');

        if (await ctx.has(searchKey)) {
            await ctx.delete(searchKey);
        }
        return '';
    }

    listNew = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext): Promise<string> => {
        const uuid = await this.getUUID(ctx);
        await ctx.set(`${ctx.contractAddress}-LS-${uuid}`, '0');
        return uuid;
    }

    listSize = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');
        const sizeSTR = await ctx.get(`${ctx.contractAddress}-LS-${uuid}`);
        if (!sizeSTR) throw new Error('BVM: invalid array uuid');
        return sizeSTR;
    }

    listGet = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, index: string, uuid: string): Promise<string> => {
        if (typeof index !== 'string') throw new Error('BVM: invalid typeof index');
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (index.length > BlockchainInterface.MAX_INDEX_LENGTH) throw new Error('BVM: index too large');
        if (!/^[0-9]+$/.test(index)) throw new Error('BVM: index need be integer number');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');

        const sizeSTR = await ctx.get(`${ctx.contractAddress}-LS-${uuid}`);
        if (!sizeSTR) throw new Error('BVM: invalid array uuid');
        const size = BigInt(sizeSTR);
        const indexBN = BigInt(index);
        if (indexBN >= size) throw new Error('BVM: index out of array');

        const key = `${ctx.contractAddress}-LV-${uuid}-${indexBN.toString()}`
        return await ctx.get(key);
    }

    listSet = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, index: string, value: string, uuid: string): Promise<string> => {
        if (typeof index !== 'string') throw new Error('BVM: invalid typeof index');
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value');
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (value.length > BlockchainInterface.MAX_VALUE_LENGTH) throw new Error('BVM: value too large');
        if (index.length > BlockchainInterface.MAX_INDEX_LENGTH) throw new Error('BVM: index too large');
        if (!/^[0-9]+$/.test(index)) throw new Error('BVM: index need be integer number');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');

        const sizeSTR = await ctx.get(`${ctx.contractAddress}-LS-${uuid}`);
        if (!sizeSTR) throw new Error('BVM: invalid array uuid');
        const size = BigInt(sizeSTR);
        const indexBN = BigInt(index);
        if (indexBN >= size) throw new Error('BVM: index out of array');

        const key = `${ctx.contractAddress}-LV-${uuid}-${indexBN.toString()}`;
        await ctx.set(key, value);
        return '';
    }

    listPush = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, value: string, uuid: string): Promise<string> => {
        if (typeof value !== 'string') throw new Error('BVM: invalid typeof value');
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (value.length > BlockchainInterface.MAX_VALUE_LENGTH) throw new Error('BVM: value too large');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');

        const sizeSTR = await ctx.get(`${ctx.contractAddress}-LS-${uuid}`);
        if (!sizeSTR) throw new Error('BVM: invalid array uuid');
        const size = BigInt(sizeSTR);
        const newSize = (size + 1n).toString();
        if (newSize.length > BlockchainInterface.MAX_INDEX_LENGTH) throw new Error('BVM: index too large');

        await ctx.set(`${ctx.contractAddress}-LV-${uuid}-${size.toString()}`, value);
        await ctx.set(`${ctx.contractAddress}-LS-${uuid}`, newSize);
        return size.toString();
    }

    listPop = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, uuid: string): Promise<string> => {
        if (typeof uuid !== 'string') throw new Error('BVM: invalid typeof uuid');
        if (!this.isUUID(uuid)) throw new Error('BVM: invalid uuid');

        const sizeSTR = await ctx.get(`${ctx.contractAddress}-LS-${uuid}`);
        if (!sizeSTR) throw new Error('BVM: invalid array uuid');
        const size = BigInt(sizeSTR);
        if (size == 0n) throw new Error('BVM: array is empty');
        const newSize = (size - 1n).toString();

        const returnValue = await ctx.get(`${ctx.contractAddress}-LV-${uuid}-${newSize}`);
        await ctx.delete(`${ctx.contractAddress}-LV-${uuid}-${newSize}`);
        await ctx.set(`${ctx.contractAddress}-LS-${uuid}`, newSize);
        return returnValue;
    }

    newProxyAction = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        throw new Error(`BVM: not implemented`);
    }

    costProxyAction = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        throw new Error(`BVM: not implemented`);
    }

    readProxyAction = async (vm: BywiseRuntimeInstance, ctx: RuntimeContext, proxyChain: string, proxyAction: string, proxyData: string): Promise<string> => {
        throw new Error(`BVM: not implemented`);
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
        return methods;
    }
}