import { Tx, TxType, Wallet } from '@bywise/web3';
import { ApplicationContext, BlockchainStatus, TransactionsToExecute, Task, EnvironmentContext } from '../types';
import { RoutingKeys } from '../datasource/message-queue';
import { Transaction } from '../models';
import helper from '../utils/helper';

export class TransactionsProvider {

  private mq;
  private task;
  private TransactionRepository;
  private mainWallet;
  private transactionsToExecute: Map<string, TransactionsToExecute> = new Map();

  constructor(applicationContext: ApplicationContext, task: Task) {
    this.task = task;
    this.TransactionRepository = applicationContext.database.TransactionRepository;
    this.mq = applicationContext.mq;
    this.mainWallet = applicationContext.mainWallet;

    this.mq.addMessageListener(RoutingKeys.set_transactions_to_execute, async (data: TransactionsToExecute) => {
      this.transactionsToExecute.set(data.id, data);
    });
  }

  async createNewTransaction(chain: string, to: string, amount: string, fee: string, type: TxType, data: any = {}, foreignKeys?: string[]) {
    let wallet = await this.mainWallet;
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
    tx.created = Math.floor(Date.now() / 1000);
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
    tx.created = Math.floor(Date.now() / 1000);
    tx.hash = tx.toHash();
    tx.sign = [await wallet.signHash(tx.hash)];
    return tx;
  }

  async simulateTransactions(txs: Transaction[], fromSlice: string, env: EnvironmentContext, ignoreBalance: boolean = false): Promise<TransactionsToExecute> {
    if (!this.task.isRun) throw new Error(`task not run`);
    let tte: TransactionsToExecute = {
      id: helper.getRandomHash(),
      env: env,
      txs: txs,
      fromSlice: fromSlice,
      ignoreBalance: ignoreBalance,
      outputs: [],
      envOut: {
        keys: [],
        values: [],
      }
    }
    this.transactionsToExecute.set(tte.id, tte);
    this.mq.send(RoutingKeys.add_transactions_to_execute, tte);

    do {
      const tteOutput = this.transactionsToExecute.get(tte.id);
      if (tteOutput && tteOutput.outputs.length > 0) {
        tte = tteOutput;
        this.transactionsToExecute.delete(tte.id);
      } else {
        await helper.sleep(50);
      }
    } while (tte.outputs.length == 0 && this.task.isRun);

    return tte;
  }

  async saveNewTransaction(tx: Tx) {

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
      this.mq.send(RoutingKeys.new_tx, tx);
      return newTx;
    }
    return registeredTx;
  }

  public async updateTransaction(infoTx: Transaction) {
    await this.TransactionRepository.save(infoTx);
  }

  async getTxInfo(hash: string) {
    const txInfo = await this.TransactionRepository.findByHash(hash);
    if (!txInfo) throw new Error(`transaction not found ${hash}`);
    return txInfo;
  }

  async getMempool(chain: string) {
    return await this.TransactionRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);
  }

  async getTransactions(TXHashs: string[]) {
    return await this.TransactionRepository.findByHashs(TXHashs);
  }
}
