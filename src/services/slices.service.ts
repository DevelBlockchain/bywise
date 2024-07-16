import { EnvironmentChanges, Slice, Tx } from '@bywise/web3';
import { ApplicationContext, BlockchainStatus, CompiledContext } from '../types';
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
        isComplete: false,
        isExecuted: false,
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
    slices = slices.filter(info => info.isComplete === false);

    for (let i = 0; i < slices.length; i++) {
      const sliceInfo = slices[i];

      await this.syncSliceByHash(sliceInfo.slice.hash)
    }
    return slices.length > 0;
  }

  async syncSliceByHash(hash: string) {
    const sliceInfo = await this.getSliceInfo(hash);

    let isComplete = true;

    const mempool: Tx[] = [];
    for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
      const txHash = sliceInfo.slice.transactions[z];
      const mempoolTx = await this.TransactionRepository.getFromMempool(txHash);
      if (!mempoolTx) {
        const tx = await this.TransactionRepository.findTxByHash(txHash);
        if (!tx) {
          isComplete = false;
          await this.mq.send(RoutingKeys.find_tx, txHash);
        }
      } else {
        mempool.push(mempoolTx);
      }
    }
    if (mempool.length > 0) {
      await this.transactionsProvider.save(mempool);
    }
    if (isComplete) {
      sliceInfo.isComplete = true;
      this.logger.verbose(`sync-slices: complete - height: ${sliceInfo.slice.blockHeight} - hash: ${sliceInfo.slice.hash.substring(0, 10)}... - from: ${sliceInfo.slice.from.substring(0, 10)}...`)
      await this.updateSlice(sliceInfo);
    }
    return sliceInfo;
  }

  async executeCompleteSlice(chain: string, sliceInfo: Slices) {
    let success = false;
    let error = false;
    try {
      const env = {
        chain: chain,
        fromContextHash: CompiledContext.SLICE_CONTEXT_HASH,
        blockHeight: sliceInfo.slice.blockHeight,
        changes: {
          keys: [],
          values: [],
        }
      }
      const ctx = new RuntimeContext(this.environmentProvider, env);
      await this.environmentProvider.compile(chain, sliceInfo.slice.lastHash, CompiledContext.SLICE_CONTEXT_HASH);

      const txs = await this.TransactionRepository.findTxByHashs(sliceInfo.slice.transactions);
      const tte = await this.transactionsProvider.simulateTransactions(txs, sliceInfo.slice.lastHash, env);
      for (let j = 0; j < sliceInfo.slice.transactions.length && !error; j++) {
        const txHash = sliceInfo.slice.transactions[j];
        const tx = new Tx(txs[j]);
        const output = tte.outputs[j];

        const hash = tx.toHash();
        const received = tx.output;
        tx.output = output;
        if (!output) {
          this.logger.error(`Invalid transaction - tx.hash: ${txHash} - error: "Transaction Output Not Found"`)
          error = true;
        } else if (output.error) {
          this.logger.error(`Invalid transaction - tx.hash: ${txHash} - error: "${output.error}"`)
          error = true;
        } else if (hash !== tx.toHash()) {
          this.logger.error(`Invalid output - tx.hash: ${txHash}`);
          console.log("expected", output)
          console.log("received", received)
          error = true;
        } else {
          const errorMessage = await this.transactionsProvider.executeTransaction(ctx, tx, output);
          if (errorMessage) {
            this.logger.error(`Invalid transaction - tx.hash: ${txHash} - error: "${errorMessage}"`)
            error = true;
          }
        }
      }
      if (error) {
        this.logger.error(`Slice has invalid transactions - slice.hash: ${sliceInfo.slice.hash}`)
        sliceInfo.status = BlockchainStatus.TX_FAILED;
      } else {
        const envOut = ctx.getEnvOut();
        sliceInfo.isExecuted = true;
        success = true;
        sliceInfo.status = BlockchainStatus.TX_CONFIRMED;
        await this.environmentProvider.push(envOut, chain, sliceInfo.slice.hash, sliceInfo.slice.lastHash, sliceInfo.slice.hash);
        this.logger.verbose(`exec-slices: exec slice - height: ${sliceInfo.slice.blockHeight} - txs: ${sliceInfo.slice.transactionsCount} - hash: ${sliceInfo.slice.hash.substring(0, 10)}...`)
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
    lastSlices = lastSlices.filter(sliceInfo => sliceInfo.isExecuted === true);
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
    const slice = await this.SliceRepository.findByHash(hash);
    if (!slice) throw new Error(`slice not found ${hash}`);
    const sliceInfo: Slices = {
      slice: new Slice(slice.slice),
      status: slice.status,
      isComplete: slice.isComplete,
      isExecuted: slice.isExecuted,
      blockHash: slice.blockHash,
    }
    return sliceInfo;
  }

  async updateSlice(infoSlice: Slices) {
    const bslice = await this.SliceRepository.findByHash(infoSlice.slice.hash);
    if (bslice) {
      bslice.status = infoSlice.status;
      bslice.isComplete = infoSlice.isComplete;
      bslice.isExecuted = infoSlice.isExecuted;
      await this.SliceRepository.save(bslice);
    }
  }
}
