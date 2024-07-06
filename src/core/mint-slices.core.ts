import { Block, Slice, SliceData, Tx, TxType } from "@bywise/web3";
import { BlockchainStatus, BlockTree, CompiledContext, TransactionOutputDTO } from "../types";
import helper from "../utils/helper";
import PipelineChain from "./pipeline-chain.core";
import { Slices } from "../models";
import { CoreProvider } from "../services";

const TIME_LIMIT_SLICE = 5000;

export default class MintSlices {
    public isRun = true;
    private coreProvider;
    private SliceRepository;
    private TransactionRepository;
    private transactionsProvider;
    private environmentProvider;
    private pipelineChain;
    private mainWallet;


    constructor(coreProvider: CoreProvider, pipelineChain: PipelineChain) {
        this.coreProvider = coreProvider;
        this.pipelineChain = pipelineChain;
        this.mainWallet = coreProvider.applicationContext.mainWallet;
        this.SliceRepository = coreProvider.applicationContext.database.SliceRepository;
        this.TransactionRepository = coreProvider.applicationContext.database.TransactionRepository;
        this.transactionsProvider = coreProvider.transactionsProvider;
        this.environmentProvider = coreProvider.environmentProvider;
    }

    async start() {
    }

    async run() {
        if (!this.coreProvider.isValidator || !this.coreProvider.hasMinimumBWSToMine) {
            return;
        }
        const currentMinnedBlock = this.coreProvider.blockTree.currentMinnedBlock;

        let isMiner = await this.isSliceMinner(currentMinnedBlock);
        if (!isMiner) {
            return; // not is slice minner for this block
        }

        const mainWallet = this.mainWallet;
        let slices = await this.SliceRepository.findByChainAndBlockHeight(this.coreProvider.chain, currentMinnedBlock.height + 1);
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
            return; // slice already ended
        }

        const isConnected = this.coreProvider.network.isConnected();
        if (!isConnected) {
            this.coreProvider.applicationContext.logger.error(`mint slice - Node has disconnected!`);
            return;
        }
        if (helper.getNow() >= currentMinnedBlock.created + this.coreProvider.blockTime * 2) {
            this.coreProvider.applicationContext.logger.error(`mint slice - Too late to mint`);
            return;
        }

        let newTransactions: Tx[] = [];
        let transactionsData: SliceData[] = [];
        const env = {
            chain: this.coreProvider.blockTree.chain,
            fromContextHash: CompiledContext.SLICE_MINT_CONTEXT_HASH,
            blockHeight: currentMinnedBlock.height + 1,
            changes: {
                keys: [],
                values: [],
            }
        }
        await this.environmentProvider.consolide(this.coreProvider.blockTree, lastSliceHash, CompiledContext.SLICE_MINT_CONTEXT_HASH);

        if (lastSliceHeight == -1) {
            const tx = new Tx();
            tx.version = '2';
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
            tx.hash = tx.toHash();
            tx.sign = [await mainWallet.signHash(tx.hash)];
            const txInfo = await this.coreProvider.transactionsProvider.saveNewTransaction(tx);
            transactions.set(txInfo.tx.hash, true);
            newTransactions.push(txInfo.tx);
        }

