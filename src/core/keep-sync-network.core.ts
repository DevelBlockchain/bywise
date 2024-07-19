import { CoreProvider } from "../services";

export default class KeepSyncNetwork {
    private coreProvider;
    private slicesProvider;
    private blockProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.slicesProvider = coreProvider.slicesProvider;
        this.blockProvider = coreProvider.blockProvider;
    }

    async run() {
        if (this.coreProvider.network.web3.network.isConnected) {
            const nextBlock = await this.coreProvider.network.web3.blocks.getBlockPackByHeight(this.coreProvider.chain, this.coreProvider.currentBlock.height + 1);
            if (nextBlock) {
                for (let i = 0; i < nextBlock.txs.length; i++) {
                    const tx = nextBlock.txs[i];
                    await this.coreProvider.applicationContext.database.TransactionRepository.addMempool(tx);
                }
                for (let i = 0; i < nextBlock.slices.length; i++) {
                    const slice = nextBlock.slices[i];
                    await this.slicesProvider.saveNewSlice(slice);
                }
                await this.blockProvider.saveNewBlock(nextBlock.block);
                return true;
            }
        }
        return false;
    }
}