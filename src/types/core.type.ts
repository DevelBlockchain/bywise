import Network from "../core/network.core";
import { Blocks, Slices } from "../models";
import { BlocksProvider, ChainsProvider, EnvironmentProvider, SlicesProvider, TransactionsProvider } from "../services";
import { ConfigProvider } from "../services/configs.service";
import { MinnerProvider } from "../services/minner.service";
import { WalletProvider } from "../services/wallet.service";
import { BlockTree } from "./environment.types";
import { ApplicationContext } from "./task.type";

export class CoreContext {
    applicationContext;
    network;
    blockTree;
    chain;
    chainsProvider;
    blockProvider;
    slicesProvider;
    transactionsProvider;
    minnerProvider;
    environmentProvider;
    configsProvider;
    walletProvider;

    bestSlice: Slices | undefined;
    lastBlock: Blocks | undefined;
    blockTime: number = 60;

    constructor(applicationContext: ApplicationContext, network: Network, blockTree: BlockTree) {
        this.applicationContext = applicationContext;
        this.network = network;
        this.blockTree = blockTree;
        this.chain = blockTree.chain;
        this.chainsProvider = new ChainsProvider(applicationContext);
        this.blockProvider = new BlocksProvider(applicationContext);
        this.slicesProvider = new SlicesProvider(applicationContext);
        this.transactionsProvider = new TransactionsProvider(applicationContext);
        this.environmentProvider = new EnvironmentProvider(applicationContext);
        this.minnerProvider = new MinnerProvider(applicationContext);
        this.configsProvider = new ConfigProvider(applicationContext);
        this.walletProvider = new WalletProvider(applicationContext);
    }
}