        const uptime = new Date().getTime();
        let currentTime = new Date().getTime();
        while ((currentTime - uptime) < TIME_LIMIT_SLICE && !end) {
            const mempool = await this.TransactionRepository.findByChainAndStatus(currentMinnedBlock.chain, BlockchainStatus.TX_MEMPOOL, 1000);

            currentTime = new Date().getTime();
            for (let i = 0; i < mempool.length && (currentTime - uptime) < TIME_LIMIT_SLICE && currentTime / 1000 < currentMinnedBlock.created + this.coreProvider.blockTime; i++) {
                const txInfo = mempool[i];
                if (!transactions.has(txInfo.tx.hash)) {
                    transactions.set(txInfo.tx.hash, true);
                    if (txInfo.tx.created < currentTime / 1000 - 60) {
                        this.coreProvider.applicationContext.logger.verbose(`mint slice - ignore transaction by time ${txInfo.tx.created} < ${currentTime / 1000 - 60}`);
                        txInfo.status = BlockchainStatus.TX_FAILED;
                        txInfo.output = new TransactionOutputDTO();
                        txInfo.output.error = 'TIMEOUT';
                        await this.coreProvider.transactionsProvider.updateTransaction(txInfo);
                    } else {
                        newTransactions.push(txInfo.tx);
                    }
                }
                if (!this.pipelineChain.isRun) return;
            }
            if (!this.pipelineChain.isRun) return;
            await helper.sleep(10);
            currentTime = new Date().getTime();

            if (currentTime / 1000 >= currentMinnedBlock.created + this.coreProvider.blockTime) {
                const tx = new Tx();
                tx.version = '2';
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
                tx.hash = tx.toHash();
                tx.sign = [await mainWallet.signHash(tx.hash)];
                const txInfo = await this.coreProvider.transactionsProvider.saveNewTransaction(tx);
                transactions.set(txInfo.tx.hash, true);
                newTransactions.push(tx);
                end = true;
                this.coreProvider.applicationContext.logger.verbose(`mint slice - mint by END`);
            }
        }
        if (newTransactions.length > 0) {
            const tte = await this.transactionsProvider.simulateTransactions(newTransactions, env);
            const newTransactionsHash: string[] = [];
            for (let i = 0; i < tte.outputs.length; i++) {
                const tx = tte.txs[i];
                const output = tte.outputs[i];
                if (!output.error) {
                    newTransactionsHash.push(tx.hash);
                } else {
                    const txInfo = await this.transactionsProvider.getTxInfo(tx.hash);
                    txInfo.status = BlockchainStatus.TX_FAILED;
                    txInfo.output = output;
                    await this.coreProvider.transactionsProvider.updateTransaction(txInfo);
                }
            }
            if (newTransactionsHash.length > 0) {
                lastSliceHeight++;
                await this.environmentProvider.push(tte.envOut, env.chain, CompiledContext.SLICE_MINT_CONTEXT_HASH);
                const sliceInfo = await this.mintSlice(lastSliceHeight, newTransactionsHash, transactionsData, currentMinnedBlock, end);
                //await this.saveExecutedSlices(sliceInfo, outputs, ctx);
            }
        }
    }

    async isSliceMinner(currentMinnedBlock: Block) {
        const mainWallet = this.mainWallet;
        let isMining = false;
        if (currentMinnedBlock.lastHash === BlockTree.ZERO_HASH) {
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

    private async mintSlice(height: number, transactions: string[], transactionsData: SliceData[], currentMinnedBlock: Block, end: boolean): Promise<Slices> {
        if (transactions.length === 0) throw new Error(`mint slice without transactions`);
        const mainWallet = this.mainWallet;

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

        this.coreProvider.applicationContext.logger.info(`mint slice - height: ${slice.blockHeight}/${slice.height} - txs: ${slice.transactions.length} - end: ${slice.end} - hash: ${slice.hash.substring(0, 10)}...`);
        const bslice = await this.coreProvider.slicesProvider.saveNewSlice(slice);
        bslice.isComplete = true;

        await this.coreProvider.slicesProvider.updateSlice(bslice);
        this.coreProvider.blockTree.addSlice(slice);
        return bslice;
    }
    /*
    private async saveExecutedSlices(sliceInfo: Slices, outputs: TransactionOutputDTO[]) {
        sliceInfo.isExecuted = true;
        sliceInfo.status = BlockchainStatus.TX_CONFIRMED;
        sliceInfo.outputs = outputs;
        await this.environmentProvider.push(ctx.envContext, sliceInfo.slice.hash);
        for (let j = 0; j < sliceInfo.slice.transactions.length; j++) {
            const txHash = sliceInfo.slice.transactions[j];
            let txInfo = await this.transactionsProvider.getTxInfo(txHash);
            txInfo.status = BlockchainStatus.TX_CONFIRMED;
            txInfo.output = sliceInfo.outputs[j];
            await this.transactionsProvider.updateTransaction(txInfo);
        }
        await this.coreProvider.slicesProvider.updateSlice(sliceInfo);
        this.coreProvider.blockTree.bestSlice = sliceInfo.slice;
    }
    */
}