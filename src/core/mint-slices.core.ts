import { Block, Slice, SliceData, Tx, TxType } from "@bywise/web3";
import { RequestKeys } from "../datasource/message-queue";
import { Blocks, Slices } from "../models";
import { BlockchainStatus, CoreContext, TransactionOutputDTO } from "../types";
import { BlockTree } from "../types/environment.types";
import helper from "../utils/helper";
import PipelineChain from "./pipeline-chain.core";

export default class MintSlices {
    public isRun = true;
    public isRunStream = false;
    private coreContext;
    private pipelineChain;
    private lastHash = '';


    constructor(coreContext: CoreContext, pipelineChain: PipelineChain) {
        this.coreContext = coreContext;
        this.pipelineChain = pipelineChain;
    }

    async start() {
        const lastBlock = this.coreContext.lastBlock;
        if (!lastBlock) throw new Error(`lastBlock block not found`);

        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
        let slices = await this.coreContext.applicationContext.database.SliceRepository.findByChainAndStatus(this.coreContext.chain, BlockchainStatus.TX_MEMPOOL);
        slices = this.coreContext.blockTree.sliceInfoList.filter(info => info.slice.blockHeight === lastBlock.block.height + 1 && info.slice.from === mainWallet.address);

        let bestSlice: Slices | null = null;
        for (let i = 0; i < slices.length; i++) {
            const slice = slices[i];
            if (bestSlice === null || slice.slice.transactions.length > bestSlice.slice.transactions.length) {
                bestSlice = slice;
                if (bestSlice.slice.end) {
                    break;
                }
            }
        }

        if (bestSlice && !bestSlice.slice.end) {
            this.coreContext.applicationContext.logger.verbose(`mint slice - RECOVER slice stream at block ${lastBlock.block.height + 1}`)
            this.sliceStream(lastBlock, bestSlice.slice.transactions, bestSlice.slice.transactionsData ? bestSlice.slice.transactionsData : []);
        }
    }

    async run() {
        const lastBlock = this.coreContext.lastBlock;
        if (!lastBlock) throw new Error(`lastBlock block not found`);

        if (this.lastHash === lastBlock.block.hash) {
            return;
        }
        this.lastHash = lastBlock.block.hash;

        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
        const slices = this.coreContext.blockTree.sliceInfoList.filter(info => info.slice.blockHeight === lastBlock.block.height + 1 && info.slice.from === mainWallet.address);

        if (slices.length > 0) {
            return; // already started
        }

        let isMiner = await this.isSliceMinner(lastBlock);
        if (!isMiner) {
            return; // not is slice minner for this block
        }

        const now = helper.getNow();
        if (now >= lastBlock.block.created + this.coreContext.blockTime) {
            return; // too late
        }

        await this.startSliceStream(lastBlock);
    }

    async stop() {
        this.isRun = false;
        while (this.isRunStream) {
            await helper.sleep(100);
        }
    }

    async isSliceMinner(lastBlock: Blocks) {
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
        let isMining = false;
        if (lastBlock.block.lastHash === BlockTree.ZERO_HASH) {
            if (lastBlock.block.from === mainWallet.address) {
                isMining = true;
            }
        } else {
            const lastlastBlock = this.coreContext.blockTree.getBlockInfo(lastBlock.block.lastHash);
            if (!lastlastBlock) throw new Error(`lastlastBlock block not found`);

            if (lastlastBlock.block.lastHash === BlockTree.ZERO_HASH) {
                if (lastlastBlock.block.from === mainWallet.address) {
                    isMining = true;
                }
            } else {
                const lastlastlastBlock = this.coreContext.blockTree.getBlockInfo(lastBlock.block.lastHash);
                if (!lastlastlastBlock) throw new Error(`lastlastlastBlock block not found`);
                if (lastlastlastBlock.block.from === mainWallet.address) {
                    isMining = true;
                }
            }
        }
        return isMining;
    }

    async startSliceStream(lastBlock: Blocks) {
        this.isRunStream = true;
        this.coreContext.applicationContext.logger.verbose(`mint slice - start slice stream at block ${lastBlock.block.height + 1}`)

        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
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
            input: [`${lastBlock.block.height + 1}`]
        };
        tx.foreignKeys = [];
        tx.created = Math.floor(Date.now() / 1000);
        tx.hash = tx.toHash();
        tx.sign = [await mainWallet.signHash(tx.hash)];
        const txInfo = await this.coreContext.transactionsProvider.saveNewTransaction(tx);
        await this.coreContext.transactionsProvider.populateTxInfo(this.coreContext.blockTree, tx.hash);

