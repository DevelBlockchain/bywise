import { CoreProvider } from "../services";

export default class KeepSync {
    public isRun = true;
    private coreProvider;
    private transactionsProvider;
    private slicesProvider;
    private blockProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.transactionsProvider = coreProvider.transactionsProvider;
        this.slicesProvider = coreProvider.slicesProvider;
        this.blockProvider = coreProvider.blockProvider;
    }

    async run() {
        if (this.coreProvider.network.web3.network.isConnected) {
            const nextBlock = await this.coreProvider.network.web3.blocks.getBlockPackByHeight(this.coreProvider.blockTree.chain, this.coreProvider.blockTree.currentMinnedBlock.height + 1);
            if (nextBlock) {
                for (let i = 0; i < nextBlock.txs.length; i++) {
                    const tx = nextBlock.txs[i];
                    await this.transactionsProvider.saveNewTransaction(tx);
                }
                for (let i = 0; i < nextBlock.slices.length; i++) {
                    const slice = nextBlock.slices[i];
                    await this.slicesProvider.saveNewSlice(slice);
                }
                await this.blockProvider.saveNewBlock(nextBlock.block);
            }
        }
        await this.coreProvider.slicesProvider.syncSlices(this.coreProvider.blockTree);
        await this.coreProvider.blockProvider.syncBlocks(this.coreProvider.blockTree);
    }
}