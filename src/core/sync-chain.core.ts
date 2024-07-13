import { CoreProvider } from "../services";
import { Task } from "../types";

export default class SyncChain implements Task {
    public isRun = true;
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async start() {
    }

    async stop() {
    }

    async run() {
        if (this.coreProvider.network.web3.network.isConnected) {
            const currentBlock = this.coreProvider.currentBlock;

            const nextBlock = await this.coreProvider.network.web3.blocks.getBlockPackByHeight(currentBlock.chain, currentBlock.height + 1);
            if (nextBlock) {
                await this.coreProvider.blockProvider.setNewBlockPack(currentBlock.chain, nextBlock);
            } else {
                await this.coreProvider.blockProvider.selectMinedBlock(currentBlock.chain, currentBlock.hash);
                this.coreProvider.currentBlock = currentBlock;
                this.isRun = false;
            }
        }
        return true;
    }
}