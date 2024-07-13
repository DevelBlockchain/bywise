import { CoreProvider } from "../services";
import { Task } from "../types";
import helper from "../utils/helper";
import ConsensusAlgorithm from "./consensus-algorithm.core";
import ExecuteBlocks from "./exec-blocks.core";
import ExecuteSlices from "./exec-slices.core";
import ExecuteTransactions from "./exec-transactions.core";
import InvalideteOldTransactions from "./invalidate-old-transactions";
import KeepSyncBlocks from "./keep-sync-blocks.core";
import KeepSyncNetwork from "./keep-sync-network.core";
import KeepSyncSlices from "./keep-sync-slices.core";
import MintBlocks from "./mint-blocks.core";
import MintSlices from "./mint-slices.core";
import SyncChain from "./sync-chain.core";
import VoteBlocks from "./vote-blocks.core";

const DEFAULT_DELAY = 200;

export default class PipelineChain implements Task {
    public isRun = false;
    private runWorkersCount = 0;
    public coreProvider;
    public executeTransactionsTask;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.executeTransactionsTask = new ExecuteTransactions(this.coreProvider);
    }

    private async runSyncChain() {
        this.runWorkersCount++;
        try {
            const task = new SyncChain(this.coreProvider);
            await task.start();
            this.coreProvider.applicationContext.logger.verbose(`start sync chain ${this.coreProvider.chain}`);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(10);
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
            const sync = new KeepSyncBlocks(this.coreProvider);
            const exec = new ExecuteBlocks(this.coreProvider);
            const mint = new MintBlocks(this.coreProvider);
            const ca = new ConsensusAlgorithm(this.coreProvider);
            const vb = new VoteBlocks(this.coreProvider);

            await sync.start();
            await exec.start();
            await mint.start();
            await ca.start();
            await vb.start();

            while (this.isRun && sync.isRun && exec.isRun && mint.isRun && ca.isRun && vb.isRun) {
                let used = await sync.run();
                used = used || await exec.run();
                used = used || await mint.run();
                used = used || await ca.run();
                used = used || await vb.run();

                if(!used) {
                    await helper.sleep(DEFAULT_DELAY);
                }
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error blocksFlow chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }
    
    private async slicesExec() {
        this.runWorkersCount++;
        try {
            const exec = new ExecuteSlices(this.coreProvider);
            const mint = new MintSlices(this.coreProvider);

            await exec.start();
            await mint.start();
            await this.executeTransactionsTask.start();

            while (this.isRun && exec.isRun && mint.isRun && this.executeTransactionsTask.isRun) {
                let used = await exec.run();
                used = used || await mint.run();
                used = used || await this.executeTransactionsTask.run();

                if(!used) {
                    await helper.sleep(DEFAULT_DELAY);
                }
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error slicesFlow chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }
    
    private async slicesFlow() {
        this.runWorkersCount++;
        try {
            const syncNetwork = new KeepSyncNetwork(this.coreProvider);
            const syncSlices = new KeepSyncSlices(this.coreProvider);
            const invalidateTx = new InvalideteOldTransactions(this.coreProvider);

            await syncNetwork.start();
            await syncSlices.start();
            await invalidateTx.start();

            while (this.isRun && syncNetwork.isRun && syncSlices.isRun && invalidateTx.isRun) {
                let used = await syncNetwork.run();
                used = used || await syncSlices.run();
                used = used || await invalidateTx.run();

                if(!used) {
                    await helper.sleep(DEFAULT_DELAY);
                }
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
        this.slicesExec();
        this.slicesFlow();

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