        this.sliceStream(lastBlock, [txInfo.tx.hash], []);
    }

    private async sliceStream(lastBlock: Blocks, transactions: string[], transactionsData: SliceData[]) {
        const ctx = this.coreContext.transactionsProvider.createContext(this.coreContext.blockTree, lastBlock);
        ctx.simulateWallet = false;
        ctx.enableReadProxy = true;
        ctx.enableWriteProxy = true;
        let end = false;
        const countExec = new Map<string, number>();
        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        for (let i = 0; i < transactions.length; i++) {
            const txHash = transactions[i];
            const txInfo = await this.coreContext.applicationContext.database.TransactionRepository.findByHash(txHash);
            if (!txInfo) throw new Error('mint slice - txInfo not found');

            const output = await this.coreContext.transactionsProvider.simulateTransaction(txInfo.tx, {
                from: mainWallet.address,
                transactionsData: []
            }, ctx);
            if (output.error) {
                this.coreContext.applicationContext.logger.error('mint slice - ' + output.error)
                throw new Error('mint slice - error added TX');
            }
        }

        let mint = true;
        let uptime = new Date().getTime();
        let addTransactions = 0;
        const LIMIT_BY_NEW_SLICE = 1000;
        do {
            const mempool = await this.coreContext.applicationContext.database.TransactionRepository.findByChainAndStatus(lastBlock.block.chain, BlockchainStatus.TX_MEMPOOL);
            const now = helper.getNow();

            if (now >= lastBlock.block.created + this.coreContext.blockTime) {
                end = true;
                mint = true;
                this.coreContext.applicationContext.logger.verbose(`mint slice - mint by END`)
            }
            let countSimulatedTransactions = 0;
            let simulateUptime = new Date().getTime();
            for (let i = 0; i < mempool.length && (new Date().getTime() - simulateUptime) < 1000; i++) {
                const txInfo = mempool[i];
                if (!transactions.includes(txInfo.tx.hash)) {
                    if (txInfo.tx.created < now - 60) {
                        this.coreContext.applicationContext.logger.verbose(`mint slice - ignore transaction by time ${txInfo.tx.created} < ${now - 60}`);
                        txInfo.status = BlockchainStatus.TX_FAILED;
                        txInfo.output = new TransactionOutputDTO();
                        txInfo.output.error = 'TIMEOUT';
                        await this.coreContext.transactionsProvider.updateTransaction(txInfo);
                    } else {
                        countSimulatedTransactions++;
                        await this.coreContext.transactionsProvider.createSubContext(ctx);
                        let output = await this.coreContext.transactionsProvider.simulateTransaction(txInfo.tx, {
                            from: mainWallet.address,
                            transactionsData: []
                        }, ctx);
                        if (output.error) {
                            let count = countExec.get(txInfo.tx.hash);
                            if (count === undefined) {
                                count = 0;
                            }
                            count++;
                            countExec.set(txInfo.tx.hash, count);
                            if (count >= 10) {
                                txInfo.status = BlockchainStatus.TX_FAILED;
                                txInfo.output = output;
                                await this.coreContext.transactionsProvider.updateTransaction(txInfo);
                                this.coreContext.applicationContext.logger.verbose(`mint slice - invalidate transaction ${txInfo.tx.hash}`)
                            }
                            this.coreContext.applicationContext.logger.verbose('mint slice - ERROR: ' + output.error + ' - ' + count)
                            await this.coreContext.transactionsProvider.disposeSubContext(ctx);
                        } else {
                            if (ctx.proxyMock.length > 0) {
                                transactionsData.push({
                                    hash: txInfo.tx.hash,
                                    data: ctx.proxyMock
                                });
                            }
                            transactions.push(txInfo.tx.hash);
                            addTransactions++;
                        }
                    }
                }
            }
            simulateUptime = new Date().getTime() - simulateUptime;
            if (countSimulatedTransactions > 0)
                this.coreContext.applicationContext.logger.verbose(`mint slice - ${(countSimulatedTransactions / (simulateUptime / 1000)).toFixed(2)} TPS - simulate ${countSimulatedTransactions} transactions in ${simulateUptime / 1000}`)

            if (new Date().getTime() - uptime > 5000 && addTransactions > 0) {
                mint = true;
            }

            if (addTransactions >= LIMIT_BY_NEW_SLICE) {
                mint = true;
            }

            if (now >= lastBlock.block.created + this.coreContext.blockTime * 1.5) {
                end = true;
                mint = false;
                this.coreContext.applicationContext.logger.verbose(`mint slice - SKIP slice end ${lastBlock.block.height + 1}`)
            }

            if (mint) {
                await this.mintSlice(transactions, transactionsData, lastBlock.block, end);
                uptime = new Date().getTime();
                addTransactions = 0;
                mint = false;
            }
            await helper.wait();
        } while (!end && this.isRun);
        await this.coreContext.transactionsProvider.disposeContext(ctx);
        this.isRunStream = false;
    }

    private async mintSlice(transactions: string[], transactionsData: SliceData[], lastBlock: Block, end: boolean) {
        const isConnected = await this.coreContext.applicationContext.mq.request(RequestKeys.test_connection, {
            chain: this.coreContext.chain
        })
        if (!isConnected) {
            this.coreContext.applicationContext.logger.verbose(`mint slice - Node has disconnected!`)
            this.pipelineChain.stop().then(() => {
                this.pipelineChain.start();
            });
            return;
        }

        const mainWallet = await this.coreContext.walletProvider.getMainWallet();

        const slice = new Slice();
        slice.height = 0;
        slice.transactionsCount = transactions.length;
        slice.blockHeight = lastBlock.height + 1;
        slice.transactions = transactions;
        slice.transactionsData = transactionsData.length === 0 ? undefined : transactionsData;
        slice.version = '2';
        slice.chain = lastBlock.chain;
        slice.from = mainWallet.address;
        slice.created = Math.floor(Date.now() / 1000);
        slice.end = end;
        slice.hash = slice.toHash();
        slice.sign = await mainWallet.signHash(slice.hash);

        this.coreContext.applicationContext.logger.verbose(`mint slice - height: ${slice.blockHeight} - txs: ${slice.transactions.length} - end: ${slice.end} - hash: ${slice.hash.substring(0, 10)}...`)
        const bslice = await this.coreContext.slicesProvider.saveNewSlice(slice);
        bslice.isComplete = true;
        await this.coreContext.slicesProvider.updateSlice(bslice);
        await this.coreContext.slicesProvider.populateSliceInfo(this.coreContext.blockTree, slice.hash);

        return slice;
    }
}