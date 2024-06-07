import { Block, Slice } from "@bywise/web3";
import { Environment } from "../models";
import { BywiseRuntimeInstance } from "../vm/BywiseRuntime";

export type NodeBlockTree = {
    hash: string,
    height: number,
    lastContextHash: string
}

export type NodeSliceTree = {
    hash: string,
    from: string,
    transactionsCount: number,
    height: number,
    blockHeight: number,
    end: boolean
}

export class BlockTree {

    public static ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

    public readonly chain: string;

    public currentMinnedBlock: Block = new Block();
    public bestSlice: Slice | null = null;
    public minnedBlockList: Map<number, NodeBlockTree> = new Map();

    public tree: NodeBlockTree = {
        hash: BlockTree.ZERO_HASH,
        height: -1,
        lastContextHash: BlockTree.ZERO_HASH
    };

    public blockMap: Map<string, NodeBlockTree> = new Map();
    public sliceMap: Map<string, NodeSliceTree> = new Map();
    public sliceByHeightMap: Map<number, NodeSliceTree[]> = new Map();

    constructor(chain: string) {
        this.chain = chain;
        this.blockMap.set(this.tree.hash, this.tree);
    }

    addBlock(blockInfo: { lastHash: string, hash: string, height: number }) {
        const slice = this.sliceMap.get(blockInfo.lastHash);
        if (!slice) {
            const block = this.blockMap.get(blockInfo.lastHash);
            if (!block) {
                throw new Error(`lastContextHash not found ${blockInfo.lastHash}`);
            }
        }
        let block = this.blockMap.get(blockInfo.hash);
        if (!block) {
            block = {
                hash: blockInfo.hash,
                height: blockInfo.height,
                lastContextHash: blockInfo.lastHash
            }
            this.blockMap.set(blockInfo.hash, block);
        }
    }

    addSlice(slice: NodeSliceTree) {
        let sliceInfo = this.sliceMap.get(slice.hash);
        if (!sliceInfo) {
            sliceInfo = {
                hash: slice.hash,
                from: slice.from,
                transactionsCount: slice.transactionsCount,
                height: slice.height,
                blockHeight: slice.blockHeight,
                end: slice.end,
            }
            this.sliceMap.set(slice.hash, sliceInfo);
            let list = this.sliceByHeightMap.get(slice.blockHeight);
            if (!list) {
                list = [];
            }
            list.push(sliceInfo);
            this.sliceByHeightMap.set(slice.blockHeight, list);
        }
    }

    setMinnedBlock(block: Block) {
        let blockNode = this.blockMap.get(block.hash);
        if (!blockNode) throw new Error(`blockNode not found ${block.hash}`);
        this.minnedBlockList.set(block.height, blockNode);
        if (this.currentMinnedBlock.height < block.height) {
            this.bestSlice = null;
        }
        if (this.currentMinnedBlock.height <= block.height) {
            this.currentMinnedBlock = block;
        }
    }

    delBlock(hash: string) {
        let block = this.blockMap.get(hash);
        if (block) {
            this.blockMap.delete(hash);
        };
    }

    getLastHash(contextHash: string) {
        let block = this.blockMap.get(contextHash);
        if (block) {
            return block.lastContextHash;
        }
        let slice = this.sliceMap.get(contextHash);
        if (slice) {
            const sliceHeight = slice.height - 1;
            if (sliceHeight == -1) {
                if (slice.blockHeight - 1 >= 0) {
                    const minnedBlock = this.minnedBlockList.get(slice.blockHeight - 1);
                    if (!minnedBlock) throw new Error(`last minned block not found ${contextHash} - height: ${slice.blockHeight - 1}`);
                    return minnedBlock.hash;
                } else {
                    return BlockTree.ZERO_HASH;
                }
            } else {
                let slices = this.sliceByHeightMap.get(slice.blockHeight);
                if (!slices) {
                    slices = [];
                }
                let bestSlice: NodeSliceTree | null = null;
                for (let i = 0; i < slices.length; i++) {
                    const sliceInfo = slices[i];
                    if (sliceInfo.from === slice.from && sliceInfo.height === sliceHeight) {
                        if (bestSlice === null || sliceInfo.transactionsCount > bestSlice.transactionsCount) {
                            bestSlice = sliceInfo;
                        }
                    }
                }
                if (!bestSlice) throw new Error(`last slice not found ${contextHash}`);
                return bestSlice.hash;
            }
        }
        throw new Error(`contextHash not found ${contextHash}`);
    }

