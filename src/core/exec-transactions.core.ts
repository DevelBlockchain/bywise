import { Tx } from "@bywise/web3";
import { CompiledContext, EnvironmentContext } from "../types";
import helper from "../utils/helper";
import BigNumber from "bignumber.js";
import { ConfigProvider, CoreProvider, WalletProvider } from "../services";
import { RuntimeContext } from "../vm/RuntimeContext";

const EVENT_PAGE_SIZE = 100;

export default class ExecuteTransactions {
    public isRun = true;
    public busy = false;
    private coreProvider;
    private currentHash = '';
    private nextBlockHeight = -1;
    private currentContext: RuntimeContext | undefined;
    private walletProvider;
    private configProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.walletProvider = new WalletProvider();
        this.configProvider = new ConfigProvider();
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
        await this.waitBusy();
        this.coreProvider.applicationContext.logger.verbose(`update main context - hash: ${this.currentHash.substring(0, 10)}...`);

        await this.coreProvider.environmentProvider.consolide(this.coreProvider.blockTree, this.currentHash, CompiledContext.MAIN_CONTEXT_HASH);
        this.currentContext = new RuntimeContext(this.coreProvider.environmentProvider, {
            chain: this.coreProvider.blockTree.chain,
            blockHeight: this.nextBlockHeight,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await this.updateConfigs(this.currentContext);
        this.busy = false;
    }

    async getContract(address: string) {
        await this.waitBusy();

        const currentContext = this.currentContext;

        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const bcc = await this.walletProvider.getWalletCode(currentContext, address);

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

        const walletCodeDTO = await this.walletProvider.getWalletCode(currentContext, address);
        const walletInfoDTO = await this.walletProvider.getWalletInfo(currentContext, address);
        const walletBalanceDTO = await this.walletProvider.getWalletBalance(currentContext, address);

        this.busy = false;
        return {
            ...walletCodeDTO,
            ...walletInfoDTO,
            balance: walletBalanceDTO.balance.toString(),
        };
    }

    async executeSimulation(tx: Tx, env?: EnvironmentContext, ignoreBalance?: boolean) {
        await this.waitBusy();

        const currentContext = this.currentContext;
        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }
        if(!env) {
            env = currentContext.env
        }
        const tte = await this.coreProvider.transactionsProvider.simulateTransactions([tx], env, ignoreBalance);

        this.busy = false;
        return tte;
    }

    async getEventsByKey(contractAddress: string, eventName: string, key: string, value: string, page: number) {
        /*await this.waitBusy();

        const currentContext = this.currentContext;
        if (!currentContext) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const size = await this.coreProvider.eventsProvider.countEventsByKey(currentContext, contractAddress, eventName, key, value);
        const offset = EVENT_PAGE_SIZE * page;
        const events = await this.coreProvider.eventsProvider.findByEventAndKey(currentContext, contractAddress, eventName, key, value, EVENT_PAGE_SIZE, offset);

        return {
            page,
            per_pages: EVENT_PAGE_SIZE,
            total_pages: Math.floor(size / EVENT_PAGE_SIZE),
            total_events: Math.floor(size),
            events
        };*/
        return null;
    }

    async getEvents(contractAddress: string, eventName: string, page: number) {
        /*
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
        */
        return null;
    }

    private async updateConfigs(ctx: RuntimeContext) {
        const mainWallet = await this.coreProvider.applicationContext.mainWallet;
        const config = await this.configProvider.getByName(ctx, 'blockTime');
        const newBlockTime = parseInt(config.value);
        const isValidator = await this.configProvider.isValidator(ctx, mainWallet.address);
        const minValue = await this.configProvider.getByName(ctx, 'min-bws-block');
        const walletDTO = await this.walletProvider.getWalletBalance(ctx, mainWallet.address);
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