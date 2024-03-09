import { SimulateDTO, TransactionOutputDTO, BlockchainStatus } from '../types/transactions.type';
import { VirtualMachineProvider } from './virtual-machine.service';
import { Tx, TxType, BywiseHelper, Block, Wallet, Slice, SliceData } from '@bywise/web3';
import { ApplicationContext } from '../types/task.type';
import { WalletProvider } from './wallet.service';
import { BlockTree } from '../types/environment.types';
import helper from '../utils/helper';
import { EnvironmentProvider } from './environment.service';
import { RoutingKeys } from '../datasource/message-queue';
import { Blocks, Transaction } from '../models';

export class TransactionsProvider {

  private virtualMachineProvider;
  private environmentProvider;
  private mq;
  private TransactionRepository;
  private walletProvider;

  constructor(applicationContext: ApplicationContext) {
    this.TransactionRepository = applicationContext.database.TransactionRepository;
    this.mq = applicationContext.mq;
    this.environmentProvider = new EnvironmentProvider(applicationContext);
    this.virtualMachineProvider = new VirtualMachineProvider(applicationContext);
    this.walletProvider = new WalletProvider(applicationContext);
  }

  createContext(blockTree: BlockTree, lastBlock: Blocks) {
    const simulationId = helper.getRandomHash();

    const block = new Block();
    block.height = lastBlock.block.height + 1;
    block.chain = blockTree.chain;
    block.version = '2';
    block.created = Math.floor(Date.now()/1000);
    block.lastHash = lastBlock.block.hash;
    block.hash = simulationId;

    blockTree.addHash(lastBlock.block.hash, simulationId);

    return new SimulateDTO(blockTree, block, simulationId);
  }

  createSubContext(ctx: SimulateDTO) {
    if (!ctx.simulationId) throw new Error(`not is simulation`);
    const newHash = helper.getRandomHash();
    ctx.simulationIds.push(newHash);
    ctx.blockTree.addHash(ctx.block.hash, newHash);
    ctx.block.hash = newHash;
  }

  async disposeSubContext(ctx: SimulateDTO) {
    const id = ctx.simulationIds.pop();
    if (id !== undefined) {
      // recuperar ctx.block.hash
      const lastHash = ctx.simulationIds[ctx.simulationIds.length - 1];
      if (!lastHash) throw new Error(`lastHash not found`);
      ctx.block.hash = lastHash;
      await this.environmentProvider.deleteSimulation(ctx.blockTree, id);
    }
  }

  async disposeContext(ctx: SimulateDTO) {
    if (ctx.simulationId) {
      for (let i = 0; i < ctx.simulationIds.length; i++) {
        const id = ctx.simulationIds[i];
        await this.environmentProvider.deleteSimulation(ctx.blockTree, id);
      }
    } else {
      await this.environmentProvider.deleteSimulation(ctx.blockTree, ctx.block.hash);
    }
  }

  async createNewTransaction(chain: string, to: string, amount: string, fee: string, type: TxType, data: any = {}, foreignKeys?: string[]) {
    let wallet = await this.walletProvider.getMainWallet();
    let tx = new Tx();
    tx.version = '2';
    tx.chain = chain;
    tx.from = [wallet.address];
    tx.to = [to];
    tx.amount = [amount];
    tx.fee = fee;
    tx.type = type;
    tx.data = data;
    tx.foreignKeys = foreignKeys;
    tx.created = Math.floor(Date.now()/1000);
    tx.hash = tx.toHash();
    tx.sign = [await wallet.signHash(tx.hash)];
    return this.createNewTransactionFromWallet(wallet, chain, to, amount, fee, type, data, foreignKeys);
  }

  async createNewTransactionFromWallet(wallet: Wallet, chain: string, to: string, amount: string, fee: string, type: TxType, data: any = {}, foreignKeys?: string[]) {
    let tx = new Tx();
    tx.version = '2';
    tx.chain = chain;
    tx.from = [wallet.address];
    tx.to = [to];
    tx.amount = [amount];
    tx.fee = fee;
    tx.type = type;
    tx.data = data;
    tx.foreignKeys = foreignKeys;
    tx.created = Math.floor(Date.now()/1000);
    tx.hash = tx.toHash();
    tx.sign = [await wallet.signHash(tx.hash)];
    return tx;
  }

  async simulateTransaction(tx: Tx, slice: { from: string, transactionsData?: SliceData[] }, ctx: SimulateDTO): Promise<TransactionOutputDTO> {
    ctx.output.error = undefined;
    try {
      await this.virtualMachineProvider.executeTransaction(tx, slice, ctx);
    } catch (err: any) {
      ctx.output.error = err.message;
    }
    return ctx.output;
  }

  async saveNewTransaction(tx: Tx, notify = true) {
    
    const registeredTx = await this.TransactionRepository.findByHash(tx.hash);
    if (!registeredTx) {
      tx.isValid();

      const newTx = {
        tx: tx,
        isExecuted: false,
        slicesHash: '',
        blockHash: '',
        create: Date.now(),
        status: BlockchainStatus.TX_MEMPOOL
      }
      await this.TransactionRepository.save(newTx);
      if (notify) {
        this.mq.send(RoutingKeys.new_tx, tx);
      }
      return newTx;
    }
    return registeredTx;
  }

  public async updateTransaction(infoTx: Transaction) {
    await this.TransactionRepository.save(infoTx);
  }

  async populateTxInfo(blockTree: BlockTree, hash: string) {
    if (blockTree.getTxInfo(hash)) {
      return;
    }
    const btx = await this.TransactionRepository.findByHash(hash);
    if (btx) {
      blockTree.setTxInfo(btx);
      return true;
    }
    return false;
  }

  async getMempool(chain: string) {
    return await this.TransactionRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);
  }
  
  async getTransactions(TXHashs: string[]) {
    return await this.TransactionRepository.findByHashs(TXHashs);
  }
}
