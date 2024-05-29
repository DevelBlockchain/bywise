import { ApplicationContext } from "../types/task.type";
import { ETHAction, ETHProxyData } from "../models/eth.model";
import { ethers } from "ethers";
import Web3 from 'web3';
import { ETHChains, PROXY_API, } from "../types/eth.type";
import { WalletProvider } from "./wallet.service";
import helper from "../utils/helper";

export class ETHProvider {

  private ETHRepository;
  private walletProvider;
  private logger;
  private static busy = false;

  constructor(applicationContext: ApplicationContext) {
    this.logger = applicationContext.logger;
    this.ETHRepository = applicationContext.database.ETHRepository;
    this.walletProvider = new WalletProvider(applicationContext);
  }

  private static async waitBusy(func: () => Promise<void>) {
    while (ETHProvider.busy) {
      await helper.sleep(100);
    }
    ETHProvider.busy = true;
    try {
      await func();
      ETHProvider.busy = false;
    } catch (err) {
      ETHProvider.busy = false;
      throw err;
    }
  }

  private findETHChain(proxyChain: string) {
    for (let i = 0; i < ETHChains.length; i++) {
      const ethChain = ETHChains[i];
      if (ethChain.symbol === proxyChain) {
        return ethChain;
      }
    }
    throw new Error(`chain ${proxyChain} not found`);
  }

  private async getProxy(proxyChain: string) {
    const ethChain = this.findETHChain(proxyChain);

    const web3 = new Web3(ethChain.provider);
    const contract = new web3.eth.Contract(PROXY_API, ethChain.proxy);
    return {
      web3: web3,
      contract: contract,
      ethChain: ethChain,
    }
  }


  async newAction(action: ETHAction) {
    this.findETHChain(action.proxyChain);
    let foundAction = await this.ETHRepository.findByHash(action.proposalId);
    if (foundAction === null) {
      await this.ETHRepository.save(action);
      return action;
    } else {
      return foundAction;
    }
  }
  
  async voteAction(action: ETHAction) {
    const proxy = await this.getProxy(action.proxyChain);
    
    const isExistProposal = await proxy.contract.methods.hasProposal('0x' + action.proposalId).call();
    if (`${isExistProposal}`.toLowerCase() === 'false') {
      throw new Error(`Proposal not found`);
    }
    const isValidFrom = await proxy.contract.methods.actionIsValidFrom(action.proxyAction, action.from).call();
    if (`${isValidFrom}`.toLowerCase() !== 'true') {
      throw new Error(`Invalid from`);
    }
    
    const mainWallet = await this.walletProvider.getMainWallet();
    const account = await ethers.Wallet.fromPhrase(mainWallet.seed);
    
    const hasPrivilege = await proxy.contract.methods.hasPrivilege(account.address).call();
    if (`${hasPrivilege}`.toLowerCase() === 'false') {
      this.logger.verbose(`voteAction - dont has privilege - address: ${account.address}`);
      return true;
    }
    const isVoteProposal = await proxy.contract.methods.isVoteProposal(account.address, '0x' + action.proposalId).call();
    if (`${isVoteProposal}`.toLowerCase() === 'true') {
      this.logger.verbose(`voteAction - already vote proposal - address: ${account.address} proposal: ${action.proposalId}`);
      return true;
    }
    await proxy.contract.methods.vote('0x' + action.proposalId).call({ from: account.address });
    const encodedABI = proxy.contract.methods.vote('0x' + action.proposalId).encodeABI();

    const gasPrice = await proxy.web3.eth.getGasPrice();

    const estimateGas = await proxy.web3.eth.estimateGas({
      to: proxy.ethChain.proxy,
      from: account.address,
      data: encodedABI,
      value: proxy.web3.utils.toHex('0'),
      gasPrice: proxy.web3.utils.toHex(gasPrice)
    });

    await ETHProvider.waitBusy(async () => {
      const txCount = await proxy.web3.eth.getTransactionCount(account.address, 'pending');
      const rawTransaction = {
        nonce: txCount,
        from: account.address,
        to: proxy.ethChain.proxy,
        data: encodedABI,
        value: proxy.web3.utils.toHex('0'),
        gasLimit: proxy.web3.utils.toHex(estimateGas),
        gasPrice: proxy.web3.utils.toHex(gasPrice),
        chainId: proxy.ethChain.chainID
      }
      const signedTx = await proxy.web3.eth.accounts.signTransaction(
        rawTransaction,
        account.privateKey
      );
      if (!signedTx.rawTransaction) throw new Error('Internal Error ethRaw');
      if (!signedTx.transactionHash) throw new Error('Internal Error ethHash');

      const ethHash = signedTx.transactionHash;
      const tx = await proxy.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      action.voteHash = ethHash;
    });
  }

