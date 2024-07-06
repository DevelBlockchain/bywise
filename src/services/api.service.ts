import { BlocksProvider, SlicesProvider, TransactionsProvider } from "../services";
import { ApplicationContext, Task } from "../types";

export class ApiService {
    applicationContext;
    chains: string[];
    blockProvider;
    slicesProvider;
    transactionsProvider;

    constructor(applicationContext: ApplicationContext, task: Task) {
        this.applicationContext = applicationContext;
        this.chains = applicationContext.zeroBlocks.map(block => block.chain);
        this.transactionsProvider = new TransactionsProvider(applicationContext, task);
        this.slicesProvider = new SlicesProvider(applicationContext, this.transactionsProvider);
        this.blockProvider = new BlocksProvider(applicationContext, this.slicesProvider, this.transactionsProvider);
    }
}