import { Block, EnvironmentChanges, Slice, Tx, TxType } from "@bywise/web3";
import { BlockchainStatus, CompiledContext, ZERO_HASH } from "../types";
import helper from "../utils/helper";
import { Slices } from "../models";
import { CoreProvider } from "../services";
import { RuntimeContext } from "../vm/RuntimeContext";
import { Task } from "../types";
import { RoutingKeys } from "../datasource/message-queue";

const TIME_LIMIT_SLICE = 5000;

export default class MintSlices implements Task {
    public isRun = true;
    private coreProvider;
    private SliceRepository;
    private transactionsProvider;
    private environmentProvider;
    private TransactionRepository;
    private mainWallet;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
        this.mainWallet = coreProvider.applicationContext.mainWallet;
        this.SliceRepository = coreProvider.applicationContext.database.SliceRepository;
        this.transactionsProvider = coreProvider.transactionsProvider;
        this.environmentProvider = coreProvider.environmentProvider;
        this.TransactionRepository = coreProvider.applicationContext.database.TransactionRepository;
    }

    async start() {
    }

    async stop() {
    }

    async run() {
        if (!this.coreProvider.isValidator || !this.coreProvider.hasMinimumBWSToMine) {
            return false;
        }
        const currentMinnedBlock = this.coreProvider.currentBlock;

        let isMiner = await this.isSliceMinner(currentMinnedBlock);
        if (!isMiner) {
            return false; // not is slice minner for this block
        }

        const mainWallet = this.mainWallet;
        let slices = await this.SliceRepository.findByChainAndBlockHeight(this.coreProvider.chain, currentMinnedBlock.height + 1);
        slices = slices.filter(
            info => info.slice.from === mainWallet.address
        ).sort(
            (a, b) => a.slice.height - b.slice.height
        );

        let end = false;
        let executed = true;
        let lastSliceHeight: number = -1;
        let lastSliceHash: string = '';
        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];
            lastSliceHeight = sliceInfo.slice.height;
            lastSliceHash = sliceInfo.slice.hash;
            if (sliceInfo.slice.end) {
                end = true;
            }
            if(sliceInfo.status !== BlockchainStatus.TX_CONFIRMED) {
                executed = false;
            }
        }
        if (end) {
            return false; // slice already ended
        }
        if (!executed) {
            return false; // wait execute slice
        }
        if(!lastSliceHash) {
            const lastSlice = await this.coreProvider.blockProvider.getLastContext(this.coreProvider.chain);
            lastSliceHash = lastSlice.slice.hash;
        }

        const isConnected = this.coreProvider.network.isConnected();
        if (!isConnected) {
            this.coreProvider.applicationContext.logger.error(`mint slice - Node has disconnected!`);
            return false;
        }
        if (helper.getNow() >= currentMinnedBlock.created + this.coreProvider.blockTime * 2) {
            this.coreProvider.applicationContext.logger.error(`mint slice - Too late to mint`);
            return false;
        }

        let newTransactions: Tx[] = [];
        const env = {
            chain: this.coreProvider.chain,
            fromContextHash: CompiledContext.SLICE_MINT_CONTEXT_HASH,
            blockHeight: currentMinnedBlock.height + 1,
            changes: {
                keys: [],
                values: [],
            }
        }
        const ctx = new RuntimeContext(this.environmentProvider, env);
        await this.environmentProvider.compile(this.coreProvider.chain, lastSliceHash, CompiledContext.SLICE_MINT_CONTEXT_HASH);
        const promises: Promise<any>[] = [];

        if (lastSliceHeight == -1) {
            const tx = new Tx();
            tx.version = '3';
            tx.chain = this.coreProvider.chain;
            tx.from = [mainWallet.address];
            tx.to = [mainWallet.address];
            tx.amount = ['0'];
            tx.fee = '0';
            tx.type = TxType.TX_BLOCKCHAIN_COMMAND;
            tx.data = {
                name: 'start-slice',
                input: [`${currentMinnedBlock.height + 1}`]
            };
            tx.foreignKeys = [];
            tx.created = Math.floor(Date.now() / 1000);
            const tte = await this.coreProvider.transactionsProvider.simulateTransactions([tx], lastSliceHash, env, false);
            if (!tte) return false;
            if (tte.error) throw new Error(`Failed create start transaction`);
            const output = tte.outputs[0];
            tx.output = output;
            tx.hash = tx.toHash();
            tx.sign = [await mainWallet.signHash(tx.hash)];
            await this.transactionsProvider.executeTransaction(ctx, tx, output);
            newTransactions.push(tx);
            promises.push(this.transactionsProvider.save([tx]));
            this.coreProvider.applicationContext.mq.send(RoutingKeys.new_tx, tx);
        }

        const uptime = new Date().getTime();
        let currentTime = new Date().getTime();
        while ((currentTime - uptime) < TIME_LIMIT_SLICE && !end) {
            const mempool = this.TransactionRepository.getMempoolArray(1000);

            const successTxs = []
            for (let i = 0; i < mempool.length; i++) {
                const tx = mempool[i];

                if (tx.output.ctx === lastSliceHash) {
                    const error = await this.transactionsProvider.executeTransaction(ctx, tx, tx.output);
                    if (!error) {
                        newTransactions.push(tx);
                        successTxs.push(tx);
                        this.coreProvider.applicationContext.mq.send(RoutingKeys.new_tx, tx);
                    }
                } else {
                    console.log("TRANSAÇÂO IGNORADA", tx.data)
                }
            }
            if (successTxs.length > 0) {
                promises.push(this.transactionsProvider.save(successTxs));
            }
            if (mempool.length == 0) {
                await helper.sleep(100);
            } else {
                this.coreProvider.applicationContext.logger.verbose(`process mempool ${newTransactions.length}/${this.TransactionRepository.mempool.size}`);
            }

            currentTime = new Date().getTime();
            if (!this.isRun) return false;
            if (currentTime / 1000 >= currentMinnedBlock.created + this.coreProvider.blockTime) {
                const tx = new Tx();
                tx.version = '3';
                tx.chain = this.coreProvider.chain;
                tx.from = [mainWallet.address];
                tx.to = [mainWallet.address];
                tx.amount = ['0'];
                tx.fee = '0';
                tx.type = TxType.TX_BLOCKCHAIN_COMMAND;
                tx.data = {
                    name: 'end-slice',
                    input: [`${currentMinnedBlock.height + 1}`]
                };
                tx.foreignKeys = [];
                tx.created = Math.floor(Date.now() / 1000);
                const tte = await this.coreProvider.transactionsProvider.simulateTransactions([tx], lastSliceHash, env, false);
                if (!tte) return false;
                if (tte.error) throw new Error(`Failed create start transaction`);
                const output = tte.outputs[0];
                tx.output = output;
                tx.hash = tx.toHash();
                tx.sign = [await mainWallet.signHash(tx.hash)];
                await this.transactionsProvider.executeTransaction(ctx, tx, output);
                newTransactions.push(tx);
                promises.push(this.transactionsProvider.save([tx]));
                this.coreProvider.applicationContext.mq.send(RoutingKeys.new_tx, tx);
                end = true;
                this.coreProvider.applicationContext.logger.verbose(`mint slice - mint by END`);
            }
        }
        if (newTransactions.length > 0) {
            const envOut = ctx.getEnvOut();
            lastSliceHeight++;
            await Promise.all(promises);
            const sliceInfo = await this.mintSlice(lastSliceHash, lastSliceHeight, newTransactions, currentMinnedBlock, end, envOut);
            await this.environmentProvider.push(envOut, env.chain, CompiledContext.SLICE_MINT_CONTEXT_HASH, sliceInfo.slice.lastHash, sliceInfo.slice.hash);
        }
        return true;
    }

    async isSliceMinner(currentMinnedBlock: Block) {
        const mainWallet = this.mainWallet;
        let isMining = false;
        if (currentMinnedBlock.lastHash === ZERO_HASH) {
            if (currentMinnedBlock.from === mainWallet.address) {
                isMining = true;
            }
        } else {
            const lastBlock = await this.coreProvider.blockProvider.getBlockInfo(currentMinnedBlock.lastHash);
            if (lastBlock.block.from === mainWallet.address) {
                isMining = true;
            }
        }
        return isMining;
    }

    private async mintSlice(lastSliceHash: string, height: number, transactions: Tx[], currentMinnedBlock: Block, end: boolean, changes: EnvironmentChanges): Promise<Slices> {
        if (transactions.length === 0) throw new Error(`mint slice without transactions`);
        const mainWallet = this.mainWallet;

        const slice = new Slice();
        slice.height = height;
        slice.transactionsCount = transactions.length;
        slice.blockHeight = currentMinnedBlock.height + 1;
        slice.transactions = transactions.map(tx => tx.hash);
        slice.version = '3';
        slice.chain = currentMinnedBlock.chain;
        slice.from = mainWallet.address;
        slice.created = Math.floor(Date.now() / 1000);
        slice.lastHash = lastSliceHash;
        slice.end = end;
        slice.hash = slice.toHash();
        slice.sign = await mainWallet.signHash(slice.hash);

        this.coreProvider.applicationContext.logger.info(`mint slice - height: ${slice.blockHeight}/${slice.height} - txs: ${slice.transactions.length} - end: ${slice.end} - hash: ${slice.hash.substring(0, 10)}...`);
        const bslice = await this.coreProvider.slicesProvider.saveNewSlice(slice);
        //const bslice: Slices = {
        //    slice: slice,
        //    isComplete: true,
        //    isExecuted: true,
        //    status: BlockchainStatus.TX_CONFIRMED,
        //    blockHash: ''
        //};
        //await this.environmentProvider.push(changes, bslice.slice.chain, bslice.slice.hash, bslice.slice.lastHash, bslice.slice.hash);
        //await this.SliceRepository.save(bslice);
        //this.coreProvider.applicationContext.mq.send(RoutingKeys.new_slice, slice);
        return bslice;
    }
}