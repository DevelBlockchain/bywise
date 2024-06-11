import { BywiseHelper, Tx } from "@bywise/web3";
import { Events } from "../models";
import { BlockchainStatus, CoreContext, SimulateDTO } from "../types";
import helper from "../utils/helper";

export default class ExecuteTransactions {
    public isRun = true;
    public busy = false;
    private coreContext;
    private lastHash = '';
    private nextBlockHeight = -1;
    private currentContext: SimulateDTO | undefined;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    private async waitBusy() {
        while (this.busy) {
            await helper.sleep(0);
        }
        this.busy = true;
    }

    async run() {
        let currentHash: string;
        if (this.coreContext.blockTree.bestSlice) {
            currentHash = this.coreContext.blockTree.bestSlice.hash;
        } else {
            currentHash = this.coreContext.blockTree.currentMinnedBlock.hash;
        }

        if (this.lastHash == currentHash) {
            return;
        }

        this.lastHash = currentHash;
        this.nextBlockHeight = this.coreContext.blockTree.currentMinnedBlock.height + 1;

        await this.updateContext();
    }

    private async updateContext() {
        this.coreContext.applicationContext.logger.verbose(`update main context - hash: ${this.lastHash.substring(0, 10)}...`);
        await this.coreContext.environmentProvider.consolide(this.coreContext.blockTree, this.lastHash);

        const ctx = this.coreContext.transactionsProvider.createContext(this.coreContext.blockTree, this.lastHash, this.nextBlockHeight);
       
        await this.waitBusy();
        const oldContext = this.currentContext;
        this.currentContext = ctx;
        if (oldContext) {
            await this.coreContext.transactionsProvider.disposeContext(oldContext);
        }
        this.busy = false;
    }

    async getContract(address: string) {
        await this.waitBusy();

        const currentContext = this.currentContext;

        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const bcc = await this.coreContext.environmentProvider.get(currentContext.envContext, address);

        this.busy = false;
        return bcc;
    }

    async getWalletInfo(address: string) {
        await this.waitBusy();

        const currentContext = this.currentContext;

        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const balanceDTO = await this.coreContext.walletProvider.getWalletBalance(currentContext.envContext, address);
        const infoDTO = await this.coreContext.walletProvider.getWalletInfo(currentContext.envContext, address);

        this.busy = false;
        return {
            ...balanceDTO,
            ...infoDTO,
            balance: balanceDTO.balance.toString(),
        };
    }

    async executeSimulation(tx: Tx) {
        await this.waitBusy();

        const currentContext = this.currentContext;

        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }
        currentContext.checkWalletBalance = false;
        currentContext.enableReadProxy = true;
        const output = await this.coreContext.transactionsProvider.simulateTransaction(tx, {
            from: helper.getRandomHash(),
            transactionsData: []
        }, currentContext);
        currentContext.checkWalletBalance = true;
        currentContext.enableReadProxy = false;
        await this.coreContext.environmentProvider.deleteCommit(currentContext.envContext);

        this.busy = false;
        return output;
    }
}