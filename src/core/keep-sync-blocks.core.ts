import { CoreProvider } from "../services";

export default class KeepSyncBlocks {
    public isRun = true;
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        return await this.coreProvider.blockProvider.syncBlocks(this.coreProvider.chain);
    }
}