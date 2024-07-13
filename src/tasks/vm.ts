import { ApplicationContext, Task, TransactionsToExecute } from '../types';
import { VirtualMachineProvider } from '../services';
import helper from '../utils/helper';
import { RoutingKeys } from '../datasource/message-queue';

class VM implements Task {

    public isRun = false;
    private applicationContext;
    private mq;
    private logger;
    private virtualMachineProvider;
    private transactionsToExecute: TransactionsToExecute[] = [];

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        this.mq = applicationContext.mq;
        this.logger = applicationContext.logger;
        this.virtualMachineProvider = new VirtualMachineProvider(applicationContext, this);
    }

    async run() {
        while (this.isRun) {
            const tte = this.transactionsToExecute.pop();

            if (tte) {
                let uptime = Date.now();
                await this.virtualMachineProvider.executeTransactions(tte);
                uptime = Date.now() - uptime;
                this.logger.debug(`VM ${this.mq.getThreadId()} - executed ${tte.txs.length} in ${uptime} ms - TPS ${(tte.txs.length/(uptime/1000)).toFixed(2)}`);
                await this.mq.send(RoutingKeys.set_transactions_to_execute, tte);
            } else {
                await helper.sleep(50);
            }
        }
        return true;
    }

    async start() {
        if (this.isRun) {
            this.applicationContext.logger.error("VM already started!");
            return;
        }
        if(this.applicationContext.vmIndex === undefined) {
            this.applicationContext.logger.error("VM index not found");
            return;
        }
        this.isRun = true;
        this.transactionsToExecute = [];
        this.applicationContext.mq.addMessageListener(RoutingKeys.add_transactions_to_execute, async (data: TransactionsToExecute) => {
            if(data.vmIndex === this.applicationContext.vmIndex) {
                this.transactionsToExecute.push(data);
            }
        });
        this.run();
    }

    async stop() {
        this.isRun = false;
    }
}

export default VM;