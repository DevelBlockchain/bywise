import { CoreContext } from "../types";

export default class KeepSync {
    public isRun = true;
    private coreContext;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    async run() {
        await this.coreContext.slicesProvider.syncSlices(this.coreContext.blockTree);
        await this.coreContext.blockProvider.syncBlocks(this.coreContext.blockTree);
    }
}