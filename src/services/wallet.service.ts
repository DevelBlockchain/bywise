import BigNumber from "bignumber.js";
import { ApplicationContext } from "../types/task.type";
import { Wallet } from '@bywise/web3';
import { BalanceDTO, WalletDTO } from "../types";
import { EnvironmentProvider } from "./environment.service";
import { BlockTree } from "../types/environment.types";

export class WalletProvider {

  private applicationContext: ApplicationContext;
  private environmentProvider: EnvironmentProvider;

  constructor(applicationContext: ApplicationContext) {
    this.applicationContext = applicationContext;
    this.environmentProvider = new EnvironmentProvider(applicationContext);
  }

  async getMainWallet(): Promise<Wallet> {
    return this.applicationContext.mainWallet;
  }

  async getWalletBalance(blockTree: BlockTree, blockHash: string, address: string): Promise<BalanceDTO> {
    let balance = await this.environmentProvider.get(blockTree, blockHash, `wallet:${address}:balance`);
    if (balance) {
      return new BalanceDTO(address, new BigNumber(balance));
    }
    return new BalanceDTO(address, new BigNumber(0));
  }
  
  async getWalletInfo(blockTree: BlockTree, blockHash: string, address: string): Promise<WalletDTO> {
    let info = await this.environmentProvider.get(blockTree, blockHash, `wallet:${address}:info`);
    if (info) {
      return new WalletDTO(JSON.parse(info));
    }
    return new WalletDTO();
  }

  async setWalletBalance(blockTree: BlockTree, blockHash: string, balanceDTO: BalanceDTO): Promise<void> {
    await this.environmentProvider.set(blockTree, blockHash, `wallet:${balanceDTO.address}:balance`, balanceDTO.balance.toString());
  }
  
  async setWalletInfo(blockTree: BlockTree, blockHash: string, address: string, info: WalletDTO): Promise<void> {
    await this.environmentProvider.set(blockTree, blockHash, `wallet:${address}:info`, JSON.stringify(info));
  }
}
