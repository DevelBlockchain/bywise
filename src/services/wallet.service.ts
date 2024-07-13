import BigNumber from "bignumber.js";
import { WalletBalanceDTO, WalletCodeDTO, WalletInfoDTO } from "../types";
import { RuntimeContext } from "../vm/RuntimeContext";

export class WalletProvider {

  async getWalletInfo(ctx: RuntimeContext, address: string): Promise<WalletInfoDTO> {
    let walletDTO = await ctx.get(`${address}-WI`);
    if (walletDTO) {
      return {
        ...JSON.parse(walletDTO),
        address: address
      };
    }
    return { address: address };
  }

  async setWalletInfo(ctx: RuntimeContext, walletDTO: WalletInfoDTO): Promise<void> {
    await ctx.set(`${walletDTO.address}-WI`, JSON.stringify({
      ...walletDTO,
      address: undefined
    }));
  }

  async getWalletBalance(ctx: RuntimeContext, address: string): Promise<WalletBalanceDTO> {
    let walletDTO = await ctx.get(`${address}-WB`);
    if (walletDTO) {
      return {
        balance: BigInt(walletDTO),
        address: address
      };
    }
    return {
      balance: BigInt(0),
      address: address
    };
  }

  async setWalletBalance(ctx: RuntimeContext, walletDTO: WalletBalanceDTO): Promise<void> {
    await ctx.set(`${walletDTO.address}-WB`, walletDTO.balance.toString());
  }

  async getWalletCode(ctx: RuntimeContext, address: string): Promise<WalletCodeDTO | null> {
    let walletDTO = await ctx.get(`${address}-WC`);
    if (walletDTO) {
      return {
        ...JSON.parse(walletDTO),
        address: address
      };
    }
    return null;
  }

  async setWalletCode(ctx: RuntimeContext, walletCodeDTO: WalletCodeDTO): Promise<void> {
    await ctx.set(`${walletCodeDTO.address}-WC`, JSON.stringify({
      ...walletCodeDTO,
      address: undefined
    }));
  }
}
