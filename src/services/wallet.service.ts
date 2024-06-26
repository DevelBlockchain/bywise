import BigNumber from "bignumber.js";
import { ApplicationContext } from "../types/task.type";
import { Wallet } from '@bywise/web3';
import { BalanceDTO, WalletDTO } from "../types";
import { EnvironmentProvider } from "./environment.service";
import { BlockTree, EnvironmentContext } from "../types/environment.types";

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

  async getWalletBalanceFromMainContext(blockTree: BlockTree, address: string): Promise<BalanceDTO> {
    let balance = await this.environmentProvider.getFromMainContext(blockTree, `wallet:${address}:balance`);
    if (balance) {
      return new BalanceDTO(address, new BigNumber(balance));
    }
    return new BalanceDTO(address, new BigNumber(0));
  }
  
  async getWalletInfoFromMainContext(blockTree: BlockTree, address: string): Promise<WalletDTO> {
    let info = await this.environmentProvider.getFromMainContext(blockTree, `wallet:${address}:info`);
    if (info) {
      return new WalletDTO(JSON.parse(info));
    }
    return new WalletDTO();
  }

  async getWalletBalance(envContext: EnvironmentContext, address: string): Promise<BalanceDTO> {
    let balance = await this.environmentProvider.get(envContext, `wallet:${address}:balance`);
    if (balance) {
      return new BalanceDTO(address, new BigNumber(balance));
    }
    return new BalanceDTO(address, new BigNumber(0));
  }
  
  async getWalletInfo(envContext: EnvironmentContext, address: string): Promise<WalletDTO> {
    let info = await this.environmentProvider.get(envContext, `wallet:${address}:info`);
    if (info) {
      return new WalletDTO(JSON.parse(info));
    }
    return new WalletDTO();
  }

  setWalletBalance(envContext: EnvironmentContext, balanceDTO: BalanceDTO): void {
    this.environmentProvider.set(envContext, `wallet:${balanceDTO.address}:balance`, balanceDTO.balance.toString());
  }
  
  setWalletInfo(envContext: EnvironmentContext, address: string, info: WalletDTO): void {
    this.environmentProvider.set(envContext, `wallet:${address}:info`, JSON.stringify(info));
  }
}
