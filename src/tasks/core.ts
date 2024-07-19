import { ApplicationContext, EnvironmentContext, Task } from '../types';
import { BlocksProvider, SlicesProvider, TransactionsProvider } from '../services';
import helper from '../utils/helper';
import PipelineChain from '../core/pipeline-chain.core';
import Network from '../core/network.core';
import { Block, Slice, Tx } from '@bywise/web3';
import { RequestKeys, RoutingKeys } from '../datasource/message-queue';
import { Slices } from '../models';
import { CoreProvider } from '../services/core.service';

class Core implements Task {

    public isRun = false;
    private runChains = new Map<string, PipelineChain>();
    private runChainsList: PipelineChain[] = [];
    public applicationContext;
    public network;
    public blockProvider;
    public transactionsProvider;
    public slicesProvider;

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        this.network = new Network(applicationContext);
        this.transactionsProvider = new TransactionsProvider(applicationContext, this);
        this.slicesProvider = new SlicesProvider(applicationContext, this.transactionsProvider);
        this.blockProvider = new BlocksProvider(applicationContext, this.slicesProvider, this.transactionsProvider);
    }

    async run() {
        for (let i = 0; i < this.applicationContext.chains.length; i++) {
            const chain = this.applicationContext.chains[i];
            let runChain = this.runChains.get(chain);
            if (runChain === undefined) {
                const lastBlock = (await this.blockProvider.getLastMinedBlock(chain)).block;
                const coreProvider = new CoreProvider(this.applicationContext, this.network, lastBlock, chain, this.blockProvider, this.slicesProvider, this.transactionsProvider);
                runChain = new PipelineChain(coreProvider);

                await runChain.start();

                this.runChains.set(chain, runChain);
                this.runChainsList.push(runChain);
            } else {
                if (!runChain.isRun) {
                    await runChain.start();
                }
            }
        }
        return true;
    }

    private async keepRun() {
        while (this.isRun) {
            await this.run();
            for (let i = 0; i < 1000 && this.isRun; i++) { // 60 seconds
                await helper.sleep(60);
            }
        }
    }

    async start() {
        if (this.isRun) {
            this.applicationContext.logger.error("CORE already started!");
            return;
        }
        this.isRun = true;
        this.applicationContext.mq.addMessageListener(RoutingKeys.new_tx, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                await this.network.web3.transactions.sendTransaction(message);
            }
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.new_slice, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                await this.network.web3.slices.sendSlice(message);
            }
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.new_block, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                await this.network.web3.blocks.sendBlock(message);
            }
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.find_tx, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                const findedTx = await this.network.web3.transactions.getTransactionByHash(message) as any;
                if (findedTx) {
                    try {
                        this.applicationContext.database.TransactionRepository.addMempool(findedTx);
                    } catch (err: any) {
                        this.applicationContext.logger.error(`core.find_tx: ${err.message}`, err);
                    }
                }
            }
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.find_slice, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                const findedSlice = await this.network.web3.slices.getSliceByHash(message);
                if (findedSlice) {
                    try {
                        await this.slicesProvider.saveNewSlice(new Slice(findedSlice));
                    } catch (err: any) {
                        this.applicationContext.logger.error(`core.find_slice: ${err.message}`, err);
                    }
                }
            }
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.find_block, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                const findedBlock = await this.network.web3.blocks.getBlockByHash(message);
                if (findedBlock) {
                    try {
                        await this.blockProvider.saveNewBlock(new Block(findedBlock));
                    } catch (err: any) {
                        this.applicationContext.logger.error(`core.find_block: ${err.message}`, err);
                    }
                }
            }
        });

        this.applicationContext.mq.addRequestListener(RequestKeys.simulate_tx, async (data: { tx: Tx, fromSlice: string, env?: EnvironmentContext, simulateMode?: boolean }) => {
            const tx = new Tx(data.tx);
            const pipelineChain = this.runChains.get(tx.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactions.executeSimulation(tx, data.env, data.simulateMode);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });

        this.applicationContext.mq.addRequestListener(RequestKeys.get_info_wallet, async (data: { chain: string, address: string }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactions.getWalletInfo(data.address);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_contract, async (data: { chain: string, address: string }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactions.getContract(data.address);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_events, async (data: { chain: string, contractAddress: string, eventName: string, page: number }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactions.getEvents(data.contractAddress, data.eventName, data.page);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_events_by_key, async (data: { chain: string, contractAddress: string, eventName: string, key: string, value: string, page: number }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactions.getEventsByKey(data.contractAddress, data.eventName, data.key, data.value, data.page);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_confirmed_slices, async (data: { chain: string }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                const slices = await pipelineChain.coreProvider.blockProvider.getLastSlicesBlock(data.chain);
                return slices;
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_last_slice, async (data: { chain: string }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                const slice = await pipelineChain.coreProvider.currentSlice;
                return slice;
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });

        this.keepRun();
    }

    async stop() {
        this.isRun = false;
        for (let i = 0; i < this.runChainsList.length; i++) {
            await this.runChainsList[i].stop();
        }
        this.runChains = new Map();
        this.runChainsList = [];
    }
}

export default Core;