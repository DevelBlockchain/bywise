import { BywiseNode } from "@bywise/web3";
import { BlocksProvider, ChainsProvider, SlicesProvider, TransactionsProvider } from "../services";
import { WalletProvider } from "../services/wallet.service";
import { BlockTree } from "./environment.types";
import { ApplicationContext } from "./task.type";

export class ApiContext {
    applicationContext;
    knowNodes: BywiseNode[] = [];
    chains: string[];
    blockTree: Map<string, BlockTree>;
    chainsProvider;
    walletProvider;
    blockProvider;
    slicesProvider;
    transactionsProvider;

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        this.chains = [];
        this.blockTree = new Map();
        this.chainsProvider = new ChainsProvider(applicationContext);
        this.walletProvider = new WalletProvider(applicationContext);
        this.blockProvider = new BlocksProvider(applicationContext);
        this.slicesProvider = new SlicesProvider(applicationContext);
        this.transactionsProvider = new TransactionsProvider(applicationContext);
    }
}