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

    constructor(coreContext: CoreContext, pipelineChain: PipelineChain) {
        this.coreContext = coreContext;
        this.pipelineChain = pipelineChain;
    }

    async run() {
        const now = helper.getNow()
        const lastBlock = this.coreContext.lastBlock;
        if (!lastBlock) throw new Error(`lastBlock block not found`);
        const blockTime = this.coreContext.blockTime;
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        const myBlocks = this.coreContext.blockTree.blockInfoList.filter(info => info.block.height === lastBlock.block.height - 1 && info.block.from === mainWallet.address);

        if (myBlocks.length === 0) {
            await this.tryMintCurrentBlock(lastBlock);
        }
        if (now >= lastBlock.block.created + blockTime) {
            await this.tryMintBlock(lastBlock);
        }
    }

    async tryMintCurrentBlock(lastBlock: Blocks) {
        if (lastBlock.block.lastHash === BlockTree.ZERO_HASH) {
            return;
        }

        const lastlastBlock = this.coreContext.blockTree.getBlockInfo(lastBlock.block.lastHash);
        if (!lastlastBlock) throw new Error(`lastlastBlock block not found`);

        await this.tryMintBlock(lastlastBlock);
    }

    async tryMintBlock(lastBlock: Blocks) {
        const now = helper.getNow()
        const blockTime = this.coreContext.blockTime;
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        const isMinner = await this.coreContext.configsProvider.isValidator(this.coreContext.blockTree, lastBlock.block.hash, lastBlock.block.height, mainWallet.address);
        if (!isMinner) {
            this.coreContext.applicationContext.logger.verbose(`not enabled to mining blocks on chain ${this.coreContext.chain}`);
            this.isRun = false;
            return;
        }
        const minValue = await this.coreContext.configsProvider.getByName(this.coreContext.blockTree, lastBlock.block.hash, lastBlock.block.height, 'min-bws-block');
        const balanceDTO = await this.coreContext.walletProvider.getWalletBalance(this.coreContext.blockTree, lastBlock.block.hash, mainWallet.address);
        if (balanceDTO.balance.isLessThan(new BigNumber(minValue.value))) {
            return;
        }

        const myBlocks = this.coreContext.blockTree.blockInfoList.filter(info => info.block.height === lastBlock.block.height + 1 && info.block.from === mainWallet.address);
        if (myBlocks.length !== 0) {
            return;
        }

        const bestSlice = await this.coreContext.slicesProvider.getBestSlice(this.coreContext.blockTree, lastBlock.block);
        if ((!bestSlice || !bestSlice.slice.end) && now < lastBlock.block.created + blockTime * 2) {
            return;
        }
        await this.mintBlock(lastBlock.block, mainWallet, bestSlice);
    }

    private async mintBlock(lastBlock: Block, mainWallet: Wallet, bestSlice: Slices | null) {
        const isConnected = await this.coreContext.applicationContext.mq.request(RequestKeys.test_connection, {
            chain: this.coreContext.chain
        })
        if(!isConnected) {
            this.coreContext.applicationContext.logger.verbose(`ConsensusAlgorithm: Node has disconnected!`)
            this.pipelineChain.stop().then(() => {
                this.pipelineChain.start();
            });
            return;
        }
        
        const block = new Block();
        block.version = '2';
        block.transactionsCount = bestSlice ? bestSlice.slice.transactionsCount : 0;
        block.chain = this.coreContext.chain;
        block.created = Math.floor(Date.now() / 1000);
        block.externalTxID = [];
        block.from = mainWallet.address;
        block.height = lastBlock.height + 1;
        block.lastHash = lastBlock.hash;
        block.slices = bestSlice ? [bestSlice.slice.hash] : [];
        block.hash = block.toHash();
        block.sign = await mainWallet.signHash(block.hash);

        this.coreContext.applicationContext.logger.verbose(`mint-blocks: mint new block - ${block.height} - hash: ${block.hash.substring(0, 10)}`)
        await this.coreContext.blockProvider.saveNewBlock(block);
        await this.coreContext.blockProvider.populateBlockInfo(this.coreContext.blockTree, block.hash);

        return block;
    }
}