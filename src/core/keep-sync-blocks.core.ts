import { CoreProvider } from "../services";
import { Task } from "../types";

export default class KeepSyncBlocks implements Task {
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
        return await this.coreProvider.blockProvider.syncBlocks(this.coreProvider.chain);
    }
}