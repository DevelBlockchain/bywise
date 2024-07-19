import { CoreProvider } from "../services";

export default class SyncChain {
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        if (this.coreProvider.network.web3.network.isConnected) {
            const currentBlock = this.coreProvider.currentBlock;

            const nextBlock = await this.coreProvider.network.web3.blocks.getBlockPackByHeight(currentBlock.chain, currentBlock.height + 1);
            if (nextBlock) {
                const newCurrentBlock = await this.coreProvider.blockProvider.setNewBlockPack(currentBlock.chain, nextBlock);
                this.coreProvider.currentBlock = newCurrentBlock.block;
            } else {
                await this.coreProvider.blockProvider.selectMinedBlock(currentBlock.chain, currentBlock.hash);
                this.coreProvider.currentBlock = currentBlock;
                return true;
            }
        }
        return false;
    }
}