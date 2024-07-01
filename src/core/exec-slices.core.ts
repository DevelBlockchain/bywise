import { CoreProvider } from "../services";
import { BlockchainStatus } from "../types";

export default class ExecuteSlices {
    public isRun = true;
    private coreProvider;
    private SliceRepository;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.SliceRepository = coreProvider.applicationContext.database.SliceRepository;
    }

    async run() {
        let slices = await this.SliceRepository.findByChainAndStatus(this.coreProvider.chain, BlockchainStatus.TX_MEMPOOL);
        slices = slices.filter(info => info.isComplete === true && info.isExecuted === false);
        if (slices.length == 0) {
            return;
        }

        slices = slices.sort((s1, s2) => s1.slice.created - s2.slice.created);

        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];

            const sliceList = this.coreProvider.blockTree.getSliceList(sliceInfo.slice.hash);
            let lastContextHashIsExecuted = true;
            if(sliceList.length == 0) {
                lastContextHashIsExecuted = false; // last slices not found
            }
            for (let j = 0; j < sliceList.length - 1; j++) {
                const lastSliceInfo = await this.coreProvider.slicesProvider.getSliceInfo(sliceList[j].hash);
                if(!lastSliceInfo.isExecuted) {
                    lastContextHashIsExecuted = false;
                }
            }

            const lastBlock = await this.coreProvider.blockTree.minnedBlockList.get(sliceInfo.slice.blockHeight - 1);
            if(!lastBlock) {
                lastContextHashIsExecuted = false;
            } else {
                const blockInfo = await this.coreProvider.blockProvider.getBlockInfo(lastBlock.hash);
                if(!blockInfo.isExecuted) {
                    lastContextHashIsExecuted = false;
                }
            }
            if(lastContextHashIsExecuted) {
                const lastContextHash = this.coreProvider.blockTree.getLastHash(sliceInfo.slice.hash);
                await this.coreProvider.slicesProvider.executeCompleteSlice(this.coreProvider.blockTree, lastContextHash, sliceInfo);
            }
        }
        
        await this.coreProvider.blockProvider.processVotes(this.coreProvider.blockTree);
    }
}