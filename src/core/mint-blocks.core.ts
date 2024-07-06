import { Block, Wallet } from "@bywise/web3";
import { Slices } from "../models";
import { BlockTree } from "../types";
import helper from "../utils/helper";
import { CoreProvider } from "../services";

export default class MintBlocks {
    public isRun = true;
    private coreProvider;
    private mainWallet;
    private BlockRepository;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.mainWallet = coreProvider.applicationContext.mainWallet;
        this.BlockRepository = coreProvider.applicationContext.database.BlockRepository;
    }

    async run() {
        if (!this.coreProvider.isValidator || !this.coreProvider.hasMinimumBWSToMine) {
            return;
        }
        const now = helper.getNow()
        const currentBlock = this.coreProvider.blockTree.currentMinnedBlock;
        const blockTime = this.coreProvider.blockTime;
        const mainWallet = this.mainWallet;

        let myBlocks;
        let height = currentBlock.height - 1;
        let isLastBlockMined = height <= 1;
        let isCurrentBlockMined = height <= 0;
        let isNextBlockMined = false;
        if (height == -1) {
            height = 0;
        }
        myBlocks = await this.BlockRepository.findByChainAndGreaterHeight(this.coreProvider.chain, height);
        myBlocks = myBlocks.filter(info => info.block.from === mainWallet.address);
        for (let i = 0; i < myBlocks.length; i++) {
            const block = myBlocks[i];
            if (block.block.height == currentBlock.height - 1) {
                isLastBlockMined = true;
            } else if (block.block.height == currentBlock.height) {
                isCurrentBlockMined = true;
            } else if (block.block.height == currentBlock.height + 1) {
                isNextBlockMined = true;
            }
        }

        if (!isLastBlockMined) {
            await this.tryMintLastBlock(currentBlock);
        } else if (!isCurrentBlockMined) {
            await this.tryMintCurrentBlock(currentBlock);
        } else if (!isNextBlockMined && (now >= currentBlock.created + blockTime)) {
            await this.tryMintBlock(currentBlock);
        }
    }

    async tryMintLastBlock(currentBlock: Block) {
        if (currentBlock.lastHash === BlockTree.ZERO_HASH) throw new Error(`Error tryMintLastBlock`);
        const lastBlock = await this.coreProvider.blockProvider.getBlockInfo(currentBlock.lastHash);
        if (lastBlock.block.lastHash === BlockTree.ZERO_HASH) throw new Error(`Error tryMintLastBlock`);
        const lastLastBlock = await this.coreProvider.blockProvider.getBlockInfo(lastBlock.block.lastHash);
        await this.tryMintBlock(lastLastBlock.block);
    }

    async tryMintCurrentBlock(currentBlock: Block) {
        if (currentBlock.lastHash === BlockTree.ZERO_HASH) throw new Error(`Error tryMintCurrentBlock`);

        const lastBlock = await this.coreProvider.blockProvider.getBlockInfo(currentBlock.lastHash);
        await this.tryMintBlock(lastBlock.block);
    }

    async tryMintBlock(fromBlock: Block) {
        const now = helper.getNow()
        const blockTime = this.coreProvider.blockTime;
        const mainWallet = this.mainWallet;

        let from = fromBlock.from;
        if (fromBlock.lastHash !== BlockTree.ZERO_HASH) {
            const lastLastBlock = await this.coreProvider.blockProvider.getBlockInfo(fromBlock.lastHash);
            from = lastLastBlock.block.from;
        }

        const bestSlices = this.coreProvider.blockTree.getBestSlice(from, fromBlock.height + 1);
        const slices: Slices[] = [];
        let end = false;
        for (let i = 0; i < bestSlices.length; i++) {
            const slice = bestSlices[i];
            const sliceInfo = await this.coreProvider.slicesProvider.getSliceInfo(slice.hash);
            if (!sliceInfo.isExecuted) {
                break;
            }
            slices.push(sliceInfo);
            if (sliceInfo.slice.end) {
                end = true;
                break;
            }
        }
        if (!end && now < fromBlock.created + blockTime * 2) {
            return;
        }
        if(!end) {
            this.coreProvider.applicationContext.logger.warn(`mint-blocks - end slice not found - mint by time`);
        }
        await this.mintBlock(fromBlock, mainWallet, slices);
    }

    private async mintBlock(fromBlock: Block, mainWallet: Wallet, bestSlices: Slices[]) {
        const isConnected = this.coreProvider.network.isConnected();
        if (!isConnected) {
            this.coreProvider.applicationContext.logger.error(`mint-blocks - Node has disconnected!`);
            return;
        }

        let transactionsCount = 0;
        let sliceHashList = [];

        for (let i = 0; i < bestSlices.length; i++) {
            const sliceInfo = bestSlices[i];
            transactionsCount += sliceInfo.slice.transactionsCount;
            sliceHashList.push(sliceInfo.slice.hash);
        }

        const block = new Block();
        block.version = '2';
        block.transactionsCount = transactionsCount;
        block.chain = this.coreProvider.chain;
        block.created = Math.floor(Date.now() / 1000);
        block.externalTxID = [];
        block.from = mainWallet.address;
        block.height = fromBlock.height + 1;
        block.lastHash = fromBlock.hash;
        block.slices = sliceHashList;
        block.hash = block.toHash();
        block.sign = await mainWallet.signHash(block.hash);

        this.coreProvider.applicationContext.logger.info(`mint block - height: ${block.height} - slices: ${block.slices.length} - transactions: ${block.transactionsCount} - hash: ${block.hash.substring(0, 10)}`)
        const blockInfo = await this.coreProvider.blockProvider.saveNewBlock(block);
        blockInfo.isComplete = true;
        blockInfo.isExecuted = false;
        this.coreProvider.blockTree.addBlock(block);
        await this.coreProvider.blockProvider.updateBlock(blockInfo);
        await this.coreProvider.blockProvider.executeCompleteBlockByHash(this.coreProvider.blockTree, blockInfo.block.hash);
        return block;
    }
}