import { Block, Slice, SliceData, Tx, TxType } from "@bywise/web3";
import { RequestKeys } from "../datasource/message-queue";
import { BlockchainStatus, CoreContext, SimulateDTO, TransactionOutputDTO } from "../types";
import { BlockTree, CompiledContext } from "../types/environment.types";
import helper from "../utils/helper";
import PipelineChain from "./pipeline-chain.core";
import { Slices } from "../models";

const TIME_LIMIT_SLICE = 5000;

export default class MintSlices {
    public isRun = true;
    private coreContext;
    private SliceRepository;
    private TransactionRepository;
    private transactionsProvider;
    private environmentProvider;
    private pipelineChain;


    constructor(coreContext: CoreContext, pipelineChain: PipelineChain) {
        this.coreContext = coreContext;
        this.pipelineChain = pipelineChain;
        this.SliceRepository = coreContext.applicationContext.database.SliceRepository;
        this.TransactionRepository = coreContext.applicationContext.database.TransactionRepository;
        this.transactionsProvider = coreContext.transactionsProvider;
        this.environmentProvider = coreContext.environmentProvider;
    }

    async start() {
    }

    async run() {
        const currentMinnedBlock = this.coreContext.blockTree.currentMinnedBlock;

        let isMiner = await this.isSliceMinner(currentMinnedBlock);
        if (!isMiner) {
            return; // not is slice minner for this block
        }

        const isConnected = this.coreContext.network.isConnected();
        if (!isConnected) {
            this.coreContext.applicationContext.logger.error(`mint slice - Node has disconnected!`)
            this.pipelineChain.stop().then(() => {
                this.pipelineChain.start();
            });
            return;
        }

        if (helper.getNow() >= currentMinnedBlock.created + this.coreContext.blockTime * 2) {
            return; // too late
        }

        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
        let slices = await this.SliceRepository.findByChainAndBlockHeight(this.coreContext.chain, currentMinnedBlock.height + 1);
        slices = slices.filter(
            info => info.slice.from === mainWallet.address
        ).sort(
            (a, b) => a.slice.height - b.slice.height
        );

        const transactions: Map<string, boolean> = new Map();
        let end = false;
        let lastSliceHeight: number = -1;
        let lastSliceHash: string = currentMinnedBlock.hash;
        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];
            lastSliceHeight = sliceInfo.slice.height;
            lastSliceHash = sliceInfo.slice.hash;
            if (sliceInfo.slice.end) {
                end = true;
            }
            for (let j = 0; j < sliceInfo.slice.transactions.length; j++) {
                const txHash = sliceInfo.slice.transactions[j];
                transactions.set(txHash, true);
            }
        }
        if (end) {
            return;
        }

        let outputs: TransactionOutputDTO[] = [];
        let newTransactions: string[] = [];
        let transactionsData: SliceData[] = [];
        await this.environmentProvider.consolide(this.coreContext.blockTree, lastSliceHash, CompiledContext.SLICE_MINT_CONTEXT_HASH);
        const ctx = this.transactionsProvider.createContext(this.coreContext.blockTree, CompiledContext.SLICE_MINT_CONTEXT_HASH, currentMinnedBlock.height + 1);
        ctx.enableReadProxy = true;
        ctx.enableWriteProxy = true;

        if (lastSliceHeight == -1) {
            const tx = new Tx();
            tx.version = '2';
            tx.chain = this.coreContext.chain;
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
            tx.hash = tx.toHash();
            tx.sign = [await mainWallet.signHash(tx.hash)];
            const txInfo = await this.coreContext.transactionsProvider.saveNewTransaction(tx);

            let output = await this.coreContext.transactionsProvider.simulateTransaction(txInfo.tx, {
                from: mainWallet.address,
                transactionsData: []
            }, ctx);
            if (output.error) {
                throw new Error(`mint slice - can not create start-slice transaction - ${output.error}`);
            } else {
                if (ctx.proxyMock.length > 0) {
                    transactionsData.push({
                        hash: txInfo.tx.hash,
                        data: ctx.proxyMock
                    });
                }
                transactions.set(txInfo.tx.hash, true);
                newTransactions.push(txInfo.tx.hash);
                outputs.push(output);
                this.coreContext.environmentProvider.commit(ctx.envContext);
            }
        }

        const uptime = new Date().getTime();
        let currentTime = new Date().getTime();
        let executedTime = 0;
        while ((currentTime - uptime) < TIME_LIMIT_SLICE) {
            const mempool = await this.TransactionRepository.findByChainAndStatus(currentMinnedBlock.chain, BlockchainStatus.TX_MEMPOOL, 1000);

            let countSimulatedTransactions = 0;
            for (let i = 0; i < mempool.length && (currentTime - uptime) < TIME_LIMIT_SLICE && currentTime / 1000 < currentMinnedBlock.created + this.coreContext.blockTime; i++) {
                currentTime = new Date().getTime();
                const txInfo = mempool[i];
                if (!transactions.has(txInfo.tx.hash)) {
                    transactions.set(txInfo.tx.hash, true);
                    if (txInfo.tx.created < currentTime / 1000 - 60) {
                        this.coreContext.applicationContext.logger.verbose(`mint slice - ignore transaction by time ${txInfo.tx.created} < ${currentTime / 1000 - 60}`);
                        txInfo.status = BlockchainStatus.TX_FAILED;
                        txInfo.output = new TransactionOutputDTO();
                        txInfo.output.error = 'TIMEOUT';
                        await this.coreContext.transactionsProvider.updateTransaction(txInfo);
                    } else {
                        let output = await this.coreContext.transactionsProvider.simulateTransaction(txInfo.tx, {
                            from: mainWallet.address,
                            transactionsData: []
                        }, ctx);
                        if (output.error) {
                            txInfo.status = BlockchainStatus.TX_FAILED;
                            txInfo.output = output;
                            await this.coreContext.transactionsProvider.updateTransaction(txInfo);
                            this.coreContext.environmentProvider.deleteCommit(ctx.envContext);
                            this.coreContext.applicationContext.logger.verbose(`mint slice - invalidate transaction ${txInfo.tx.hash} - "${output.error}"`)
                        } else {
                            if (ctx.proxyMock.length > 0) {
                                transactionsData.push({
                                    hash: txInfo.tx.hash,
                                    data: ctx.proxyMock
                                });
                            }
                            newTransactions.push(txInfo.tx.hash);
                            outputs.push(output);
                            this.coreContext.environmentProvider.commit(ctx.envContext);
                        }
                        countSimulatedTransactions++;
                        const spendTime = new Date().getTime() - currentTime;
                        if (spendTime > 100) {
                            this.coreContext.applicationContext.logger.warn(`mint slice - slow transaction: ${spendTime} - ${txInfo.tx.hash}`);
                        }
                        executedTime += spendTime;
                    }
                }
                if (!this.pipelineChain.isRun) return;
            }
            if (!this.pipelineChain.isRun) return;
            await helper.sleep(10);
            currentTime = new Date().getTime();

            if (currentTime / 1000 >= currentMinnedBlock.created + this.coreContext.blockTime) {
                const tx = new Tx();
                tx.version = '2';
                tx.chain = this.coreContext.chain;
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
                tx.hash = tx.toHash();
                tx.sign = [await mainWallet.signHash(tx.hash)];
                const txInfo = await this.coreContext.transactionsProvider.saveNewTransaction(tx);

                let output = await this.coreContext.transactionsProvider.simulateTransaction(txInfo.tx, {
                    from: mainWallet.address,
                    transactionsData: []
                }, ctx);
                if (output.error) {
                    throw new Error(`mint slice - can not create end-slice transaction - ${output.error}`);
                } else {
                    if (ctx.proxyMock.length > 0) {
                        transactionsData.push({
                            hash: txInfo.tx.hash,
                            data: ctx.proxyMock
                        });
                    }
                    transactions.set(txInfo.tx.hash, true);
                    newTransactions.push(txInfo.tx.hash);
                    outputs.push(output);
                    this.coreContext.environmentProvider.commit(ctx.envContext);
                    end = true;
                    this.coreContext.applicationContext.logger.verbose(`mint slice - mint by END`)
                }
                break;
            }
        }
        if (newTransactions.length > 0) {
            lastSliceHeight++;
            this.coreContext.applicationContext.logger.verbose(`mint slice - ${(newTransactions.length / (executedTime / 1000)).toFixed(2)} TPS - simulate ${newTransactions.length} transactions in ${executedTime / 1000}`)
            const sliceInfo = await this.mintSlice(lastSliceHeight, newTransactions, transactionsData, currentMinnedBlock, end);
            await this.saveExecutedSlices(sliceInfo, outputs, ctx);
        }
        await this.transactionsProvider.disposeContext(ctx);
    }

    async isSliceMinner(currentMinnedBlock: Block) {
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
        let isMining = false;
        if (currentMinnedBlock.lastHash === BlockTree.ZERO_HASH) {
            if (currentMinnedBlock.from === mainWallet.address) {
                isMining = true;
            }
        } else {
            const lastBlock = await this.coreContext.blockProvider.getBlockInfo(currentMinnedBlock.lastHash);
            if (lastBlock.block.from === mainWallet.address) {
                isMining = true;
            }
        }
        return isMining;
    }

    private async mintSlice(height: number, transactions: string[], transactionsData: SliceData[], currentMinnedBlock: Block, end: boolean): Promise<Slices> {
        if (transactions.length === 0) throw new Error(`mint slice without transactions`);
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        const slice = new Slice();
        slice.height = height;
        slice.transactionsCount = transactions.length;
        slice.blockHeight = currentMinnedBlock.height + 1;
        slice.transactions = transactions;
        slice.transactionsData = transactionsData.length === 0 ? undefined : transactionsData;
        slice.version = '2';
        slice.chain = currentMinnedBlock.chain;
        slice.from = mainWallet.address;
        slice.created = Math.floor(Date.now() / 1000);
        slice.end = end;
        slice.hash = slice.toHash();
        slice.sign = await mainWallet.signHash(slice.hash);

        this.coreContext.applicationContext.logger.info(`mint slice - height: ${slice.blockHeight}/${slice.height} - txs: ${slice.transactions.length} - end: ${slice.end} - hash: ${slice.hash.substring(0, 10)}...`);
        const bslice = await this.coreContext.slicesProvider.saveNewSlice(slice);
        bslice.isComplete = true;

        await this.coreContext.slicesProvider.updateSlice(bslice);
        this.coreContext.blockTree.addSlice(slice);
        return bslice;
    }

    private async saveExecutedSlices(sliceInfo: Slices, outputs: TransactionOutputDTO[], ctx: SimulateDTO) {
        sliceInfo.isExecuted = true;
        sliceInfo.status = BlockchainStatus.TX_CONFIRMED;
        sliceInfo.outputs = outputs;
        this.environmentProvider.commit(ctx.envContext);
        await this.environmentProvider.push(ctx.envContext, sliceInfo.slice.hash);
        for (let j = 0; j < sliceInfo.slice.transactions.length; j++) {
            const txHash = sliceInfo.slice.transactions[j];
            let txInfo = await this.transactionsProvider.getTxInfo(txHash);
            txInfo.status = BlockchainStatus.TX_CONFIRMED;
            txInfo.output = sliceInfo.outputs[j];
            await this.transactionsProvider.updateTransaction(txInfo);
        }
        await this.coreContext.slicesProvider.updateSlice(sliceInfo);
        this.coreContext.blockTree.bestSlice = sliceInfo.slice;
    }
}