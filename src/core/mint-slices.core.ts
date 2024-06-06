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
    private SliceRepository;
    private TransactionRepository;
    private pipelineChain;
    private lastHash = '';


    constructor(coreContext: CoreContext, pipelineChain: PipelineChain) {
        this.coreContext = coreContext;
        this.pipelineChain = pipelineChain;
        this.SliceRepository = coreContext.applicationContext.database.SliceRepository;
        this.TransactionRepository = coreContext.applicationContext.database.TransactionRepository;
    }

    async start() {
    }

    async run() {
        if (this.isRunStream) {
            return; // already started
        }

        const currentMinnedBlock = this.coreContext.blockTree.currentMinnedBlock;

        if (this.lastHash === currentMinnedBlock.hash) {
            return;
        }
        this.lastHash = currentMinnedBlock.hash;

        let isMiner = await this.isSliceMinner(currentMinnedBlock);
        if (!isMiner) {
            return; // not is slice minner for this block
        }

        const now = helper.getNow();
        if (now >= currentMinnedBlock.created + this.coreContext.blockTime) {
            return; // too late
        }

        this.isRunStream = true;
        this.startSliceStream(currentMinnedBlock);
    }

    async startSliceStream(currentMinnedBlock: Block) {
        this.coreContext.applicationContext.logger.verbose(`mint slice - START minting slice ${currentMinnedBlock.height + 1}`);

        const mainWallet = await this.coreContext.walletProvider.getMainWallet();
        let slices = await this.SliceRepository.findByChainAndBlockHeight(this.coreContext.chain, currentMinnedBlock.height + 1);
        slices = slices.filter(
            info => info.slice.from === mainWallet.address
        ).sort(
            (a, b) => a.slice.height - b.slice.height
        );

        const ctx = this.coreContext.transactionsProvider.createContext(this.coreContext.blockTree, currentMinnedBlock.hash, currentMinnedBlock.height + 1);
        ctx.enableReadProxy = true;
        ctx.enableWriteProxy = true;
        let end = false;
        let transactionsData: SliceData[] = [];
        const transactions: Map<string, boolean> = new Map();
        let newTransactions: string[] = [];
        let lastSliceHeight: number = -1;
        let mint = false;
        const LIMIT_BY_NEW_SLICE = 1000;
        let addTransactions = 0;

        for (let i = 0; i < slices.length; i++) {
            const sliceInfo = slices[i];
            lastSliceHeight = sliceInfo.slice.height;
            for (let j = 0; j < sliceInfo.slice.transactions.length; j++) {
                const txHash = sliceInfo.slice.transactions[j];

                if (!transactions.has(txHash)) {
                    transactions.set(txHash, true);

                    const txInfo = await this.coreContext.applicationContext.database.TransactionRepository.findByHash(txHash);
                    if (!txInfo) throw new Error('mint slice - txInfo not found');

                    const output = await this.coreContext.transactionsProvider.simulateTransaction(txInfo.tx, {
                        from: mainWallet.address,
                        transactionsData: sliceInfo.slice.transactionsData
                    }, ctx);
                    if (output.error) {
                        this.coreContext.applicationContext.logger.error('mint slice - ' + output.error)
                        throw new Error('mint slice - error added TX');
                    }
                }
            }
        }

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
                addTransactions++;
                mint = true;
            }
        }

        let uptime = new Date().getTime();
        do {
            const now = helper.getNow();

            const mempool = await this.TransactionRepository.findByChainAndStatus(currentMinnedBlock.chain, BlockchainStatus.TX_MEMPOOL);

            let countSimulatedTransactions = 0;
            let simulateUptime = new Date().getTime();
            for (let i = 0; i < mempool.length && (new Date().getTime() - simulateUptime) < 1000; i++) {
                const txInfo = mempool[i];
                if (!transactions.has(txInfo.tx.hash)) {
                    if (txInfo.tx.created < now - 60) {
                        //this.coreContext.applicationContext.logger.verbose(`mint slice - ignore transaction by time ${txInfo.tx.created} < ${now - 60}`);
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
                            txInfo.status = BlockchainStatus.TX_FAILED;
                            txInfo.output = output;
                            await this.coreContext.transactionsProvider.updateTransaction(txInfo);
                            await this.coreContext.transactionsProvider.disposeSubContext(ctx);
                            //this.coreContext.applicationContext.logger.verbose(`mint slice - invalidate transaction ${txInfo.tx.hash}`)
                        } else {
                            if (ctx.proxyMock.length > 0) {
                                transactionsData.push({
                                    hash: txInfo.tx.hash,
                                    data: ctx.proxyMock
                                });
                            }
                            transactions.set(txInfo.tx.hash, true);
                            newTransactions.push(txInfo.tx.hash);
                            addTransactions++;
                            await this.coreContext.transactionsProvider.mergeContext(ctx, ctx.simulationIds[ctx.simulationIds.length - 2]);
                            await this.coreContext.transactionsProvider.disposeSubContext(ctx);
                        }
                    }
                }
            }
            if (now >= currentMinnedBlock.created + this.coreContext.blockTime) {
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
                    addTransactions++;
                    end = true;
                    mint = true;
                    this.coreContext.applicationContext.logger.verbose(`mint slice - mint by END`)
                }
            }
            simulateUptime = new Date().getTime() - simulateUptime;
            if (countSimulatedTransactions > 0) {
                this.coreContext.applicationContext.logger.verbose(`mint slice - ${(countSimulatedTransactions / (simulateUptime / 1000)).toFixed(2)} TPS - simulate ${countSimulatedTransactions} transactions in ${simulateUptime / 1000}`)
            }

            if (new Date().getTime() - uptime > 5000 && addTransactions > 0) {
                mint = true;
            }

            if (addTransactions >= LIMIT_BY_NEW_SLICE) {
                mint = true;
            }

            if (now >= currentMinnedBlock.created + this.coreContext.blockTime * 1.5) {
                end = true;
                mint = false;
                this.coreContext.applicationContext.logger.verbose(`mint slice - SKIP slice end ${currentMinnedBlock.height + 1}`)
            }

            if (mint) {
                lastSliceHeight++;
                await this.mintSlice(lastSliceHeight, newTransactions, transactionsData, currentMinnedBlock, end);
                uptime = new Date().getTime();
                addTransactions = 0;
                mint = false;
                newTransactions = [];
                transactionsData = [];
            }
            await helper.sleep(100);
        } while (!end && this.isRun);
        await this.coreContext.transactionsProvider.disposeContext(ctx);

        this.isRunStream = false;
    }

    async stop() {
        this.isRun = false;
        while (this.isRunStream) {
            await helper.sleep(100);
        }
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
            if (lastBlock.block.lastHash === BlockTree.ZERO_HASH) {
                if (lastBlock.block.from === mainWallet.address) {
                    isMining = true;
                }
            } else {
                const lastLastBlock = await this.coreContext.blockProvider.getBlockInfo(lastBlock.block.lastHash);
                if (lastLastBlock.block.from === mainWallet.address) {
                    isMining = true;
                }
            }
        }
        return isMining;
    }

    private async mintSlice(height: number, transactions: string[], transactionsData: SliceData[], currentMinnedBlock: Block, end: boolean) {
        if(transactions.length === 0) throw new Error(`mint slice without transactions`);
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

        this.coreContext.applicationContext.logger.info(`mint slice - height: ${slice.blockHeight}/${slice.height} - txs: ${slice.transactions.length} - end: ${slice.end} - hash: ${slice.hash.substring(0, 10)}...`)
        const bslice = await this.coreContext.slicesProvider.saveNewSlice(slice);
        bslice.isComplete = true;
        bslice.isExecuted = false;
        await this.coreContext.slicesProvider.updateSlice(bslice);
        this.coreContext.blockTree.addSlice(slice);

        return slice;
    }
}