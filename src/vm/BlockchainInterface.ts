import { SimulateDTO } from "../types";
import { BywiseContractContext, BywiseRuntimeInstance } from "./BywiseRuntime";

export type GetContract = (address: string, method: string, parans: string[]) => Promise<{ bcc: BywiseContractContext, code: string, view: boolean, payable: boolean }>

export type TransactionMessage = {
    contractAddress: string;
    sender: string;
    value: string;
    random: any;
    ctx: SimulateDTO;
    bywiseRuntime: BywiseRuntimeInstance;
    getContract: GetContract
}

export type BlockchainAction = {
    action: ((tx: TransactionMessage, ...parans: string[]) => Promise<string>),
    name: string,
}

export default interface BlockchainInterface {

    getTxSender(tx: TransactionMessage): Promise<string>;

    getTxAmount(tx: TransactionMessage): Promise<string>;

    getChain(tx: TransactionMessage): Promise<string>;

    getTxCreated(tx: TransactionMessage): Promise<string>;

    getTx(tx: TransactionMessage): Promise<string>;

    getBlockHeight(tx: TransactionMessage): Promise<string>;

    getThisAddress(tx: TransactionMessage): Promise<string>;

    log(tx: TransactionMessage, ...parans: string[]): Promise<string>;

    emitEvent(tx: TransactionMessage, event: string, json: string): Promise<string>;

    externalContract(tx: TransactionMessage, contractAddress: string, amount: string, method: string, ...parans: string[]): Promise<string>;

    balanceTransfer(tx: TransactionMessage, recipient: string, amount: string): Promise<string>;

    balanceOf(tx: TransactionMessage, address: string): Promise<string>;

    valueSet(tx: TransactionMessage, value: string, uuid?: string): Promise<string>;

    valueGet(tx: TransactionMessage, uuid: string): Promise<string>;

    mapNew(tx: TransactionMessage, defaultValue: string): Promise<string>;

    mapSet(tx: TransactionMessage, key: string, value: string, uuid: string): Promise<string>;

    mapGet(tx: TransactionMessage, key: string, uuid: string): Promise<string>;

    mapHas(tx: TransactionMessage, key: string, uuid: string): Promise<string>;

    mapDel(tx: TransactionMessage, key: string, uuid: string): Promise<string>;

    listNew(tx: TransactionMessage): Promise<string>;

    listSize(tx: TransactionMessage, uuid: string): Promise<string>;

    listGet(tx: TransactionMessage, index: string, uuid: string): Promise<string>;

    listSet(tx: TransactionMessage, index: string, value: string, uuid: string): Promise<string>;

    listPush(tx: TransactionMessage, value: string, uuid: string): Promise<string>;

    listPop(tx: TransactionMessage, uuid: string): Promise<string>;

    getRandom(tx: TransactionMessage, type: string): Promise<string>;

    newProxyAction(tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string>;

    costProxyAction(tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string>;
    
    readProxyAction(tx: TransactionMessage, proxyChain: string, proxyAction: string, proxyData: string): Promise<string>;

    exposeMethods(): BlockchainAction[];
}