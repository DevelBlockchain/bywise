import { CoreProvider } from "../services";
import { BlockchainStatus } from "../types";
import helper from "../utils/helper";

export default class InvalideteOldTransactions {
    public isRun = true;
    private coreProvider;
    private lastUpdate = 0;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        const now = helper.getNow();
        if (now < this.lastUpdate + 10) {
            return;
        }
        this.lastUpdate = now;

        const oldTxs = await this.coreProvider.applicationContext.database.TransactionRepository.findByChainAndStatus(this.coreProvider.chain, BlockchainStatus.TX_MEMPOOL);
        for (let i = 0; i < oldTxs.length; i++) {
            const tx = oldTxs[i];
            if (tx.tx.created < now - 240) {
                tx.status = BlockchainStatus.TX_FAILED;
                tx.output = {
                    error: 'TIMEOUT',
                    feeUsed: '0',
                    fee: '0',
                    cost: 0,
                    size: 0,
                    fromSlice: '',
                    debit: '0',
                    logs: [],
                    events: [],
                    changes: {
                        get: [],
                        walletAddress: [],
                        walletAmount: [],
                        envOut: {
                            keys: [],
                            values: [],
                        },
                    },
                };
                await this.coreProvider.transactionsProvider.updateTransaction(tx);
            }
        }
    }
}