import { Tx, TxOutput, TxType, Wallet } from '@bywise/web3';
import { ApplicationContext, TransactionsToExecute, Task, EnvironmentContext } from '../types';
import { RoutingKeys } from '../datasource/message-queue';
import helper from '../utils/helper';
import { RuntimeContext } from '../vm/RuntimeContext';

export class TransactionsProvider {

  private applicationContext;
  private mq;
  private task;
  private TransactionRepository;
  private mainWallet;
  private vmIndex;
  private transactionsToExecute: Map<string, TransactionsToExecute> = new Map();

  constructor(applicationContext: ApplicationContext, task: Task) {
    this.applicationContext = applicationContext;
    this.task = task;
    this.TransactionRepository = applicationContext.database.TransactionRepository;
    this.mq = applicationContext.mq;
    this.mainWallet = applicationContext.mainWallet;
    this.vmIndex = 0;

    this.mq.addMessageListener(RoutingKeys.set_transactions_to_execute, async (data: TransactionsToExecute) => {
      if (this.transactionsToExecute.has(data.id)) {
        this.transactionsToExecute.set(data.id, data);
      }
    });
  }

  async createNewTransaction(chain: string, to: string, amount: string, fee: string, type: TxType, data: any = {}, foreignKeys?: string[]) {
    let wallet = await this.mainWallet;
    let tx = new Tx();
    tx.version = '3';
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
    tx.version = '3';
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

  async simulateTransactions(txs: Tx[], fromSlice: string, env: EnvironmentContext, ignoreBalance: boolean = false): Promise<TransactionsToExecute | null> {
    let tte: TransactionsToExecute = {
      id: helper.getRandomHash(),
      env: env,
      txs: txs,
      vmIndex: this.vmIndex,
      fromSlice: fromSlice,
      ignoreBalance: ignoreBalance,
      outputs: [],
    }
    this.vmIndex++;
    if (this.vmIndex >= this.applicationContext.vmSize) {
      this.vmIndex = 0;
    }
    this.transactionsToExecute.set(tte.id, tte);
    this.mq.send(RoutingKeys.add_transactions_to_execute, tte);

    for (let i = 0; i < 100; i++) {
      await helper.sleep(50);
      const tteOutput = this.transactionsToExecute.get(tte.id);
      if (tteOutput && tteOutput.outputs.length > 0) {
        tte = tteOutput;
        this.transactionsToExecute.delete(tte.id);
        return tte;
      }
      if(!this.task.isRun) return null;
    }
    return null;
  }

  public async save(txs: Tx[]) {
    await this.TransactionRepository.saveTxMany(txs);
  }

  async getTransactions(TXHashs: string[]) {
    return await this.TransactionRepository.findTxByHashs(TXHashs);
  }

  async executeTransaction(ctx: RuntimeContext, tx: Tx, output: TxOutput) {
    let error: string | null = null;
    for (let i = 0; i < output.get.length && !error; i++) {
      const key = output.get[i];
      if (ctx.setMainKeys.has(key)) {
        error = `changed key`;
      }
    }
    for (let i = 0; i < output.envs.keys.length && !error; i++) {
      const key = output.envs.keys[i];
      const value = output.envs.values[i];
      ctx.setStageKeys.set(key, {
        chain: ctx.env.chain,
        hash: ctx.env.fromContextHash,
        key: key,
        value: value,
      })
    }
    for (let j = 0; j < output.walletAddress.length && !error; j++) {
      const address = output.walletAddress[j];
      const amount = BigInt(output.walletAmount[j]);

      const walletBalance = await ctx.get(`${address}-WB`);
      let balance = 0n;
      if (walletBalance) {
        balance = BigInt(walletBalance);
      }
      balance = balance + amount;
      await ctx.set(`${address}-WB`, balance.toString());
      if (balance < 0n) {
        error = `low balance`;
      }
    }
    let debit = BigInt(output.debit);
    for (let j = 0; j < tx.from.length && !error; j++) {
      const address = tx.from[j];

      const walletBalance = await ctx.get(`${address}-WB`);
      let balance = 0n;
      if (walletBalance) {
        balance = BigInt(walletBalance);
      }
      if (balance >= debit) {
        balance = balance - debit;
        debit = 0n;
      } else {
        debit = debit - balance;
        balance = 0n;
      }
      await ctx.set(`${address}-WB`, balance.toString());
    }
    if (debit > 0n && !error) {
      error = `Insuficient funds`;
    }
    if (!error) {
      ctx.commit();
    } else {
      ctx.deleteCommit();
    }
    return error;
  }
}
