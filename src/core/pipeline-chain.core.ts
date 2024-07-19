import { CoreProvider } from "../services";
import { Task } from "../types";
import helper from "../utils/helper";
import ConsensusAlgorithm from "./consensus-algorithm.core";
import ExecuteBlocks from "./exec-blocks.core";
import ExecuteSlices from "./exec-slices.core";
import ExecuteTransactions from "./exec-transactions.core";
import KeepSyncBlocks from "./keep-sync-blocks.core";
import KeepSyncNetwork from "./keep-sync-network.core";
import KeepSyncSlices from "./keep-sync-slices.core";
import MintBlocks from "./mint-blocks.core";
import MintSlices from "./mint-slices.core";
import SyncChain from "./sync-chain.core";
import VoteBlocks from "./vote-blocks.core";

const DEFAULT_DELAY = 100;

export default class PipelineChain implements Task {
    public isRun = false;
    private runWorkersCount = 0;
    public coreProvider;
    public syncChain;
    public executeTransactions;
    public keepSyncNetwork;
    public mintBlocks;
    public keepSyncBlocks;
    public executeBlocks;
    public voteBlocks;
    public consensusAlgorithm;
    public keepSyncSlices;
    public executeSlices;
    public mintSlices;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.syncChain = new SyncChain(this.coreProvider);
        this.executeTransactions = new ExecuteTransactions(this.coreProvider);
        this.keepSyncNetwork = new KeepSyncNetwork(this.coreProvider);
        this.mintBlocks = new MintBlocks(this.coreProvider);
        this.keepSyncBlocks = new KeepSyncBlocks(this.coreProvider);
        this.executeBlocks = new ExecuteBlocks(this.coreProvider);
        this.voteBlocks = new VoteBlocks(this.coreProvider);
        this.consensusAlgorithm = new ConsensusAlgorithm(this.coreProvider);
        this.keepSyncSlices = new KeepSyncSlices(this.coreProvider);
        this.executeSlices = new ExecuteSlices(this.coreProvider);
        this.mintSlices = new MintSlices(this, this.coreProvider);
    }

    private async runSyncChain() {
        this.runWorkersCount++;
        try {
            this.coreProvider.applicationContext.logger.verbose(`start sync chain ${this.coreProvider.chain}`);
            let end = false;
            while (this.isRun && !end) {
                await helper.sleep(10);
                
                end = await this.syncChain.run();
            }
            this.coreProvider.applicationContext.logger.verbose(`sync chain ${this.coreProvider.chain} done`);
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.runSyncChain chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async blocksFlow() {
        this.runWorkersCount++;
        try {
            while (this.isRun) {
                await helper.sleep(DEFAULT_DELAY);

                if (this.isRun)
                    await this.keepSyncNetwork.run();
                if (this.isRun)
                    await this.mintBlocks.run();
                if (this.isRun)
                    await this.keepSyncBlocks.run();
                if (this.isRun)
                    await this.executeBlocks.run();
                if (this.isRun)
                    await this.voteBlocks.run();
                if (this.isRun)
                    await this.consensusAlgorithm.run();
                if (this.isRun)
                    await this.executeTransactions.run();
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error blocksFlow chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async slicesFlow() {
        this.runWorkersCount++;
        try {
            while (this.isRun) {
                await helper.sleep(DEFAULT_DELAY);

                if (this.isRun)
                    await this.keepSyncSlices.run();
                if (this.isRun)
                    await this.executeSlices.run();
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error slicesFlow chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async mintSlicesFlow() {
        this.runWorkersCount++;
        try {
            while (this.isRun) {
                await helper.sleep(DEFAULT_DELAY);
                if (this.isRun)
                    await this.mintSlices.run();
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error slicesFlow chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    public async run() {
        this.runWorkersCount++;

        await this.runSyncChain();

        this.blocksFlow();
        this.slicesFlow();
        this.mintSlicesFlow();

        this.runWorkersCount--;
        return true;
    }

    async start() {
        this.isRun = true;
        this.coreProvider.applicationContext.logger.info(`#### START CHAIN ${this.coreProvider.chain}`)
        this.run();
    }

    async stop() {
        this.isRun = false;

        while (this.runWorkersCount !== 0) {
            await helper.sleep(DEFAULT_DELAY);
        }
    }
}