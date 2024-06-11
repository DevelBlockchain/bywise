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
            const currentBlock = this.coreContext.blockTree.currentMinnedBlock;
      
            const nextBlock = await this.coreContext.network.web3.blocks.getBlockPackByHeight(currentBlock.chain, currentBlock.height + 1);
            if (nextBlock) {
                await this.coreContext.blockProvider.setNewBlockPack(this.coreContext.blockTree, nextBlock);
            } else {
                await this.coreContext.blockProvider.selectMinedBlock(this.coreContext.blockTree, currentBlock.hash);
                await this.coreContext.environmentProvider.consolide(this.coreContext.blockTree, currentBlock.hash);
                this.coreContext.blockTime = parseInt((await this.coreContext.configsProvider.getSlowConfigByName(this.coreContext.blockTree, currentBlock.hash, currentBlock.height, 'blockTime')).value);
                await this.coreContext.applicationContext.mq.send(RoutingKeys.selected_new_block, this.coreContext.chain);
                this.isRun = false;
            }
        }
    }
}