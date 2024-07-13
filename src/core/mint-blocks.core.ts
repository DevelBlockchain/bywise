import { Block, Wallet } from "@bywise/web3";
import { Blocks, Slices } from "../models";
import { BlockchainStatus, ZERO_HASH } from "../types";
import helper from "../utils/helper";
import { CoreProvider } from "../services";
import { Task } from "../types";

export default class MintBlocks implements Task {
    public isRun = true;
    private coreProvider;
    private mainWallet;
    private BlockRepository;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.mainWallet = coreProvider.applicationContext.mainWallet;
        this.BlockRepository = coreProvider.applicationContext.database.BlockRepository;
    }

    async start() {
    }

    async stop() {
    }

    async run() {
        if (!this.coreProvider.isValidator || !this.coreProvider.hasMinimumBWSToMine) {
            return false;
        }
        const now = helper.getNow()
        const currentBlock = this.coreProvider.currentBlock;
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
            return await this.tryMintLastBlock(currentBlock);
        } else if (!isCurrentBlockMined) {
            return await this.tryMintCurrentBlock(currentBlock);
        } else if (!isNextBlockMined && (now >= currentBlock.created + blockTime)) {
            return await this.tryMintBlock(currentBlock);
        } else {
            return false;
        }
    }

    async tryMintLastBlock(currentBlock: Block): Promise<boolean> {
        if (currentBlock.lastHash === ZERO_HASH) throw new Error(`Error tryMintLastBlock`);
        const lastBlock = await this.coreProvider.blockProvider.getBlockInfo(currentBlock.lastHash);
        if (lastBlock.block.lastHash === ZERO_HASH) throw new Error(`Error tryMintLastBlock`);
        const lastLastBlock = await this.coreProvider.blockProvider.getBlockInfo(lastBlock.block.lastHash);
        return await this.tryMintBlock(lastLastBlock.block);
    }

    async tryMintCurrentBlock(currentBlock: Block): Promise<boolean> {
        if (currentBlock.lastHash === ZERO_HASH) throw new Error(`Error tryMintCurrentBlock`);

        const lastBlock = await this.coreProvider.blockProvider.getBlockInfo(currentBlock.lastHash);
        return await this.tryMintBlock(lastBlock.block);
    }

    async tryMintBlock(fromBlock: Block): Promise<boolean> {
        const now = helper.getNow()
        const blockTime = this.coreProvider.blockTime;
        const mainWallet = this.mainWallet;

        let from = fromBlock.from;
        if (fromBlock.lastHash !== ZERO_HASH) {
            const lastLastBlock = await this.coreProvider.blockProvider.getBlockInfo(fromBlock.lastHash);
            from = lastLastBlock.block.from;
        }
        const slices = await this.coreProvider.slicesProvider.getByHeight(this.coreProvider.chain, from, fromBlock.height + 1);
        let end = false;
        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];
            if (sliceInfo.slice.end) {
                end = true;
            }
        }
        if (!end && now < fromBlock.created + blockTime * 2) {
            return false;
        }
        if (!end) {
            this.coreProvider.applicationContext.logger.warn(`mint-blocks - end slice not found - mint by time`);
        }
        return await this.mintBlock(fromBlock, mainWallet, slices);
    }

    private async mintBlock(fromBlock: Block, mainWallet: Wallet, bestSlices: Slices[]): Promise<boolean> {
        const isConnected = this.coreProvider.network.isConnected();
        if (!isConnected) {
            this.coreProvider.applicationContext.logger.error(`mint-blocks - Node has disconnected!`);
            return false;
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

        const blockInfo: Blocks = {
            block: block,
            status: BlockchainStatus.TX_MEMPOOL,
            countTrys: 0,
            isComplete: true,
            isExecuted: false,
            distance: '',
        }
        this.coreProvider.applicationContext.logger.info(`mint block - height: ${block.height} - slices: ${block.slices.length} - transactions: ${block.transactionsCount} - hash: ${block.hash.substring(0, 10)}`)
        await this.coreProvider.blockProvider.executeCompleteBlockByHash(blockInfo);
        return true;
    }
}