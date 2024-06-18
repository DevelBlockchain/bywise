import { CoreContext } from "../types";

export default class KeepSync {
    public isRun = true;
    private coreContext;
    private transactionsProvider;
    private slicesProvider;
    private blockProvider;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
        this.transactionsProvider = coreContext.transactionsProvider;
        this.slicesProvider = coreContext.slicesProvider;
        this.blockProvider = coreContext.blockProvider;
    }

    async run() {
        if (this.coreContext.network.web3.network.isConnected) {
            const nextBlock = await this.coreContext.network.web3.blocks.getBlockPackByHeight(this.coreContext.blockTree.chain, this.coreContext.blockTree.currentMinnedBlock.height + 1);
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
        await this.coreContext.slicesProvider.syncSlices(this.coreContext.blockTree);
        await this.coreContext.blockProvider.syncBlocks(this.coreContext.blockTree);
    }
}