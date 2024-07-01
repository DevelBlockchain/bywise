import BigNumber from "bignumber.js";
import { Wallet } from '@bywise/web3';
import { EnvironmentProvider } from "./environment.service";
import { ApplicationContext, EnvironmentContext, WalletBalanceDTO, WalletCodeDTO, WalletInfoDTO } from "../types";

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

  async getWalletInfo(envContext: EnvironmentContext, address: string): Promise<WalletInfoDTO> {
    let walletDTO = await this.environmentProvider.get(envContext, `${address}-WI`);
    if (walletDTO) {
      return {
        ...JSON.parse(walletDTO),
        address: address
      };
    }
    return { address: address };
  }

  async setWalletInfo(envContext: EnvironmentContext, walletDTO: WalletInfoDTO): Promise<void> {
    await this.environmentProvider.set(envContext, `${walletDTO.address}-WI`, JSON.stringify({
      ...walletDTO,
      address: undefined
    }));
  }

  async getWalletBalance(envContext: EnvironmentContext, address: string): Promise<WalletBalanceDTO> {
    let walletDTO = await this.environmentProvider.get(envContext, `${address}-WB`);
    if (walletDTO) {
      return {
        balance: new BigNumber(walletDTO),
        address: address
      };
    }
    return {
      balance: new BigNumber(0),
      address: address
    };
  }

  async setWalletBalance(envContext: EnvironmentContext, walletDTO: WalletBalanceDTO): Promise<void> {
    await this.environmentProvider.set(envContext, `${walletDTO.address}-WB`, walletDTO.balance.toString());
  }

  async getWalletCode(envContext: EnvironmentContext, address: string): Promise<WalletCodeDTO | null> {
    let walletDTO = await this.environmentProvider.get(envContext, `${address}-WC`);
    if (walletDTO) {
      return {
        ...JSON.parse(walletDTO),
        address: address
      };
    }
    return null;
  }

  async setWalletCode(envContext: EnvironmentContext, walletCodeDTO: WalletCodeDTO): Promise<void> {
    await this.environmentProvider.set(envContext, `${walletCodeDTO.address}-WC`, JSON.stringify({
      ...walletCodeDTO,
      address: undefined
    }));
  }
}