  async registerAction(action: ETHAction) {
    const proxy = await this.getProxy(action.proxyChain);

    const addresses = action.proxyAddresses ? action.proxyAddresses : [];
    const values = action.proxyValues ? action.proxyValues : [];
    const strings = action.proxyStrings ? action.proxyStrings : [];
    const data = action.proxyData ? action.proxyData : [];

    const isExistProposal = await proxy.contract.methods.hasProposal('0x' + action.proposalId).call();
    if (`${isExistProposal}`.toLowerCase() === 'true') {
      return;
    }

    const mainWallet = await this.walletProvider.getMainWallet();
    const account = await ethers.Wallet.fromPhrase(mainWallet.seed);

    const isValidFrom = await proxy.contract.methods.actionIsValidFrom(action.proxyAction, action.from).call();
    if (`${isValidFrom}`.toLowerCase() !== 'true') {
      throw new Error(`Invalid from`);
    }

    let encodedABI: any;

    await proxy.contract.methods.proposalAddressesAndValuesAndStringsAndData('0x' + action.proposalId, action.proxyAction, addresses, values, strings, data).call({ from: account.address });
    encodedABI = proxy.contract.methods.proposalAddressesAndValuesAndStringsAndData('0x' + action.proposalId, action.proxyAction, addresses, values, strings, data).encodeABI();

    const gasPrice = await proxy.web3.eth.getGasPrice();

    const estimateGas = await proxy.web3.eth.estimateGas({
      from: account.address,
      to: proxy.ethChain.proxy,
      data: encodedABI,
      value: proxy.web3.utils.toHex('0'),
      gasPrice: proxy.web3.utils.toHex(gasPrice)
    });

    await ETHProvider.waitBusy(async () => {
      const txCount = await proxy.web3.eth.getTransactionCount(account.address, 'pending');
      const rawTransaction = {
        nonce: txCount,
        from: account.address,
        to: proxy.ethChain.proxy,
        data: encodedABI,
        value: proxy.web3.utils.toHex('0'),
        gasLimit: proxy.web3.utils.toHex(estimateGas),
        gasPrice: proxy.web3.utils.toHex(gasPrice),
        chainId: proxy.ethChain.chainID
      }
      const signedTx = await proxy.web3.eth.accounts.signTransaction(
        rawTransaction,
        account.privateKey
      );
      if (!signedTx.rawTransaction) throw new Error('Internal Error ethRaw');
      if (!signedTx.transactionHash) throw new Error('Internal Error ethHash');

      const ethHash = signedTx.transactionHash;
      await proxy.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      action.ethHash = ethHash;
    });
  }

  async costAction(proxyChain: string, proxyAction: string, proxyParans: ETHProxyData): Promise<number> {
    return this.findETHChain(proxyChain).cost;
  }

  async readAction(proxyChain: string, proxyAction: string, proxyParans: ETHProxyData): Promise<string> {
    const proxy = await this.getProxy(proxyChain);

    const addresses = proxyParans.addresses ? proxyParans.addresses : [];
    const values = proxyParans.values ? proxyParans.values : [];
    const strings = proxyParans.strings ? proxyParans.strings : [];
    const data = proxyParans.data ? proxyParans.data : [];

    const response = await proxy.contract.methods.actionRead(proxyAction, addresses, values, strings, data).call();
    return `${response}`;
  }
}
