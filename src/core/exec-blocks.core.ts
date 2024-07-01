import { CoreProvider } from "../services";

export default class ExecuteBlocks {
    public isRun = true;
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        await this.coreProvider.blockProvider.executeCompleteBlocks(this.coreProvider.blockTree);
    }
}