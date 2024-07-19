import { Slice, Tx } from '@bywise/web3';
import { ApplicationContext, BlockchainStatus, CompiledContext, ZERO_HASH } from '../types';
import { RoutingKeys } from '../datasource/message-queue';
import { Slices } from '../models';
import { TransactionsProvider } from './transactions.service';
import { EnvironmentProvider } from './environment.service';
import { RuntimeContext } from '../vm/RuntimeContext';

export class SlicesProvider {

  private TransactionRepository;
  private SliceRepository;
  private transactionsProvider;
  private environmentProvider;
  private mq;
  private logger;

  constructor(applicationContext: ApplicationContext, transactionsProvider: TransactionsProvider) {
    this.mq = applicationContext.mq;
    this.logger = applicationContext.logger;
    this.TransactionRepository = applicationContext.database.TransactionRepository;
    this.SliceRepository = applicationContext.database.SliceRepository;
    this.transactionsProvider = transactionsProvider;
    this.environmentProvider = new EnvironmentProvider(applicationContext);
  }

  async saveNewSlice(slice: Slice) {
    let bSlice = await this.SliceRepository.findByHash(slice.hash);
    if (!bSlice) {
      slice.isValid();

      bSlice = {
        slice: slice,
        attempts: 0,
        status: BlockchainStatus.TX_MEMPOOL,
        blockHash: ''
      }
      await this.SliceRepository.save(bSlice);
      this.mq.send(RoutingKeys.new_slice, slice);
    }
    return bSlice;
  }

  async syncSlices(chain: string) {
    let slices = await this.SliceRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);

