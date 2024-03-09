import { CoreContext, Task } from "../types";
import helper from "../utils/helper";
import ConsensusAlgorithm from "./consensus-algorithm.core";
import ETHProxySync from "./eth-proxy-sync.core";
import ExecuteBlocks from "./exec-blocks.core";
import ExecuteSlices from "./exec-slices.core";
import ExecuteTransactions from "./exec-transactions.core";
import InvalideteOldTransactions from "./invalidate-old-transactions";
import KeepSync from "./keep-sync.core";
import MintBlocks from "./mint-blocks.core";
import MintSlices from "./mint-slices.core";
import SyncChain from "./sync-chain.core";
import VoteBlocks from "./vote-blocks.core";

export default class PipelineChain implements Task {
    public isRun = false;
    private runWorkersCount = 0;
    public coreContext;
    private defaultDelay;
    public executeTransactionsTask;

    constructor(coreContext: CoreContext, defaultDelay = 100) {
        this.coreContext = coreContext;
        this.defaultDelay = defaultDelay;
        this.executeTransactionsTask = new ExecuteTransactions(this.coreContext);
    }

    private async runSyncChain() {
        this.runWorkersCount++;
        try {
            const task = new SyncChain(this.coreContext);
            this.coreContext.applicationContext.logger.info(`start sync chain ${this.coreContext.chain}`);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
            this.coreContext.applicationContext.logger.info(`sync chain ${this.coreContext.chain} done`);
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.runSyncChain chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async keepSync() {
        this.runWorkersCount++;
        try {
            const task = new KeepSync(this.coreContext);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.keepSync chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async executeTransactions() {
        this.runWorkersCount++;
        try {
            while (this.isRun && this.executeTransactionsTask.isRun) {
                await this.executeTransactionsTask.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.executeTransactions chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }
    
    private async invalidateTransactions() {
        this.runWorkersCount++;
        try {
            const task = new InvalideteOldTransactions(this.coreContext);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.invalidateTransactions chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async ethProxy() {
        this.runWorkersCount++;
        try {
            const task = new ETHProxySync(this.coreContext);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.ethProxy chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async executeSlices() {
        this.runWorkersCount++;
        try {
            const task = new ExecuteSlices(this.coreContext);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.executeSlices chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async executeBlocks() {
        this.runWorkersCount++;
        try {
            const task = new ExecuteBlocks(this.coreContext);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.executeBlocks chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async mintSlices() {
        this.runWorkersCount++;
        try {
            const task = new MintSlices(this.coreContext, this);
            await task.start();
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
            await task.stop();
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.mintSlices chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async mintBlocks() {
        this.runWorkersCount++;
        try {
            const task = new MintBlocks(this.coreContext, this);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.mintBlocks chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async voteBlocks() {
        this.runWorkersCount++;
        try {
            const task = new VoteBlocks(this.coreContext);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.voteBlocks chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async consensusAlgorithm() {
        this.runWorkersCount++;
        try {
            const task = new ConsensusAlgorithm(this.coreContext, this);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(this.defaultDelay);
            }
        } catch (err: any) {
            this.coreContext.applicationContext.logger.error(`error core.consensusAlgorithm chain ${this.coreContext.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async runPipeline() {
        this.runWorkersCount++;

        await this.runSyncChain();

        this.keepSync();
        this.executeTransactions();
        this.executeSlices();
        this.executeBlocks();
        this.mintSlices();
        this.mintBlocks();
        this.voteBlocks();
        this.consensusAlgorithm();
        this.invalidateTransactions();
        this.ethProxy();

        this.runWorkersCount--;
    }

    async start() {
        this.isRun = true;
        this.coreContext.applicationContext.logger.info(`watch ${this.coreContext.chain} chain`)
        await this.runPipeline();
    }

    async stop() {
        this.isRun = false;
        while (this.runWorkersCount !== 0) {
            await helper.sleep(this.defaultDelay);
        }
    }
}