import { CoreProvider } from "../services";
import { Task } from "../types";

export default class KeepSyncSlices implements Task {
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
        return await this.coreProvider.slicesProvider.syncSlices(this.coreProvider.chain);
    }
}