import { CoreProvider } from "../services";
import { Task } from "../types";
import helper from "../utils/helper";
import ConsensusAlgorithm from "./consensus-algorithm.core";
import ExecuteBlocks from "./exec-blocks.core";
import ExecuteSlices from "./exec-slices.core";
import ExecuteTransactions from "./exec-transactions.core";
import InvalideteOldTransactions from "./invalidate-old-transactions";
import KeepSync from "./keep-sync.core";
import MintBlocks from "./mint-blocks.core";
import MintSlices from "./mint-slices.core";
import SyncChain from "./sync-chain.core";
import VoteBlocks from "./vote-blocks.core";

const DEFAULT_DELAY = 50;

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

    private async keepSync() {
        this.runWorkersCount++;
        try {
            const task = new KeepSync(this.coreProvider);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.keepSync chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }
    
    private async invalidateTransactions() {
        this.runWorkersCount++;
        try {
            const task = new InvalideteOldTransactions(this.coreProvider);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.invalidateTransactions chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async executeBlocks() {
        this.runWorkersCount++;
        try {
            const task = new ExecuteBlocks(this.coreProvider);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.executeBlocks chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async executeTransactions() {
        this.runWorkersCount++;
        try {
            while (this.isRun && this.executeTransactionsTask.isRun) {
                await this.executeTransactionsTask.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.executeBlocks chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async mintSlices() {
        this.runWorkersCount++;
        try {
            const mintSlices = new MintSlices(this.coreProvider, this);
            await mintSlices.start();
            while (this.isRun && mintSlices.isRun) {
                await mintSlices.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.mintSlices chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }
    
    private async executeSlices() {
        this.runWorkersCount++;
        try {
            const executeSlices = new ExecuteSlices(this.coreProvider);
            while (this.isRun && executeSlices.isRun) {
                await executeSlices.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.mintSlices chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async mintBlocks() {
        this.runWorkersCount++;
        try {
            const task = new MintBlocks(this.coreProvider);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.mintBlocks chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async voteBlocks() {
        this.runWorkersCount++;
        try {
            const task = new VoteBlocks(this.coreProvider);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.voteBlocks chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async consensusAlgorithm() {
        this.runWorkersCount++;
        try {
            const task = new ConsensusAlgorithm(this.coreProvider);
            while (this.isRun && task.isRun) {
                await task.run();

                await helper.sleep(DEFAULT_DELAY);
            }
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`error core.consensusAlgorithm chain ${this.coreProvider.chain} - ${err.message}`, err);
            this.stop();
        }
        this.runWorkersCount--;
    }

    private async runPipeline() {
        this.runWorkersCount++;

        await this.runSyncChain();

        this.keepSync();
        this.mintBlocks();
        this.executeBlocks();
        this.mintSlices();
        this.executeSlices();
        this.executeTransactions();
        this.voteBlocks();
        this.consensusAlgorithm();
        this.invalidateTransactions();

        this.runWorkersCount--;
    }

    async start() {
        this.isRun = true;
        this.coreProvider.applicationContext.logger.verbose(`watch ${this.coreProvider.chain} chain`)
        await this.runPipeline();
    }

    async stop() {
        this.isRun = false;
        while (this.runWorkersCount !== 0) {
            await helper.sleep(DEFAULT_DELAY);
        }
    }
}