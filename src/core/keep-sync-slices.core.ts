import { CoreProvider } from "../services";

export default class KeepSyncSlices {
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        return await this.coreProvider.slicesProvider.syncSlices(this.coreProvider.chain);
    }
}