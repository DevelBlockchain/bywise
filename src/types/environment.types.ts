import { Blocks, Slices, Transaction } from "../models"

export class BlockTree {

    public static ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

    public readonly chain: string;

    public blockTreeLastMinedHash: string = BlockTree.ZERO_HASH;

    private hashesMap: Map<string, string> = new Map();
    private treeMap: Map<string, string[]> = new Map();

    private blockInfo: Map<string, Blocks> = new Map();
    public blockInfoList: Blocks[] = [];

    private sliceInfo: Map<string, Slices> = new Map();
    public sliceInfoList: Slices[] = [];

    private txInfo: Map<string, Transaction> = new Map();
    public txInfoList: Transaction[] = [];

    constructor(chain: string) {
        this.chain = chain;
    }

    addHash(lastHash: string, hash: string) {
        this.hashesMap.set(hash, lastHash);
        let list = this.treeMap.get(lastHash);
        if (list !== undefined) {
            list.push(hash);
        } else {
            this.treeMap.set(lastHash, [hash]);
        }
    }

    delHash(hash: string) {
        let list = this.treeMap.get(hash);
        if (list !== undefined) {
            list.forEach(h => this.addHash(BlockTree.ZERO_HASH, h));
            this.treeMap.delete(hash);
        }
        this.hashesMap.delete(hash);
    }

    setTxInfo(info: Transaction) {
        if (this.txInfo.has(info.tx.hash)) {
            this.txInfoList = this.txInfoList.filter(i => i.tx.hash !== info.tx.hash);
        }
        this.txInfo.set(info.tx.hash, info);
        this.txInfoList.push(info);
    }

    setSliceInfo(info: Slices) {
        if (this.sliceInfo.has(info.slice.hash)) {
            this.sliceInfoList = this.sliceInfoList.filter(i => i.slice.hash !== info.slice.hash);
        }
        this.sliceInfo.set(info.slice.hash, info);
        this.sliceInfoList.push(info);
    }

    setBlockInfo(info: Blocks) {
        if (this.blockInfo.has(info.block.hash)) {
            this.blockInfoList = this.blockInfoList.filter(i => i.block.hash !== info.block.hash);
        }
        this.blockInfo.set(info.block.hash, info);
        this.blockInfoList.push(info);
    }

    getLastHash(hash: string): string {
        const lastHash = this.hashesMap.get(hash);
        if (lastHash == undefined) throw new Error(`hash ${hash} not found in block tree`);
        return lastHash
    }

    getBlockInfo(hash: string): Blocks | null {
        let info = this.blockInfo.get(hash);
        if (info !== undefined) {
            return info;
        }
        return null;
    }

    getSliceInfo(hash: string): Slices | null {
        let info = this.sliceInfo.get(hash);
        if (info !== undefined) {
            return info;
        }
        return null;
    }

    getTxInfo(hash: string): Transaction | null {
        let info = this.txInfo.get(hash);
        if (info !== undefined) {
            return info;
        }
        return null;
    }

    removeBlockInfo(hash: string): void {
        this.blockInfoList = this.blockInfoList.filter(i => i.block.hash !== hash);
        this.blockInfo.delete(hash);
    }

    removeSliceInfo(hash: string): void {
        this.sliceInfoList = this.sliceInfoList.filter(i => i.slice.hash !== hash);
        this.sliceInfo.delete(hash);
    }

    removeTxInfo(hash: string): void {
        this.txInfoList = this.txInfoList.filter(i => i.tx.hash !== hash);
        this.txInfo.delete(hash);
    }
}