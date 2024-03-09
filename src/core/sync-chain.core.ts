import { RoutingKeys } from "../datasource/message-queue";
import { CoreContext } from "../types";

export default class SyncChain {
    public isRun = true;
    private coreContext;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    async run() {
        if (this.coreContext.network.web3.network.isConnected) {
            const lastBlockInfo = this.coreContext.blockTree.getBlockInfo(this.coreContext.blockTree.blockTreeLastMinedHash);
            if (!lastBlockInfo) throw new Error(`lastBlockInfo block not found - ${this.coreContext.blockTree.blockTreeLastMinedHash}`);

            const nextBlock = await this.coreContext.network.web3.blocks.getBlockPackByHeight(lastBlockInfo.block.chain, lastBlockInfo.block.height + 1);
            if (nextBlock) {
                await this.coreContext.blockProvider.setNewBlockPack(this.coreContext.blockTree, nextBlock);
            } else {
                /*
                const blocks = await this.coreContext.network.web3.blocks.getBlocks(lastBlockInfo.block.chain, { status: BlockchainStatus.TX_MEMPOOL });
                if (blocks) {
                    for (let i = 0; i < blocks.length; i++) {
                        const block = blocks[i];
                        if (block.height >= lastBlockInfo.block.height - 1) {
                            const slices = await this.coreContext.network.web3.blocks.getSlicesFromBlock(block.hash);
                            for (let j = 0; slices && j < slices.length; j++) {
                                const slice = slices[j];
                                await this.coreContext.slicesProvider.saveNewSlice(new Slice(slice), false);
                                await this.coreContext.slicesProvider.populateSliceInfo(this.coreContext.blockTree, slice.hash);

                                const transactions = await this.coreContext.network.web3.slices.getTransactionsFromSlice(slice.hash);
                                for (let z = 0; transactions && z < transactions.length; z++) {
                                    const tx = transactions[z];

                                    await this.coreContext.transactionsProvider.saveNewTransaction(new Tx(tx), false);
                                    await this.coreContext.transactionsProvider.populateTxInfo(this.coreContext.blockTree, tx.hash);
                                }
                            }
                        }
                    }
                }*/
                await this.coreContext.blockProvider.selectMinedBlock(this.coreContext.blockTree, lastBlockInfo.block.hash);
                this.coreContext.blockTime = parseInt((await this.coreContext.configsProvider.getByName(this.coreContext.blockTree, lastBlockInfo.block.hash, lastBlockInfo.block.height, 'blockTime')).value);
                this.coreContext.lastBlock = lastBlockInfo;
                const slice = await this.coreContext.blockTree.getSliceInfo(lastBlockInfo.block.slices[0]);
                if (slice) {
                    this.coreContext.bestSlice = slice;
                }
                await this.coreContext.applicationContext.mq.send(RoutingKeys.selected_new_block, this.coreContext.chain);
                this.isRun = false;
            }
        }
    }
}