import { CoreProvider } from "../services";

export default class SyncChain {
    public isRun = true;
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        if (this.coreProvider.network.web3.network.isConnected) {
            const currentBlock = this.coreProvider.blockTree.currentMinnedBlock;
      
            const nextBlock = await this.coreProvider.network.web3.blocks.getBlockPackByHeight(currentBlock.chain, currentBlock.height + 1);
            if (nextBlock) {
                await this.coreProvider.blockProvider.setNewBlockPack(this.coreProvider.blockTree, nextBlock);
            } else {
                await this.coreProvider.blockProvider.selectMinedBlock(this.coreProvider.blockTree, currentBlock.hash);
                this.isRun = false;
            }
        }
    }
}