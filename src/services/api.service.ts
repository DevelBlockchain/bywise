import { AuthProvider, BlocksProvider, SlicesProvider, TransactionsProvider } from "../services";
import { ApplicationContext } from "../types";
import { WSNode, WSResponse } from "../types/network.type";

export class ApiService {
    applicationContext;
    chains: string[];
    blockProvider;
    slicesProvider;
    transactionsProvider;
    authProvider;
    clients: WSNode[] = [];
    blockList: Map<string, number> = new Map();

    constructor(applicationContext: ApplicationContext, transactionsProvider: TransactionsProvider, slicesProvider: SlicesProvider, blockProvider: BlocksProvider) {
        this.applicationContext = applicationContext;
        this.chains = applicationContext.chains;
        this.transactionsProvider = transactionsProvider;
        this.slicesProvider = slicesProvider;
        this.blockProvider = blockProvider;
        this.authProvider = new AuthProvider(applicationContext);
    }

    sendToNode(node: WSNode, res: WSResponse) {
        node.socket.send(JSON.stringify(res));
        if(res.status !== 200) {
            node.strikes++;
            if(node.strikes > 100) {
                this.blockList.set(node.ip, Date.now());
                //node.socket.close(400);

                this.clients = this.clients.filter(socket => socket !== node);
                this.applicationContext.logger.warn(`network - block node: ${node.ip}`);
            }
        }
    }
}