import { BlocksProvider, SlicesProvider, TransactionsProvider } from "../services";
import { ApplicationContext, Task } from "../types";

export class ApiService {
    applicationContext;
    chains: string[];
    blockProvider;
    slicesProvider;
    transactionsProvider;

    constructor(applicationContext: ApplicationContext, transactionsProvider: TransactionsProvider, slicesProvider: SlicesProvider, blockProvider: BlocksProvider) {
        this.applicationContext = applicationContext;
        this.chains = applicationContext.chains;
        this.transactionsProvider = transactionsProvider;
        this.slicesProvider = slicesProvider;
        this.blockProvider = blockProvider;
    }
}