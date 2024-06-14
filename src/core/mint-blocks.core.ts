import { Block, Wallet } from "@bywise/web3";
import { Blocks, Slices } from "../models";
import BigNumber from "bignumber.js";
import { CoreContext } from "../types";
import helper from "../utils/helper";
import { BlockTree } from "../types/environment.types";
import PipelineChain from "./pipeline-chain.core";
import { RequestKeys } from "../datasource/message-queue";

export default class MintBlocks {
    public isRun = true;
    private coreContext;
    private pipelineChain;
    private BlockRepository;

    constructor(coreContext: CoreContext, pipelineChain: PipelineChain) {
        this.coreContext = coreContext;
        this.pipelineChain = pipelineChain;
        this.BlockRepository = coreContext.applicationContext.database.BlockRepository;
    }

    async run() {
        const now = helper.getNow()
        const currentBlock = this.coreContext.blockTree.currentMinnedBlock;
        const blockTime = this.coreContext.blockTime;
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        let myBlocks = await this.BlockRepository.findByChainAndHeight(this.coreContext.chain, currentBlock.height);
        myBlocks = myBlocks.filter(info => info.block.from === mainWallet.address);

        if (myBlocks.length === 0) {
            await this.tryMintCurrentBlock(currentBlock);
        }
        if (now >= currentBlock.created + blockTime) {
            await this.tryMintBlock(currentBlock);
        }
    }

    async tryMintCurrentBlock(currentBlock: Block) {
        if (currentBlock.lastHash === BlockTree.ZERO_HASH) {
            return;
        }

        const lastBlock = await this.coreContext.blockProvider.getBlockInfo(currentBlock.lastHash);
        await this.tryMintBlock(lastBlock.block);
    }

    async tryMintBlock(fromBlock: Block) {
        const now = helper.getNow()
        const blockTime = this.coreContext.blockTime;
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        const isMinner = await this.coreContext.configsProvider.isSlowValidator(this.coreContext.blockTree, fromBlock.hash, fromBlock.height, mainWallet.address);
        if (!isMinner) {
            this.coreContext.applicationContext.logger.verbose(`not enabled to mining blocks on chain ${this.coreContext.chain}`);
            this.isRun = false;
            return;
        }
        const minValue = await this.coreContext.configsProvider.getSlowConfigByName(this.coreContext.blockTree, fromBlock.hash, fromBlock.height, 'min-bws-block');
        const balanceDTO = await this.coreContext.walletProvider.getSlowWalletBalance(this.coreContext.blockTree, fromBlock.hash, mainWallet.address);
        if (balanceDTO.balance.isLessThan(new BigNumber(minValue.value))) {
            this.coreContext.applicationContext.logger.verbose(`not enabled to mining blocks on chain ${this.coreContext.chain} - low balance`);
            return;
        }

        let myBlocks = await this.BlockRepository.findByChainAndHeight(this.coreContext.chain, fromBlock.height + 1);
        myBlocks = myBlocks.filter(info => info.block.from === mainWallet.address);
        if (myBlocks.length !== 0) {
            return;
        }

        let from = fromBlock.from;
        if (fromBlock.lastHash !== BlockTree.ZERO_HASH) {
            const lastLastBlock = await this.coreContext.blockProvider.getBlockInfo(fromBlock.lastHash);
            from = lastLastBlock.block.from;
        }

        const bestSlices = this.coreContext.blockTree.getBestSlice(from, fromBlock.height + 1);
        const slices: Slices[] = [];
        let end = false;
        for (let i = 0; i < bestSlices.length; i++) {
            const slice = bestSlices[i];
            const sliceInfo = await this.coreContext.slicesProvider.getSliceInfo(slice.hash);
            if (!sliceInfo.isExecuted) {
                break;
            }
            if (sliceInfo.slice.end) {
                end = true;
            }
            slices.push(sliceInfo);
        }
        if (!end && now < fromBlock.created + blockTime * 2) {
            return;
        }
        await this.mintBlock(fromBlock, mainWallet, slices);
    }

    private async mintBlock(fromBlock: Block, mainWallet: Wallet, bestSlices: Slices[]) {
        const isConnected = await this.coreContext.applicationContext.mq.request(RequestKeys.test_connection, {
            chain: this.coreContext.chain
        })
        if (!isConnected) {
            this.coreContext.applicationContext.logger.verbose(`ConsensusAlgorithm: Node has disconnected!`)
            this.pipelineChain.stop().then(() => {
                this.pipelineChain.start();
            });
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
        block.chain = this.coreContext.chain;
        block.created = Math.floor(Date.now() / 1000);
        block.externalTxID = [];
        block.from = mainWallet.address;
        block.height = fromBlock.height + 1;
        block.lastHash = fromBlock.hash;
        block.slices = sliceHashList;
        block.hash = block.toHash();
        block.sign = await mainWallet.signHash(block.hash);

        this.coreContext.applicationContext.logger.info(`mint block - height: ${block.height} - slices: ${block.slices.length} - transactions: ${block.transactionsCount} - hash: ${block.hash.substring(0, 10)}`)
        const blockInfo = await this.coreContext.blockProvider.saveNewBlock(block);
        blockInfo.isComplete = true;
        blockInfo.isExecuted = false;
        await this.coreContext.blockProvider.updateBlock(blockInfo);
        this.coreContext.blockTree.addBlock(block);
        return block;
    }
}