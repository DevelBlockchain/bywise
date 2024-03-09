import { ApplicationContext, Task, CoreContext } from '../types';
import { BlocksProvider, ChainsProvider, SlicesProvider, TransactionsProvider } from '../services';
import helper from '../utils/helper';
import PipelineChain from '../core/pipeline-chain.core';
import Network from '../core/network.core';
import { Block, Slice, Tx } from '@bywise/web3';
import { RequestKeys, RoutingKeys } from '../datasource/message-queue';

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
                const tx = new Tx(message);
                const pipelineChain = this.runChains.get(tx.chain);
                if (pipelineChain) {
                    pipelineChain.coreContext.transactionsProvider.populateTxInfo(pipelineChain.coreContext.blockTree, tx.hash);
                }
                await this.network.web3.transactions.sendTransaction(tx);
            }
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.new_slice, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                const slice = new Slice(message);
                const pipelineChain = this.runChains.get(slice.chain);
                if (pipelineChain) {
                    pipelineChain.coreContext.slicesProvider.populateSliceInfo(pipelineChain.coreContext.blockTree, slice.hash);
                }
                await this.network.web3.slices.sendSlice(slice);
            }
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.new_block, async (message: any) => {
            if (this.network.web3.network.isConnected) {
                const block = new Block(message);
                const pipelineChain = this.runChains.get(block.chain);
                if (pipelineChain) {
                    pipelineChain.coreContext.blockProvider.populateBlockInfo(pipelineChain.coreContext.blockTree, block.hash);
                }
                await this.network.web3.blocks.sendBlock(block);
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
            return await this.network.web3.network.testConnections();
        });

        this.applicationContext.mq.addRequestListener(RequestKeys.simulate_tx, async (data: { tx: Tx, simulateWallet: boolean }) => {
            const tx = new Tx(data.tx);
            const pipelineChain = this.runChains.get(tx.chain);
            if (pipelineChain) {
                return await pipelineChain.executeTransactionsTask.executeSimulation(tx, data.simulateWallet);
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