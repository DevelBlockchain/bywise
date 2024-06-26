import { Web3, BywiseNode } from '@bywise/web3';
import { ApplicationContext, Task } from '../types/task.type';
import { NodesProvider } from '../services';
import helper from '../utils/helper';
import { RequestKeys, RoutingKeys } from '../datasource/message-queue';

export default class Network implements Task {

    public isRun: boolean = false;
    private nodeProvider: NodesProvider;
    private applicationContext: ApplicationContext;
    public web3: Web3;

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        this.nodeProvider = new NodesProvider(applicationContext);

        this.web3 = new Web3({
            initialNodes: this.applicationContext.initialNodes,
            maxConnectedNodes: this.applicationContext.nodeLimit,
            myHost: this.applicationContext.myHost,
            debug: false,
            createConnection: () => this.nodeProvider.createMyNode(),
            getChains: async () => this.applicationContext.zeroBlocks.map(block => block.chain)
        });
    }

    public mainLoop = async () => {
        while (this.isRun) {
            for (let i = 0; i < 1000 && this.isRun; i++) { // 60 seconds
                await helper.sleep(60);
            }
            if (this.isRun) {
                await this.web3.network.connect();
            }
        }
    }

    connectedNodesSize = () => {
        return this.web3.network.connectedNodes.length;
    }

    isConnected = () => {
        return this.web3.network.isConnected;
    }

    async start(initialNodes?: string[]) {
        if (this.isRun) {
            this.applicationContext.logger.error("NETWORK already started!");
            return;
        }
        this.isRun = true;
        this.applicationContext.mq.addMessageListener(RoutingKeys.new_node, async (message: any) => {
            const node = new BywiseNode(message);
            this.applicationContext.logger.verbose(`web3 - added new node`)
            this.web3.network.addNode(node);
        });
        this.applicationContext.mq.addRequestListener(RequestKeys.get_connected_nodes, async (data: { chain: string, address: string }) => {
            return this.web3.network.connectedNodes.map(n => ({
                ...n,
                token: undefined,
                expire: undefined,
            }));
        });
        await this.web3.network.connect(initialNodes);
        this.applicationContext.logger.verbose(`web3 - connections: ${this.web3.network.connectedNodes.length} -  initialNodes: ${this.applicationContext.initialNodes.join(", ")}`)
        this.applicationContext.logger.info(`web3 - host: ${this.applicationContext.myHost}`)
        this.mainLoop();
    };

    async stop() {
        this.web3.network.disconnect();
        this.isRun = false;
    };
}