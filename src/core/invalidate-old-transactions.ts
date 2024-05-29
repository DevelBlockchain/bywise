import { BlockchainStatus, CoreContext, TransactionOutputDTO } from "../types";
import helper from "../utils/helper";

export default class InvalideteOldTransactions {
    public isRun = true;
    private coreContext;
    private lastUpdate = 0;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
    }

    async run() {
        const now = helper.getNow();
        if (now < this.lastUpdate + 10) {
            return;
        }
        this.lastUpdate = now;

        const oldTxs = await this.coreContext.applicationContext.database.TransactionRepository.findByChainAndStatus(this.coreContext.chain, BlockchainStatus.TX_MEMPOOL);
        for (let i = 0; i < oldTxs.length; i++) {
            const tx = oldTxs[i];
            if (tx.tx.created < now - 240) {
                tx.status = BlockchainStatus.TX_FAILED;
                tx.output = new TransactionOutputDTO();
                tx.output.error = 'TIMEOUT';
                this.coreContext.applicationContext.logger.verbose(`blocks service - transactions invalidated by time ${tx.tx.created} < ${now - 120}`)
                await this.coreContext.transactionsProvider.updateTransaction(tx);
            }
        }
    }
}