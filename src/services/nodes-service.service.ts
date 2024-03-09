import { BywiseNode, InfoNode } from '@bywise/web3/lib/types';
import { ApplicationContext } from '../types/task.type';
import helper from '../utils/helper';
import AuthProvider from './auth.service';
import { ChainsProvider } from './chains.service';
import { WalletProvider } from './wallet.service';
const pjson = require('./../../package.json');

export class NodesProvider {

  private authProvider;
  private walletProvider;
  private applicationContext;
  private chainsProvider;

  constructor(applicationContext: ApplicationContext, chainsProvider: ChainsProvider) {
    this.applicationContext = applicationContext;
    this.chainsProvider = chainsProvider;
    this.authProvider = new AuthProvider(applicationContext);
    this.walletProvider = new WalletProvider(applicationContext);
  }

  createMyNode = async (): Promise<BywiseNode> => {
    let token = await this.authProvider.createNodeToken();
    let account = await this.walletProvider.getMainWallet();
    let myNode = new BywiseNode({
      chains: await this.chainsProvider.getChains(),
      address: account.address,
      host: this.applicationContext.myHost,
      version: pjson.version,
      expire: helper.getNow() + 10 * 60,
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
      chains: await this.chainsProvider.getChains(),
      explorers: [],
      nodes: connectedNodes,
    }
    return myInfo;
  }
}
