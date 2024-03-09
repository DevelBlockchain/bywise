import { ETHProvider } from "../services/eth.service";
import { BlockchainStatus, CoreContext } from "../types";

export default class ETHProxySync {
    public isRun = true;
    private coreContext;
    private ETHRepository;
    private ethProvider;

    constructor(coreContext: CoreContext) {
        this.coreContext = coreContext;
        this.ETHRepository = coreContext.applicationContext.database.ETHRepository;
        this.ethProvider = new ETHProvider(coreContext.applicationContext);
    }

    async run() {

        const actions = await this.ETHRepository.findByDone(false, 10000);
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];

            const tx = await this.coreContext.applicationContext.database.TransactionRepository.findByHash(action.proposalId);
            if (tx) {
                if (tx.status === BlockchainStatus.TX_MINED || tx.status === BlockchainStatus.TX_CONFIRMED) {
                    try {
                        this.coreContext.applicationContext.logger.debug(`ETHProxySync: try execute action ${action.proposalId}`);
                        await this.ethProvider.voteAction(action);
                        this.coreContext.applicationContext.logger.debug(`ETHProxySync: voted action ${action.proposalId} - voteHash: ${action.voteHash}`);
                        action.done = true;
                    } catch (err: any) {
                        console.log(`ETHProxySync: failed action ${action.proposalId} - Error: ${err.message}`)
                        this.coreContext.applicationContext.logger.error(`ETHProxySync: failed action ${action.proposalId} - Error: ${err.message}`)
                        action.error.push(err.message);
                        if (action.error.length > 5) {
                            action.done = true;
                        }
                    }
                    await this.ETHRepository.save(action);
                }
                if (tx.status === BlockchainStatus.TX_FAILED) {
                    this.coreContext.applicationContext.logger.info(`ETHProxySync: failed action ${action.proposalId} - Error: Bywise transaction failed`)
                    action.error.push('Bywise transaction failed');
                    action.done = true;
                    await this.ETHRepository.save(action);
                }
            }
        }

    }
}