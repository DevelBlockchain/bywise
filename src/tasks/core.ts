import { ApplicationContext, Task, CoreContext } from '../types';
import { BlocksProvider, ChainsProvider, SlicesProvider, TransactionsProvider } from '../services';
import helper from '../utils/helper';
import PipelineChain from '../core/pipeline-chain.core';
import Network from '../core/network.core';
import { Block, Slice, Tx } from '@bywise/web3';
import { RequestKeys, RoutingKeys } from '../datasource/message-queue';
import { BlockTree } from '../types/environment.types';
import { Slices } from '../models';

class Core implements Task {

    public isRun = false;
    private runChains = new Map<string, PipelineChain>();
    private runChainsList: PipelineChain[] = [];
    public applicationContext;
    public network;
    public blockProvider;
    public transactionsProvider;
    public slicesProvider;
    private chainsProvider;

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        this.chainsProvider = new ChainsProvider(applicationContext);
        this.network = new Network(applicationContext, this.chainsProvider);
        this.blockProvider = new BlocksProvider(applicationContext);
        this.transactionsProvider = new TransactionsProvider(applicationContext);
        this.slicesProvider = new SlicesProvider(applicationContext);
    }

    async runCore() {
        const chains = await this.chainsProvider.getChains(true);

        for (let i = 0; i < chains.length; i++) {
            const chain = chains[i];
            let runChain = this.runChains.get(chain);
            if (runChain === undefined) {

                const blockTree = await this.blockProvider.getBlockTree(chain);

                const coreContext = new CoreContext(this.applicationContext, this.network, blockTree);
                runChain = new PipelineChain(coreContext);

                await runChain.start();

                this.runChains.set(chain, runChain);
                this.runChainsList.push(runChain);
            } else {
                if (!runChain.isRun) {
                    await runChain.start();
                }
            }
        }
    }

    private async keepRun() {
        this.isRun = true;
        while (this.isRun) {
            await this.runCore();
            for (let i = 0; i < 1000 && this.isRun; i++) {
                await helper.sleep(60);
            }
        }
    }

    async start() {
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
                const findedTx = await this.network.web3.transactions.getTransactionByHash(message);
                if (findedTx) {
                    try {
                        await this.transactionsProvider.saveNewTransaction(new Tx(findedTx));
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
        this.applicationContext.mq.addRequestListener(RequestKeys.test_connection, async (message: any) => {
            let isConnected = await this.network.web3.network.testConnections();
            if (!isConnected) {
                await this.network.web3.network.tryConnection();
            }
            return isConnected;
        });

        this.applicationContext.mq.addRequestListener(RequestKeys.simulate_tx, async (data: { tx: Tx }) => {
            const tx = new Tx(data.tx);
            const pipelineChain = this.runChains.get(tx.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactionsTask.executeSimulation(tx);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });

        this.applicationContext.mq.addRequestListener(RequestKeys.get_info_wallet, async (data: { chain: string, address: string }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactionsTask.getWalletInfo(data.address);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_contract, async (data: { chain: string, address: string }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactionsTask.getContract(data.address);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_events, async (data: { chain: string, contractAddress: string, eventName: string, page: number }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactionsTask.getEvents(data.contractAddress, data.eventName, data.page);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_events_by_key, async (data: { chain: string, contractAddress: string, eventName: string, key: string, value: string, page: number }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactionsTask.getEventsByKey(data.contractAddress, data.eventName, data.key, data.value, data.page);
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_confirmed_slices, async (data: { chain: string }) => {
            const pipelineChain = this.runChains.get(data.chain);
            if (pipelineChain) {
                const currentBlock = pipelineChain.coreContext.blockTree.currentMinnedBlock;
                let from = currentBlock.from;
                if (currentBlock.lastHash !== BlockTree.ZERO_HASH) {
                    const lastLastBlock = await pipelineChain.coreContext.blockProvider.getBlockInfo(currentBlock.lastHash);
                    from = lastLastBlock.block.from;
                }
                const bestSlices = await pipelineChain.coreContext.blockTree.getBestSlice(from, currentBlock.height + 1);
                const slices: Slices[] = [];
                let end = false;
                for (let i = 0; i < bestSlices.length; i++) {
                    const slice = bestSlices[i];
                    const sliceInfo = await pipelineChain.coreContext.slicesProvider.getSliceInfo(slice.hash);
                    if (!sliceInfo.isExecuted) {
                        break;
                    }
                    if (sliceInfo.slice.end) {
                        end = true;
                        slices.push(sliceInfo);
                        break;
                    }
                    slices.push(sliceInfo);
                }
                return slices.reverse();
            } else {
                throw new Error(`Node does not work with this chain`);
            }
        });
        await this.network.start();
        this.keepRun();
    }

    async stop() {
        this.isRun = false;
        await this.network.stop();
        for (let i = 0; i < this.runChainsList.length; i++) {
            await this.runChainsList[i].stop();
        }
        this.runChains = new Map();
        this.runChainsList = [];
    }
}

export default Core;