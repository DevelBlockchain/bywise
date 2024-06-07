import { BlockchainStatus } from '../types/transactions.type';
import { Slice } from '@bywise/web3';
import { ApplicationContext } from '../types/task.type';
import { RoutingKeys } from '../datasource/message-queue';
import { Slices } from '../models';
import { BlockTree } from '../types/environment.types';
import { TransactionsProvider } from './transactions.service';
import { EnvironmentProvider } from './environment.service';

export class SlicesProvider {

  private TransactionRepository;
  private SliceRepository;
  private transactionsProvider;
  private environmentProvider;
  private mq;
  private logger;

  constructor(applicationContext: ApplicationContext) {
    this.mq = applicationContext.mq;
    this.logger = applicationContext.logger;
    this.TransactionRepository = applicationContext.database.TransactionRepository;
    this.SliceRepository = applicationContext.database.SliceRepository;
    this.transactionsProvider = new TransactionsProvider(applicationContext);
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
        blockHash: '',
        outputs: []
      }
      await this.SliceRepository.save(bSlice);
      this.mq.send(RoutingKeys.new_slice, slice);
    }
    return bSlice;
  }

  async syncSlices(blockTree: BlockTree) {
    let slices = await this.SliceRepository.findByChainAndStatus(blockTree.chain, BlockchainStatus.TX_MEMPOOL);
    slices = slices.filter(info => info.isComplete === false);

    for (let i = 0; i < slices.length; i++) {
      const sliceInfo = slices[i];

      await this.syncSliceByHash(blockTree, sliceInfo.slice.hash)
    }
  }

  async syncSliceByHash(blockTree: BlockTree, hash: string) {
    const sliceInfo = await this.getSliceInfo(hash);

    let isComplete = true;

    for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
      const txHash = sliceInfo.slice.transactions[z];
      const tx = await this.TransactionRepository.findByHash(txHash);
      if (!tx) {
        isComplete = false;
        await this.mq.send(RoutingKeys.find_tx, txHash);
      }
    }
    if (isComplete) {
      sliceInfo.isComplete = true;
      this.logger.verbose(`sync-slices: complete - height: ${sliceInfo.slice.blockHeight} - hash: ${sliceInfo.slice.hash.substring(0, 10)}... - from: ${sliceInfo.slice.from.substring(0, 10)}...`)

      blockTree.addSlice(sliceInfo.slice);
      await this.updateSlice(sliceInfo);
    }
    return sliceInfo;
  }

  async executeCompleteSlice(blockTree: BlockTree, lastContextHash: string, sliceInfo: Slices) {
    const ctx = this.transactionsProvider.createContext(blockTree, lastContextHash, sliceInfo.slice.blockHeight);
    try {
      let error = false;
      sliceInfo.outputs = [];
      for (let j = 0; j < sliceInfo.slice.transactions.length && !error; j++) {
        const txHash = sliceInfo.slice.transactions[j];
        let txInfo = await this.transactionsProvider.getTxInfo(txHash);
        const output = await this.transactionsProvider.simulateTransaction(txInfo.tx, sliceInfo.slice, ctx);
        sliceInfo.outputs.push(output);
        if (output.error) {
          this.logger.error(output.error)
          error = true;
        }
      }
      if (error) {
        this.logger.error(`Slice has invalid transactions - hash: ${sliceInfo.slice.hash}`)
        sliceInfo.status = BlockchainStatus.TX_FAILED;
      } else {
        sliceInfo.isExecuted = true;
        this.environmentProvider.commit(ctx.envContext);
        this.environmentProvider.push(ctx.envContext, sliceInfo.slice.hash);
        this.logger.verbose(`exec-slices: exec slice - height: ${sliceInfo.slice.blockHeight} - hash: ${sliceInfo.slice.hash.substring(0, 10)}...`)
        
        if(blockTree.bestSlice) {
          if(blockTree.bestSlice.blockHeight < sliceInfo.slice.blockHeight ||
            blockTree.bestSlice.height < sliceInfo.slice.height ||
            blockTree.bestSlice.height == sliceInfo.slice.height && blockTree.bestSlice.transactionsCount < sliceInfo.slice.transactionsCount) {
            blockTree.bestSlice = sliceInfo.slice;
          }
        } else if(sliceInfo.slice.blockHeight > blockTree.currentMinnedBlock.height) {
          blockTree.bestSlice = sliceInfo.slice;
        }

        for (let j = 0; j < sliceInfo.slice.transactions.length && !error; j++) {
          const txHash = sliceInfo.slice.transactions[j];
          let txInfo = await this.transactionsProvider.getTxInfo(txHash);
          txInfo.status = BlockchainStatus.TX_CONFIRMED;
          txInfo.output = sliceInfo.outputs[j];
          this.transactionsProvider.updateTransaction(txInfo);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error: ${err.message}`, err);
      sliceInfo.status = BlockchainStatus.TX_FAILED;
    }
    await this.updateSlice(sliceInfo);
    await this.transactionsProvider.disposeContext(ctx);
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

  async getByHeight(chain: string, height: number) {
    return await this.SliceRepository.findByChainAndBlockHeight(chain, height);
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
      outputs: slice.outputs,
    }
    return sliceInfo;
  }

  async updateSlice(infoSlice: Slices) {
    const bslice = await this.SliceRepository.findByHash(infoSlice.slice.hash);
    if (bslice) {
      bslice.status = infoSlice.status;
      bslice.isComplete = infoSlice.isComplete;
      bslice.isExecuted = infoSlice.isExecuted;
      bslice.outputs = infoSlice.outputs;
      await this.SliceRepository.save(bslice);
    }
  }
}
