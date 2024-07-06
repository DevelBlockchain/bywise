import { ApplicationContext, Task, TransactionsToExecute } from '../types';
import { VirtualMachineProvider } from '../services';
import helper from '../utils/helper';
import { RequestKeys, RoutingKeys } from '../datasource/message-queue';

class VM implements Task {

    public isRun = false;
    private firstVM = false;
    private applicationContext;
    private mq;
    private virtualMachineProvider;
    private transactionsToExecute: TransactionsToExecute[] = [];

    constructor(applicationContext: ApplicationContext, firstVM: boolean) {
        this.applicationContext = applicationContext;
        this.firstVM = firstVM;
        this.mq = applicationContext.mq;
        this.virtualMachineProvider = new VirtualMachineProvider(applicationContext, this);
    }

    async running() {
        while (this.isRun) {
            const tte: TransactionsToExecute | null = await this.mq.request(RequestKeys.get_transactions_to_execute);

            if (tte) {
                await this.virtualMachineProvider.executeTransactions(tte);
                await this.mq.send(RoutingKeys.set_transactions_to_execute, tte);
            }

            await helper.sleep(50);
        }
    }

    async start() {
        if (this.isRun) {
            this.applicationContext.logger.error("VM already started!");
            return;
        }
        this.isRun = true;
        if (this.firstVM) {
            this.transactionsToExecute = [];
            this.applicationContext.mq.addRequestListener(RequestKeys.get_transactions_to_execute, async () => {
                return this.transactionsToExecute.pop();
            });
            this.applicationContext.mq.addMessageListener(RoutingKeys.add_transactions_to_execute, async (data: TransactionsToExecute) => {
                this.transactionsToExecute.push(data);
            });
        }
        this.running();
    }

    async stop() {
        this.isRun = false;
    }
}

export default VM;