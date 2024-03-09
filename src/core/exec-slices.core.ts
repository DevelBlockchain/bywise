import { CoreContext } from "../types";

export default class ExecuteSlices {
    public isRun = true;
    private coreContext;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    async run() {
        await this.coreContext.slicesProvider.executeCompleteSlices(this.coreContext.blockTree);
        await this.coreContext.blockProvider.processVotes(this.coreContext.blockTree);
    }
}