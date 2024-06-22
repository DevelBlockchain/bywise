import { Web3, BywiseNode } from '@bywise/web3';
import { ApplicationContext, Task } from '../types/task.type';
import { ChainsProvider, NodesProvider } from '../services';
import helper from '../utils/helper';
import { RoutingKeys } from '../datasource/message-queue';

export default class Network implements Task {

    public isRun: boolean = false;
    private nodeProvider: NodesProvider;
    private chainsProvider: ChainsProvider;
    private applicationContext: ApplicationContext;
    public web3: Web3;

    constructor(applicationContext: ApplicationContext, chainsProvider: ChainsProvider) {
        this.applicationContext = applicationContext;
        this.chainsProvider = chainsProvider;
        this.nodeProvider = new NodesProvider(applicationContext, chainsProvider);

        this.web3 = new Web3({
            initialNodes: this.applicationContext.initialNodes,
            maxConnectedNodes: this.applicationContext.nodeLimit,
            myHost: this.applicationContext.myHost,
            debug: false,
            createConnection: () => this.nodeProvider.createMyNode(),
            getChains: this.chainsProvider.getChains
        });
    }

    public mainLoop = async () => {
        while (this.isRun) {
            await this.web3.network.updateConnections();
            const knowNodes = this.web3.network.connectedNodes.map(n => ({
                ...n,
                token: undefined,
                expire: undefined,
            }));
            this.applicationContext.logger.debug(`web3 - connections: ${knowNodes.length}`)
            await this.applicationContext.mq.send(RoutingKeys.know_nodes, knowNodes);
            for (let i = 0; i < 100 && this.isRun; i++) { // 10 seconds
                await helper.sleep(100);
            }
        }
    }

    resetNetwork = async () => {
        this.isRun = false;
        await helper.sleep(100);
        this.web3 = new Web3({
            initialNodes: this.applicationContext.initialNodes,
            maxConnectedNodes: this.applicationContext.nodeLimit,
            myHost: this.applicationContext.myHost,
            debug: false,
            createConnection: () => this.nodeProvider.createMyNode(),
            getChains: this.chainsProvider.getChains
        });
        await this.applicationContext.mq.send(RoutingKeys.know_nodes, []);
        await helper.sleep(100);
    }

    connectedNodesSize = () => {
        return this.web3.network.connectedNodes.length;
    }

    async start() {
        if (!this.isRun) {
            this.isRun = true;
            this.applicationContext.mq.addMessageListener(RoutingKeys.started_api, async (message: any) => {
                await this.web3.network.tryConnection();
            });
            this.applicationContext.mq.addMessageListener(RoutingKeys.new_node, async (message: any) => {
                const node = new BywiseNode(message);
                this.applicationContext.logger.verbose(`added new node`)
                this.web3.network.addNode(node);
            });
            await this.web3.network.tryConnection();
            this.applicationContext.logger.verbose(`start web3 - connections: ${this.web3.network.connectedNodes.length} -  initialNodes: ${this.applicationContext.initialNodes.join(", ")}`)
            this.applicationContext.logger.info(`start web3 - host: ${this.applicationContext.myHost}`)
            this.mainLoop();
        }
    };

    async stop() {
        this.isRun = false;
    };
}