    for (let i = 0; i < slices.length; i++) {
      const sliceInfo = slices[i];

      await this.syncSliceByHash(sliceInfo);
    }
    return slices.length > 0;
  }

  async syncSliceByHash(sliceInfo: Slices): Promise<boolean> {
    let isComplete = true;

    if (sliceInfo.slice.lastHash !== ZERO_HASH) {
      const lastSlice = await this.SliceRepository.findByHash(sliceInfo.slice.lastHash);
      if (!lastSlice) {
        isComplete = false;
        this.mq.send(RoutingKeys.find_slice, sliceInfo.slice.lastHash);
      } else if (lastSlice.status == BlockchainStatus.TX_FAILED) {
        sliceInfo.status = BlockchainStatus.TX_FAILED;
        this.logger.error(`sync-slices: Last slice is failed - slice.hash: ${sliceInfo.slice.hash}`);
        await this.updateSlice(sliceInfo);
        return false;
      } else if (lastSlice.status == BlockchainStatus.TX_MEMPOOL) {
        return false; // wait
      }
    }
    const mempool: Tx[] = [];
    const txs = await this.TransactionRepository.findTxByHashs(sliceInfo.slice.transactions);
    for (let z = 0; z < txs.length; z++) {
      const txHash = sliceInfo.slice.transactions[z];
      let tx = txs[z] as Tx | null;
      if (!tx) {
        tx = this.TransactionRepository.getMempoolByHash(txHash);
        if (!tx) {
          isComplete = false;
          this.mq.send(RoutingKeys.find_tx, txHash);
        } else {
          mempool.push(tx);
        }
      }
    }
    if (mempool.length > 0) {
      this.TransactionRepository.saveTxMany(mempool);
    }
    if (isComplete) {
      sliceInfo.attempts = 0;
      sliceInfo.status = BlockchainStatus.TX_COMPLETE;
      this.logger.verbose(`sync-slices: height: ${sliceInfo.slice.blockHeight} - hash: ${sliceInfo.slice.hash.substring(0, 10)}... - from: ${sliceInfo.slice.from.substring(0, 10)}...`)
    } else {
      sliceInfo.attempts++;
      if (sliceInfo.attempts >= 100) {
        this.logger.error(`sync-slices: Not found some transactions - slice.hash: ${sliceInfo.slice.hash}`);
        sliceInfo.status = BlockchainStatus.TX_FAILED;
      }
    }
    await this.updateSlice(sliceInfo);
    return isComplete;
  }

  async executeCompleteSlice(sliceInfo: Slices) {
    let success = false;
    let error = false;
    try {
      if (sliceInfo.slice.lastHash !== ZERO_HASH) {
        const lastSlice = await this.getSliceInfo(sliceInfo.slice.lastHash);

        if (lastSlice.status == BlockchainStatus.TX_FAILED) {
          sliceInfo.status = BlockchainStatus.TX_FAILED;
          await this.updateSlice(sliceInfo);
          return false;
        } else if (lastSlice.status == BlockchainStatus.TX_MEMPOOL) {
          throw new Error(`error execute slice - last slice status mempool`);
        } else if (lastSlice.status == BlockchainStatus.TX_COMPLETE) {
          return false; // wait execute last slice
        }
      }

      const env = {
        chain: sliceInfo.slice.chain,
        fromContextHash: CompiledContext.SLICE_CONTEXT_HASH,
        blockHeight: sliceInfo.slice.blockHeight,
        changes: {
          keys: [],
          values: [],
        }
      }
      const ctx = new RuntimeContext(this.environmentProvider, env);
      await this.environmentProvider.compile(sliceInfo.slice.chain, sliceInfo.slice.lastHash, CompiledContext.SLICE_CONTEXT_HASH);

      const txs = await this.TransactionRepository.findTxByHashs(sliceInfo.slice.transactions);
      const tte = await this.transactionsProvider.simulateTransactions(txs, sliceInfo.slice.lastHash, env);
      if (!tte) return false;
      for (let j = 0; j < sliceInfo.slice.transactions.length && !error; j++) {
        const txHash = sliceInfo.slice.transactions[j];
        const tx = txs[j];
        const output = tte.outputs[j];

        if (sliceInfo.slice.lastHash !== tx.output.ctx) {
          this.logger.error(`Invalid transaction - tx.hash: ${txHash} - error: "Invalid ctx"`);
          error = true;
        } else {
          const errorMessage = await this.transactionsProvider.executeTransaction(ctx, tx, output);
          if (errorMessage) {
            this.logger.error(`Invalid transaction - tx.hash: ${txHash} - error: "${errorMessage}"`);
            error = true;
          } else {
            this.mq.send(RoutingKeys.new_tx, tx);
          }
        }
      }
      if (error) {
        this.logger.error(`Slice has invalid transactions - slice.hash: ${sliceInfo.slice.hash}`);
        sliceInfo.status = BlockchainStatus.TX_FAILED;
      } else {
        const envOut = ctx.getEnvOut();
        sliceInfo.status = BlockchainStatus.TX_CONFIRMED;
        await this.environmentProvider.push(envOut, sliceInfo.slice.chain, sliceInfo.slice.hash, sliceInfo.slice.lastHash, sliceInfo.slice.hash);
        this.logger.verbose(`exec-slices: height: ${sliceInfo.slice.blockHeight} - txs: ${sliceInfo.slice.transactionsCount} - hash: ${sliceInfo.slice.hash.substring(0, 10)}...`);
        success = true;
      }
    } catch (err: any) {
      this.logger.error(`Error: ${err.message}`, err);
      sliceInfo.status = BlockchainStatus.TX_FAILED;
      success = false;
    }
    await this.updateSlice(sliceInfo);
    return success;
  }

  async getSlice(sliceHash: string): Promise<Slices | null> {
    return await this.SliceRepository.findByHash(sliceHash);
  }

  async getSlices(sliceHashs: string[]): Promise<Slices[]> {
    return await this.SliceRepository.findByHashs(sliceHashs);
  }

  async getMempool(chain: string) {
    return await this.SliceRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);
  }

  async getByHeight(chain: string, from: string, height: number) {
    let lastSlices = await this.SliceRepository.findByChainAndBlockHeight(chain, height);
    lastSlices = lastSlices.filter(sliceInfo => sliceInfo.slice.from === from);
    lastSlices = lastSlices.filter(sliceInfo => sliceInfo.status == BlockchainStatus.TX_CONFIRMED);
    lastSlices = lastSlices.sort((s1, s2) => s1.slice.height - s2.slice.height);
    let slices: Slices[] = [];
    for (let i = 0; i < lastSlices.length; i++) {
      const sliceInfo = lastSlices[i];
      if (sliceInfo.slice.height !== i) {
        return slices;
      }
      slices.push(sliceInfo);
      if (sliceInfo.slice.end) {
        return slices;
      }
    }
    return slices;
  }

  async getSliceInfo(hash: string): Promise<Slices> {
    const sliceInfo = await this.SliceRepository.findByHash(hash);
    if (!sliceInfo) throw new Error(`slice not found ${hash}`);
    return sliceInfo;
  }

  async updateSlice(infoSlice: Slices) {
    await this.SliceRepository.save(infoSlice);
  }
}
