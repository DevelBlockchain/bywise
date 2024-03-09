import { Web3, BywiseNode } from '@bywise/web3';
import { ApplicationContext, Task } from '../types/task.type';
import { ChainsProvider, NodesProvider } from '../services';
import helper from '../utils/helper';
import { RoutingKeys } from '../datasource/message-queue';

export default class Network implements Task {

    public isRun: boolean = false;
    private mainLoopInterval: any;
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
        const nodesSize = this.web3.network.connectedNodes.length;
        const connectedNodes = await this.web3.network.tryConnection();
        const knowNodes = this.web3.network.connectedNodes.map(n => ({
            ...n,
            token: undefined,
            expire: undefined,
        }));
        await this.applicationContext.mq.send(RoutingKeys.know_nodes, knowNodes);
        if (nodesSize !== connectedNodes) {
            this.applicationContext.logger.info(`connected ${connectedNodes} nodes`);
        }
        await helper.sleep(100);
    }

    resetNetwork = async () => {
        clearInterval(this.mainLoopInterval);
        this.web3 = new Web3({
            initialNodes: this.applicationContext.initialNodes,
            maxConnectedNodes: this.applicationContext.nodeLimit,
            myHost: this.applicationContext.myHost,
            debug: false,
            createConnection: () => this.nodeProvider.createMyNode(),
            getChains: this.chainsProvider.getChains
        });
        await this.applicationContext.mq.send(RoutingKeys.know_nodes, []);
    }

    connectedNodesSize = () => {
        return this.web3.network.connectedNodes.length;
    }

    async start() {
        this.applicationContext.logger.info(`start web3 - initialNodes: ${this.applicationContext.initialNodes.join(", ")}`)
        this.applicationContext.logger.info(`start web3 - host: ${this.applicationContext.myHost}`)
        this.applicationContext.mq.addMessageListener(RoutingKeys.started_api, async (message: any) => {
            await this.web3.network.tryConnection();
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.new_node, async (message: any) => {
            const node = new BywiseNode(message);
            this.applicationContext.logger.info(`added new node`)
            this.web3.network.addNode(node);
        });
        this.mainLoopInterval = setInterval(this.mainLoop, 60000);
        this.isRun = true;
    };

    async stop() {
        this.isRun = false;
        clearInterval(this.mainLoopInterval);
    };
}