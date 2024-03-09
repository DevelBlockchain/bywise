import { CoreContext } from "../types";

export default class ExecuteBlocks {
    public isRun = true;
    private coreContext;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    async run() {
        await this.coreContext.blockProvider.executeCompleteBlocks(this.coreContext.blockTree);
    }
}