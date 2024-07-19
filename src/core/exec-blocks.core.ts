import { CoreProvider } from "../services";

export default class ExecuteBlocks {
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        return await this.coreProvider.blockProvider.executeCompleteBlocks(this.coreProvider.chain);
    }
}