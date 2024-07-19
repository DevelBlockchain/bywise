import { Block, EnvironmentChanges, Slice, Tx, TxType } from "@bywise/web3";
import { BlockchainStatus, CompiledContext, TransactionsToExecute, ZERO_HASH } from "../types";
import helper from "../utils/helper";
import { Slices } from "../models";
import { CoreProvider } from "../services";
import { RuntimeContext } from "../vm/RuntimeContext";
import { Task } from "../types";
import { RoutingKeys } from "../datasource/message-queue";

const TIME_LIMIT_SLICE = 5000;
const MEMPOOL_SIZE = 10000;
const BATCH_SIZE = 1000;

export default class MintSlices {
    private task: Task;
    private coreProvider;
    private SliceRepository;
    private transactionsProvider;
    private environmentProvider;
    private TransactionRepository;
    private mainWallet;

    constructor(task: Task, coreProvider: CoreProvider) {
        this.task = task;
        this.coreProvider = coreProvider;
        this.mainWallet = coreProvider.applicationContext.mainWallet;
        this.SliceRepository = coreProvider.applicationContext.database.SliceRepository;
        this.transactionsProvider = coreProvider.transactionsProvider;
        this.environmentProvider = coreProvider.environmentProvider;
        this.TransactionRepository = coreProvider.applicationContext.database.TransactionRepository;
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
        let lastSliceCreated: number = -1;
        let lastSliceHeight: number = -1;
        let lastSliceHash: string = '';
        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];
            lastSliceHeight = sliceInfo.slice.height;
            lastSliceHash = sliceInfo.slice.hash;
            lastSliceCreated = sliceInfo.slice.created;
            if (sliceInfo.slice.end) {
                end = true;
            }
            if (sliceInfo.status !== BlockchainStatus.TX_CONFIRMED) {
                executed = false;
            }
        }
        if (end) {
            return false; // slice already ended
        }
        if (!executed) {
            return false; // wait execute slice
        }
        if (!lastSliceHash) {
            const lastSlice = await this.coreProvider.blockProvider.getLastContext(this.coreProvider.chain);
            lastSliceHash = lastSlice.slice.hash;
            lastSliceCreated = lastSlice.slice.created;
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
            tx.output.ctx = lastSliceHash;
            tx.hash = tx.toHash();
            tx.sign = [await mainWallet.signHash(tx.hash)];
            await this.transactionsProvider.executeTransaction(ctx, tx, tx.output);
            newTransactions.push(tx);
            this.transactionsProvider.save([tx]);
            this.coreProvider.applicationContext.mq.send(RoutingKeys.new_tx, tx);
        }

        const uptime = new Date().getTime();
        let currentTime = new Date().getTime();
        while ((currentTime - uptime) < TIME_LIMIT_SLICE && !end) {
            const mempool = this.TransactionRepository.getMempoolArray(MEMPOOL_SIZE);

            if (mempool.length > 0) {
                //this.coreProvider.applicationContext.logger.verbose(`process mempool ${mempool.length}/${this.TransactionRepository.mempool.size}`);
                let batch = [];
                const promises: Promise<void>[] = [];
                const processSimulatedTransactions = async (tte: TransactionsToExecute | null) => {
                    if (tte) {
                        for (let j = 0; j < tte.txs.length; j++) {
                            const tx = tte.txs[j];
                            const output = tte.outputs[j];

                            const error = await this.transactionsProvider.executeTransaction(ctx, tx, output);
                            if (!error) {
                                newTransactions.push(tx);
                                this.coreProvider.applicationContext.mq.send(RoutingKeys.new_tx, tx);
                            }
                        }
                    }
                }
                for (let i = 0; i < mempool.length; i++) {
                    const tx = mempool[i];
                    batch.push(tx);
                    if (batch.length >= BATCH_SIZE) {
                        promises.push(this.transactionsProvider.simulateTransactions(batch, lastSliceHash, env).then(processSimulatedTransactions));
                        batch = [];
                    }
                }
                if (batch.length > 0) {
                    promises.push(this.transactionsProvider.simulateTransactions(batch, lastSliceHash, env).then(processSimulatedTransactions));
                }
                await Promise.all(promises);

                /*const successTxs: Tx[] = [];
                for (let i = 0; i < mempool.length; i++) {
                    const tx = mempool[i];
                    const output = tx.output;
                    if (output.ctx === lastSliceHash) {
                        const error = await this.transactionsProvider.executeTransaction(ctx, tx, output);
                        if (!error) {
                            newTransactions.push(tx);
                            successTxs.push(tx);
                            this.coreProvider.applicationContext.mq.send(RoutingKeys.new_tx, tx);
                        } else {
                            console.log("EERRROORR", error, tx.output, output)
                        }
                    }
                }
                this.TransactionRepository.saveTxMany(successTxs);*/
            } else {
                await helper.sleep(100);
            }
            if (!this.task.isRun) return false;

            currentTime = new Date().getTime();
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
                tx.output.ctx = lastSliceHash;
                tx.hash = tx.toHash();
                tx.sign = [await mainWallet.signHash(tx.hash)];
                await this.transactionsProvider.executeTransaction(ctx, tx, tx.output);
                newTransactions.push(tx);
                this.transactionsProvider.save([tx]);
                this.coreProvider.applicationContext.mq.send(RoutingKeys.new_tx, tx);
                end = true;
                this.coreProvider.applicationContext.logger.verbose(`mint slice - mint by END`);
            }
        }
        if (newTransactions.length > 0) {
            const envOut = ctx.getEnvOut();
            lastSliceHeight++;
            const sliceInfo = await this.mintSlice(lastSliceHash, lastSliceHeight, newTransactions, currentMinnedBlock, end, envOut);
            await this.environmentProvider.push(envOut, env.chain, CompiledContext.SLICE_MINT_CONTEXT_HASH, sliceInfo.slice.lastHash, sliceInfo.slice.hash);
            this.coreProvider.applicationContext.logger.debug(`MINT SLICE - TPS: ${sliceInfo.slice.transactionsCount/(sliceInfo.slice.created-lastSliceCreated)}`);
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

        const bslice: Slices = {
            slice: slice,
            attempts: 0,
            status: BlockchainStatus.TX_CONFIRMED,
            blockHash: ''
        };
        await this.environmentProvider.push(changes, bslice.slice.chain, bslice.slice.hash, bslice.slice.lastHash, bslice.slice.hash);
        await this.SliceRepository.save(bslice);
        this.coreProvider.applicationContext.mq.send(RoutingKeys.new_slice, slice);
        this.coreProvider.applicationContext.logger.info(`mint slice - height: ${slice.blockHeight}/${slice.height} - txs: ${slice.transactions.length} - end: ${slice.end} - hash: ${slice.hash.substring(0, 10)}...`);
        return bslice;
    }
}