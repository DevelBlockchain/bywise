import { CoreProvider } from "../services";
import { BlockchainStatus } from "../types";
import helper from "../utils/helper";
import { Task } from "../types";

export default class InvalideteOldTransactions implements Task {
    public isRun = true;
    private coreProvider;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async start() {
    }

    async stop() {
    }

    async run() {
        const now = helper.getNow();
        const oldTxs = await this.coreProvider.applicationContext.database.TransactionRepository.findByChainAndStatus(this.coreProvider.chain, BlockchainStatus.TX_MEMPOOL);
        const transactions = []
        for (let i = 0; i < oldTxs.length; i++) {
            const txInfo = oldTxs[i];
            if (txInfo.received < now - 240) {
                txInfo.status = BlockchainStatus.TX_FAILED;
                txInfo.output = {
                    error: 'TIMEOUT',
                    feeUsed: '0',
                    cost: 0,
                    size: 0,
                    ctx: '',
                    debit: '0',
                    logs: [],
                    events: [],
                    get: [],
                    walletAddress: [],
                    walletAmount: [],
                    envs: {
                        keys: [],
                        values: [],
                    },
                    output: undefined,
                };
                transactions.push(txInfo);
            }
        }
        await this.coreProvider.transactionsProvider.updateTransactions(transactions);
        return transactions.length > 0;
    }
}