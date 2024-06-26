import { Tx } from "@bywise/web3";
import { CoreContext, SimulateDTO } from "../types";
import helper from "../utils/helper";
import { CompiledContext } from "../types/environment.types";

const EVENT_PAGE_SIZE = 100;

export default class ExecuteTransactions {
    public isRun = true;
    public busy = false;
    private coreContext;
    private currentHash = '';
    private nextBlockHeight = -1;
    private currentContext: SimulateDTO | undefined;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    private async waitBusy() {
        while (this.busy) {
            await helper.sleep(10);
        }
        this.busy = true;
    }

    async run() {
        let currentHash = this.coreContext.blockTree.getLastContextHash();

        if (this.currentHash == currentHash) {
            return;
        }

        this.currentHash = currentHash;
        this.nextBlockHeight = this.coreContext.blockTree.currentMinnedBlock.height + 1;

        await this.updateContext();
    }

    private async updateContext() {
        this.coreContext.applicationContext.logger.verbose(`update main context - hash: ${this.currentHash.substring(0, 10)}...`);

        await this.coreContext.environmentProvider.consolide(this.coreContext.blockTree, this.currentHash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = this.coreContext.transactionsProvider.createContext(this.coreContext.blockTree, CompiledContext.MAIN_CONTEXT_HASH, this.nextBlockHeight);

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
        this.coreContext.environmentProvider.deleteCommit(currentContext.envContext);

        this.busy = false;
        return output;
    }

    async getEventsByKey(contractAddress: string, eventName: string, key: string, value: string, page: number) {
        await this.waitBusy();

        const currentContext = this.currentContext;
        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const size = await this.coreContext.eventsProvider.countEventsByKey(currentContext.envContext, contractAddress, eventName, key, value);
        const offset = EVENT_PAGE_SIZE * page;
        const events = await this.coreContext.eventsProvider.findByEventAndKey(currentContext.envContext, contractAddress, eventName, key, value, EVENT_PAGE_SIZE, offset);

        return {
            page,
            per_pages: EVENT_PAGE_SIZE,
            total_pages: Math.floor(size / EVENT_PAGE_SIZE),
            total_events: Math.floor(size),
            events
        };
    }

    async getEvents(contractAddress: string, eventName: string, page: number) {
        await this.waitBusy();

        const currentContext = this.currentContext;
        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const size = await this.coreContext.eventsProvider.countEvents(currentContext.envContext, contractAddress, eventName);
        const offset = EVENT_PAGE_SIZE * page;
        const events = await this.coreContext.eventsProvider.findByEvent(currentContext.envContext, contractAddress, eventName, EVENT_PAGE_SIZE, offset);

        return {
            page,
            per_pages: EVENT_PAGE_SIZE,
            total_pages: Math.floor(size / EVENT_PAGE_SIZE),
            total_events: Math.floor(size),
            events
        };
    }
}