    getBlockList(hash: string): string[] {
        if (hash == BlockTree.ZERO_HASH) {
            return [hash];
        }
        let block = this.blockMap.get(hash);
        if (block) {
            let hashList = this.getBlockList(block.lastContextHash);
            hashList.push(hash)
            return hashList;
        }
        throw new Error(`block not found ${hash}`);
    }

    getSliceList(hash: string): NodeSliceTree[] {
        let slice = this.sliceMap.get(hash);
        if (!slice) throw new Error(`slice not found ${hash}`);
        let slices = this.sliceByHeightMap.get(slice.blockHeight);
        if (!slices) {
            slices = [];
        }
        let bestSlices: NodeSliceTree[] = [];
        let bestSlice: NodeSliceTree | null = null;
        for (let sliceHeight = 0; sliceHeight < slice.height; sliceHeight++) {
            bestSlice = null;
            for (let i = 0; i < slices.length; i++) {
                const sliceInfo = slices[i];
                if (sliceInfo.from === slice.from && sliceInfo.height === sliceHeight) {
                    if (sliceInfo.end) {
                        bestSlice = sliceInfo;
                    } else if (bestSlice === null || sliceInfo.transactionsCount > bestSlice.transactionsCount) {
                        bestSlice = sliceInfo;
                    }
                }
            }
            if (!bestSlice) return [];
            bestSlices.push(bestSlice);
        }
        bestSlices.push(slice);
        return bestSlices;
    }

    getBestSlice(from: string, blockHeight: number): NodeSliceTree[] {
        let slices = this.sliceByHeightMap.get(blockHeight);
        if (!slices) {
            slices = [];
        }
        let bestSlices: NodeSliceTree[] = [];
        let bestSlice: NodeSliceTree | null = null;
        let sliceHeight = 0;
        while (true) {
            bestSlice = null;
            for (let i = 0; i < slices.length; i++) {
                const sliceInfo = slices[i];
                if (sliceInfo.from === from && sliceInfo.height === sliceHeight) {
                    if (sliceInfo.end) {
                        bestSlice = sliceInfo;
                        bestSlices.push(bestSlice);
                        return bestSlices;
                    } else if (bestSlice === null || sliceInfo.transactionsCount > bestSlice.transactionsCount) {
                        bestSlice = sliceInfo;
                    }
                }
            }
            sliceHeight++;
            if (!bestSlice) {
                return bestSlices;
            }
            bestSlices.push(bestSlice);
        }
    }
}

export class EnvironmentContext {
    public static readonly MAIN_CONTEXT_HASH = 'main_context';
    
    public blockTree: BlockTree;
    public blockHeight: number;
    public fromContextHash: string;
    public executedContracts: Map<string, BywiseRuntimeInstance> = new Map();
    public setMainKeys: Map<string, Environment> = new Map();
    public getMainKeys: Map<string, Environment> = new Map();
    public setStageKeys: Map<string, Environment> = new Map();
    public getStageKeys: Map<string, Environment> = new Map();

    constructor(blockTree: BlockTree, blockHeight: number, fromContextHash: string) {
        this.blockTree = blockTree;
        this.blockHeight = blockHeight;
        this.fromContextHash = fromContextHash;
    }

    async dispose() {
        for (let [contract, br] of this.executedContracts) {
            await br.dispose();
        }
        this.setStageKeys.clear();
        this.getStageKeys.clear();
        this.setMainKeys.clear();
        this.getMainKeys.clear();
        this.executedContracts.clear();
    }
}