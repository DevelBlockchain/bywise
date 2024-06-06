import { BlockchainStatus, CoreContext } from "../types";

export default class ExecuteSlices {
    public isRun = true;
    private coreContext;
    private SliceRepository;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
        this.SliceRepository = coreContext.applicationContext.database.SliceRepository;
    }

    async run() {
        let slices = await this.SliceRepository.findByChainAndStatus(this.coreContext.chain, BlockchainStatus.TX_MEMPOOL);
        slices = slices.filter(info => info.isComplete === true && info.isExecuted === false);
        if (slices.length == 0) {
            return;
        }

        slices = slices.sort((s1, s2) => s1.slice.created - s2.slice.created);

        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];

            const sliceList = this.coreContext.blockTree.getSliceList(sliceInfo.slice.hash);
            let lastContextHashIsExecuted = true;
            if(sliceList.length == 0) {
                lastContextHashIsExecuted = false; // last slices not found
            }
            for (let j = 0; j < sliceList.length - 1; j++) {
                const lastSliceInfo = await this.coreContext.slicesProvider.getSliceInfo(sliceList[j].hash);
                if(!lastSliceInfo.isExecuted) {
                    lastContextHashIsExecuted = false;
                }
            }

            const lastBlock = await this.coreContext.blockTree.minnedBlockList.get(sliceInfo.slice.blockHeight - 1);
            if(!lastBlock) {
                lastContextHashIsExecuted = false;
            } else {
                const blockInfo = await this.coreContext.blockProvider.getBlockInfo(lastBlock.hash);
                if(!blockInfo.isExecuted) {
                    lastContextHashIsExecuted = false;
                }
            }
            if(lastContextHashIsExecuted) {
                const lastContextHash = this.coreContext.blockTree.getLastHash(sliceInfo.slice.hash);
                await this.coreContext.slicesProvider.executeCompleteSlice(this.coreContext.blockTree, lastContextHash, sliceInfo);
            }
        }
        
        await this.coreContext.blockProvider.processVotes(this.coreContext.blockTree);
    }
}