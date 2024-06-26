import { BywiseNode, InfoNode } from '@bywise/web3/lib/types';
import { ApplicationContext } from '../types/task.type';
import helper from '../utils/helper';
import AuthProvider from './auth.service';
import { WalletProvider } from './wallet.service';
const pjson = require('./../../package.json');

const EXPIRE = 240; // SECONDS

export class NodesProvider {

  private authProvider;
  private walletProvider;
  private applicationContext;

  constructor(applicationContext: ApplicationContext) {
    this.applicationContext = applicationContext;
    this.authProvider = new AuthProvider(applicationContext);
    this.walletProvider = new WalletProvider(applicationContext);
  }

  createMyNode = async (): Promise<BywiseNode> => {
    let token = await this.authProvider.createNodeToken(EXPIRE);
    let account = await this.walletProvider.getMainWallet();
    let myNode = new BywiseNode({
      chains: this.applicationContext.zeroBlocks.map(block => block.chain),
      address: account.address,
      host: this.applicationContext.myHost,
      version: pjson.version,
      expire: helper.getNow() + EXPIRE / 2,
      token: token,
    });
    return myNode;
  }

  getInfoNode = async (connectedNodes: BywiseNode[]): Promise<InfoNode> => {
    let account = await this.walletProvider.getMainWallet();
    const myInfo: InfoNode = {
      address: account.address,
      host: this.applicationContext.myHost,
      version: pjson.version,
      timestamp: helper.getNow(),
      chains: this.applicationContext.zeroBlocks.map(block => block.chain),
      explorers: [],
      nodes: connectedNodes,
    }
    return myInfo;
  }
}
