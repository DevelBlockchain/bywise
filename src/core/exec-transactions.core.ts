import { BywiseHelper, Tx } from "@bywise/web3";
import { Events } from "../models";
import { BlockchainStatus, CoreContext, SimulateDTO } from "../types";
import helper from "../utils/helper";

export default class ExecuteTransactions {
    public isRun = true;
    public busy = false;
    private coreContext;
    private lastHash = '';
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
        await this.updateContext();
    }

    private async updateContext() {
        const lastBlock = this.coreContext.lastBlock;
        if (!lastBlock) throw new Error(`lastBlock block not found`);

        let currentHash;

        const bestSlice = await this.coreContext.slicesProvider.getBestSlice(this.coreContext.blockTree, lastBlock.block);
        if (bestSlice === null) {
            currentHash = '';
        } else {
            currentHash = bestSlice.slice.hash;
        }
        if (this.lastHash !== currentHash) {
            this.lastHash = currentHash;

            this.coreContext.applicationContext.logger.verbose(`update main context`);


            if (bestSlice) {
                const constEvents: Events[] = [];
                const ctx = this.coreContext.transactionsProvider.createContext(this.coreContext.blockTree, lastBlock);
                for (let i = 0; i < bestSlice.slice.transactions.length; i++) {
                    const txHash = bestSlice.slice.transactions[i];
                    const txInfo = ctx.blockTree.getTxInfo(txHash);
                    if (txInfo) {
                        const output = await this.coreContext.transactionsProvider.simulateTransaction(txInfo.tx, bestSlice.slice, ctx);

                        for (let j = 0; j < output.events.length; j++) {
                            const txEvent = output.events[j];
                            const event: Events = {
                                id: BywiseHelper.makeHash(Buffer.from(`${txInfo.tx.chain}-${txInfo.tx.hash}-${j}`, 'utf-8').toString('hex')),
                                chain: txInfo.tx.chain,
                                hash: txInfo.tx.hash,
                                create: txInfo.tx.created,
                                index: j,
                                from: txEvent.from,
                                event: txEvent.event,
                                data: txEvent.data,
                            }
                            constEvents.push(event);
                        }
                        txInfo.status = BlockchainStatus.TX_CONFIRMED;
                        txInfo.isExecuted = true;
                        txInfo.slicesHash = bestSlice.slice.hash;
                        txInfo.output = output;
                        await this.coreContext.transactionsProvider.updateTransaction(txInfo);
                    }
                }
                await this.waitBusy();
                await this.coreContext.applicationContext.database.EventsRepository.save(constEvents);
                const oldContext = this.currentContext;
                this.currentContext = ctx;
                this.coreContext.bestSlice = bestSlice;
                if (oldContext) {
                    await this.coreContext.transactionsProvider.disposeContext(oldContext);
                }
                this.busy = false;
            }
        }
    }

    async getContract(address: string) {
        await this.waitBusy();

        const currentContext = this.currentContext;
        const bestSlice = this.coreContext.bestSlice;

        if (!currentContext || !bestSlice) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const bcc = await this.coreContext.environmentProvider.get(currentContext.blockTree, currentContext.block.hash, address);

        this.busy = false;
        return bcc;
    }

    async getWalletInfo(address: string) {
        await this.waitBusy();

        const currentContext = this.currentContext;
        const bestSlice = this.coreContext.bestSlice;

        if (!currentContext || !bestSlice) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        const balanceDTO = await this.coreContext.walletProvider.getWalletBalance(currentContext.blockTree, currentContext.block.hash, address);
        const infoDTO = await this.coreContext.walletProvider.getWalletInfo(currentContext.blockTree, currentContext.block.hash, address);

        this.busy = false;
        return {
            ...balanceDTO,
            ...infoDTO,
            balance: balanceDTO.balance.toString(),
        };
    }

    async executeSimulation(tx: Tx, simulateWallet: boolean) {
        await this.waitBusy();

        const currentContext = this.currentContext;
        const bestSlice = this.coreContext.bestSlice;

        if (!currentContext || !bestSlice) {
            this.busy = false;
            throw new Error('currentContext not found')
        }

        await this.coreContext.transactionsProvider.createSubContext(currentContext);
        currentContext.simulateWallet = simulateWallet;
        currentContext.enableReadProxy = true;
        const output = await this.coreContext.transactionsProvider.simulateTransaction(tx, bestSlice.slice, currentContext);
        currentContext.enableReadProxy = false;
        await this.coreContext.transactionsProvider.disposeSubContext(currentContext);

        this.busy = false;
        return output;
    }
}