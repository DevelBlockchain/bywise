import { Tx } from "@bywise/web3";
import { SimulateDTO, CompiledContext } from "../types";
import helper from "../utils/helper";
import BigNumber from "bignumber.js";
import { CoreProvider } from "../services";

const EVENT_PAGE_SIZE = 100;

export default class ExecuteTransactions {
    public isRun = true;
    public busy = false;
    private coreProvider;
    private currentHash = '';
    private nextBlockHeight = -1;
    private currentContext: SimulateDTO | undefined;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    private async waitBusy() {
        while (this.busy) {
            await helper.sleep(10);
        }
        this.busy = true;
    }

    async run() {
        let currentHash = this.coreProvider.blockTree.getLastContextHash();

        if (this.currentHash == currentHash) {
            return;
        }

        this.currentHash = currentHash;
        this.nextBlockHeight = this.coreProvider.blockTree.currentMinnedBlock.height + 1;

        await this.updateContext();
    }

    private async updateContext() {
        this.coreProvider.applicationContext.logger.verbose(`update main context - hash: ${this.currentHash.substring(0, 10)}...`);

        await this.coreProvider.environmentProvider.consolide(this.coreProvider.blockTree, this.currentHash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = this.coreProvider.transactionsProvider.createContext(this.coreProvider.blockTree, CompiledContext.MAIN_CONTEXT_HASH, this.nextBlockHeight);

        await this.waitBusy();
        const oldContext = this.currentContext;
        this.currentContext = ctx;
        if (oldContext) {
            await this.coreProvider.transactionsProvider.disposeContext(oldContext);
        }
        await this.updateConfigs(ctx);
        this.busy = false;
    }

    async getContract(address: string) {
        await this.waitBusy();

        const currentContext = this.currentContext;

        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const bcc = await this.coreProvider.environmentProvider.get(currentContext.envContext, address);

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

        const walletCodeDTO = await this.coreProvider.walletProvider.getWalletCode(currentContext.envContext, address);
        const walletInfoDTO = await this.coreProvider.walletProvider.getWalletInfo(currentContext.envContext, address);
        const walletBalanceDTO = await this.coreProvider.walletProvider.getWalletBalance(currentContext.envContext, address);

        this.busy = false;
        return {
            ...walletCodeDTO,
            ...walletInfoDTO,
            balance: walletBalanceDTO.balance.toString(),
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
        const output = await this.coreProvider.transactionsProvider.simulateTransaction(tx, {
            from: helper.getRandomHash(),
            transactionsData: []
        }, currentContext);
        currentContext.checkWalletBalance = true;
        currentContext.enableReadProxy = false;
        this.coreProvider.environmentProvider.deleteCommit(currentContext.envContext);

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

        const size = await this.coreProvider.eventsProvider.countEventsByKey(currentContext.envContext, contractAddress, eventName, key, value);
        const offset = EVENT_PAGE_SIZE * page;
        const events = await this.coreProvider.eventsProvider.findByEventAndKey(currentContext.envContext, contractAddress, eventName, key, value, EVENT_PAGE_SIZE, offset);

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

        const size = await this.coreProvider.eventsProvider.countEvents(currentContext.envContext, contractAddress, eventName);
        const offset = EVENT_PAGE_SIZE * page;
        const events = await this.coreProvider.eventsProvider.findByEvent(currentContext.envContext, contractAddress, eventName, EVENT_PAGE_SIZE, offset);

        return {
            page,
            per_pages: EVENT_PAGE_SIZE,
            total_pages: Math.floor(size / EVENT_PAGE_SIZE),
            total_events: Math.floor(size),
            events
        };
    }

    private async updateConfigs(currentContext: SimulateDTO) {
        const mainWallet = await this.coreProvider.walletProvider.getMainWallet();
        const config = await this.coreProvider.configsProvider.getByName(currentContext.envContext, 'blockTime');
        const newBlockTime = parseInt(config.value);
        const isValidator = await this.coreProvider.configsProvider.isValidator(currentContext.envContext, mainWallet.address);
        const minValue = await this.coreProvider.configsProvider.getByName(currentContext.envContext, 'min-bws-block');
        const walletDTO = await this.coreProvider.walletProvider.getWalletBalance(currentContext.envContext, mainWallet.address);
        const hasMinimumBWSToMine = !walletDTO.balance.isLessThan(new BigNumber(minValue.value));

        this.coreProvider.blockTime = newBlockTime;
        this.coreProvider.isValidator = isValidator;
        this.coreProvider.hasMinimumBWSToMine = hasMinimumBWSToMine;

        if (!this.coreProvider.isValidator) {
            this.coreProvider.applicationContext.logger.verbose(`not enabled to mining blocks on chain ${this.coreProvider.chain}`);
        }
        if (!this.coreProvider.hasMinimumBWSToMine) {
            this.coreProvider.applicationContext.logger.verbose(`not enabled to mining blocks on chain ${this.coreProvider.chain} - low balance`);
        }
    }
}