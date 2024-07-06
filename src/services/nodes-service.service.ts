import { BywiseNode, InfoNode } from '@bywise/web3/lib/types';
import { ApplicationContext } from '../types/task.type';
import helper from '../utils/helper';
import { AuthProvider } from './auth.service';
const pjson = require('./../../package.json');

const EXPIRE = 240; // SECONDS

export class NodesProvider {

  private authProvider;
  private mainWallet;
  private applicationContext;

  constructor(applicationContext: ApplicationContext) {
    this.applicationContext = applicationContext;
    this.mainWallet = applicationContext.mainWallet;
    this.authProvider = new AuthProvider(applicationContext);
  }

  createMyNode = async (): Promise<BywiseNode> => {
    let token = await this.authProvider.createNodeToken(EXPIRE);
    let account = await this.mainWallet;
    let myNode = new BywiseNode({
      chains: this.applicationContext.chains,
      address: account.address,
      host: this.applicationContext.myHost,
      version: pjson.version,
      expire: helper.getNow() + EXPIRE / 2,
      token: token,
    });
    return myNode;
  }

  getInfoNode = async (connectedNodes: BywiseNode[]): Promise<InfoNode> => {
    const myInfo: InfoNode = {
      address: this.mainWallet.address,
      host: this.applicationContext.myHost,
      version: pjson.version,
      timestamp: helper.getNow(),
      chains: this.applicationContext.chains,
      explorers: [],
      nodes: connectedNodes,
    }
    return myInfo;
  }
}
