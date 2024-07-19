import Network from "../core/network.core";
import { BlocksProvider, EnvironmentProvider, SlicesProvider, TransactionsProvider } from ".";
import { EventsProvider } from "./events.service";
import { MinnerProvider } from "./minner.service";
import { ApplicationContext } from "../types/task.type";
import { Block, Slice } from "@bywise/web3";

export class CoreProvider {
    applicationContext;
    network;
    chain;
    currentBlock: Block;
    currentSlice: Slice = new Slice();
    blockProvider;
    slicesProvider;
    transactionsProvider;
    minnerProvider;
    environmentProvider;
    eventsProvider;

    blockTime = 60;
    isValidator = false;
    hasMinimumBWSToMine = false;

    constructor(applicationContext: ApplicationContext, network: Network, currentBlock: Block, chain: string, blockProvider: BlocksProvider, slicesProvider: SlicesProvider, transactionsProvider: TransactionsProvider) {
        this.applicationContext = applicationContext;
        this.network = network;
        this.chain = chain;
        this.currentBlock = currentBlock;
        this.blockProvider = blockProvider;
        this.transactionsProvider = transactionsProvider;
        this.slicesProvider = slicesProvider;
        this.environmentProvider = new EnvironmentProvider(applicationContext);
        this.minnerProvider = new MinnerProvider();
        this.eventsProvider = new EventsProvider(applicationContext);
    }
}