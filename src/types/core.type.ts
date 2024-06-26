import Network from "../core/network.core";
import { BlocksProvider, EnvironmentProvider, SlicesProvider, TransactionsProvider } from "../services";
import { ConfigProvider } from "../services/configs.service";
import { EventsProvider } from "../services/events.service";
import { MinnerProvider } from "../services/minner.service";
import { WalletProvider } from "../services/wallet.service";
import { BlockTree } from "./environment.types";
import { ApplicationContext } from "./task.type";

export class CoreContext {
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

    blockTime: number = 60;

    constructor(applicationContext: ApplicationContext, network: Network, blockTree: BlockTree) {
        this.applicationContext = applicationContext;
        this.network = network;
        this.blockTree = blockTree;
        this.chain = blockTree.chain;
        this.blockProvider = new BlocksProvider(applicationContext);
        this.slicesProvider = new SlicesProvider(applicationContext);
        this.transactionsProvider = new TransactionsProvider(applicationContext);
        this.environmentProvider = new EnvironmentProvider(applicationContext);
        this.minnerProvider = new MinnerProvider(applicationContext);
        this.configsProvider = new ConfigProvider(applicationContext);
        this.walletProvider = new WalletProvider(applicationContext);
        this.eventsProvider = new EventsProvider(applicationContext);
    }
}