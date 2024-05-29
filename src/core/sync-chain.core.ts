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