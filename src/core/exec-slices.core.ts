import { CoreProvider } from "../services";
import { BlockchainStatus } from "../types";
import { Task } from "../types";

export default class ExecuteSlices implements Task {
    public isRun = true;
    private coreProvider;
    private SliceRepository;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.SliceRepository = coreProvider.applicationContext.database.SliceRepository;
    }

    async start() {
    }

    async stop() {
    }

    async run() {
        let isExecuted = false;
        let slices = await this.SliceRepository.findByChainAndStatus(this.coreProvider.chain, BlockchainStatus.TX_COMPLETE);
        if (slices.length == 0) {
            return isExecuted;
        }
        slices = slices.sort((s1, s2) => s1.slice.created - s2.slice.created);

        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];
            
            const success = await this.coreProvider.slicesProvider.executeCompleteSlice(sliceInfo);
            if (success) {
                isExecuted = true;
            }
        }
        if (isExecuted) {
            await this.coreProvider.blockProvider.processVotes(this.coreProvider.chain);
        }
        return isExecuted;
    }
}