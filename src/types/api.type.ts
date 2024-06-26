import { BlocksProvider, SlicesProvider, TransactionsProvider } from "../services";
import { WalletProvider } from "../services/wallet.service";
import { ApplicationContext } from "./task.type";

export class ApiContext {
    applicationContext;
    chains: string[];
    walletProvider;
    blockProvider;
    slicesProvider;
    transactionsProvider;

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        this.chains = applicationContext.zeroBlocks.map(block => block.chain);
        this.walletProvider = new WalletProvider(applicationContext);
        this.blockProvider = new BlocksProvider(applicationContext);
        this.slicesProvider = new SlicesProvider(applicationContext);
        this.transactionsProvider = new TransactionsProvider(applicationContext);
    }
}