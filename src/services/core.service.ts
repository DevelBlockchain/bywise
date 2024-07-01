import Network from "../core/network.core";
import { BlocksProvider, EnvironmentProvider, SlicesProvider, TransactionsProvider } from ".";
import { ConfigProvider } from "./configs.service";
import { EventsProvider } from "./events.service";
import { MinnerProvider } from "./minner.service";
import { WalletProvider } from "./wallet.service";
import { BlockTree } from "../types/environment.types";
import { ApplicationContext } from "../types/task.type";

export class CoreProvider {
    applicationContext;
    network;
    blockTree;
    chain;
    blockProvider;
    slicesProvider;
    transactionsProvider;
    minnerProvider;
    environmentProvider;
    configsProvider;
    walletProvider;
    eventsProvider;

    blockTime = 60;
    isValidator = false;
    hasMinimumBWSToMine = false;

    constructor(applicationContext: ApplicationContext, network: Network, blockTree: BlockTree) {
        this.applicationContext = applicationContext;
        this.network = network;
        this.blockTree = blockTree;
        this.chain = blockTree.chain;
        this.blockProvider = new BlocksProvider(applicationContext);
        this.slicesProvider = new SlicesProvider(applicationContext);
        this.transactionsProvider = new TransactionsProvider(applicationContext);
        this.environmentProvider = new EnvironmentProvider(applicationContext);
        this.minnerProvider = new MinnerProvider();
        this.configsProvider = new ConfigProvider(applicationContext);
        this.walletProvider = new WalletProvider(applicationContext);
        this.eventsProvider = new EventsProvider(applicationContext);
    }
}