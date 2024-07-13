import { CoreProvider } from "../services";
import { Task } from "../types";

export default class KeepSyncBlocks implements Task {
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

    async start() {
    }

    async stop() {
    }

    async run() {
        return await this.coreProvider.blockProvider.syncBlocks(this.coreProvider.chain);
    }
}