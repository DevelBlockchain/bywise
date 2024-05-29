import { BlockchainStatus } from '../types/transactions.type';
import { Block, Slice } from '@bywise/web3';
import { ApplicationContext } from '../types/task.type';
import { RoutingKeys } from '../datasource/message-queue';
import { Blocks, Slices } from '../models';
import { BlockTree } from '../types/environment.types';
import { TransactionsProvider } from './transactions.service';

export class SlicesProvider {

  private SliceRepository;
  private transactionsProvider;
  private mq;
  private logger;

  constructor(applicationContext: ApplicationContext) {
    this.mq = applicationContext.mq;
    this.logger = applicationContext.logger;
    this.SliceRepository = applicationContext.database.SliceRepository;
    this.transactionsProvider = new TransactionsProvider(applicationContext);
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
    const sliceInfoList = blockTree.sliceInfoList.filter(info => info.isComplete === false && info.status === BlockchainStatus.TX_MEMPOOL);

    for (let i = 0; i < sliceInfoList.length; i++) {
      const sliceInfo = sliceInfoList[i];

      await this.syncSliceByHash(blockTree, sliceInfo.slice.hash)
    }
  }

  async syncSliceByHash(blockTree: BlockTree, hash: string) {
    const sliceInfo = blockTree.getSliceInfo(hash);
    if (!sliceInfo) throw new Error(`slice not found - ${hash}`);

    let isComplete = true;

    for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
      const txHash = sliceInfo.slice.transactions[z];
      const tx = blockTree.getTxInfo(txHash);
      if (!tx) {
        isComplete = false;
        let found = await this.transactionsProvider.populateTxInfo(blockTree, txHash);
        if (!found) {
          await this.mq.send(RoutingKeys.find_tx, txHash);
        }
      }
    }
    if (isComplete) {
      sliceInfo.isComplete = true;
      this.logger.verbose(`sync-slices: complete - height: ${sliceInfo.slice.blockHeight} - hash: ${sliceInfo.slice.hash.substring(0, 10)}... - from: ${sliceInfo.slice.from.substring(0, 10)}...`)
      await this.updateSlice(sliceInfo);
    }
  }

  async executeCompleteSlices(blockTree: BlockTree) {
    let sliceInfos = blockTree.sliceInfoList.filter(info => info.isComplete === true && info.isExecuted === false && info.status === BlockchainStatus.TX_MEMPOOL);
    if (sliceInfos.length == 0) {
      return;
    }

    sliceInfos = sliceInfos.sort((s1, s2) => s2.slice.created - s1.slice.created);
    sliceInfos = sliceInfos.filter((s1, i) => i < 3);

    for (let i = 0; i < sliceInfos.length; i++) {
      const slice = sliceInfos[i];

      await this.executeCompleteSliceByHash(blockTree, slice.slice.hash);
    }
  }

  async executeCompleteSliceByHash(blockTree: BlockTree, hash: string) {
    const slice = blockTree.getSliceInfo(hash);
    if (!slice) throw new Error(`slice not found - ${hash}`);

    let lastBlockSlice: Blocks | null = null;
    const blocks = blockTree.blockInfoList.filter(info => info.status === BlockchainStatus.TX_MINED && info.block.height === slice.slice.blockHeight - 1);
    if (blocks.length === 1) {
      lastBlockSlice = blocks[0];
    } else {
      const imaginaryBlock = new Block();
      imaginaryBlock.height = slice.slice.blockHeight - 1;
      imaginaryBlock.chain = blockTree.chain;
      imaginaryBlock.version = '2';
      imaginaryBlock.created = Math.floor(Date.now() / 1000);
      imaginaryBlock.lastHash = BlockTree.ZERO_HASH;
      imaginaryBlock.hash = BlockTree.ZERO_HASH;
      lastBlockSlice = {
        block: imaginaryBlock,
        status: BlockchainStatus.TX_MINED,
        countTrys: 0,
        isComplete: true,
        isExecuted: true,
        isImmutable: true,
        distance: '0',
      }
    }

    let error = false;
    if (lastBlockSlice === null) {
      error = false;
      this.logger.error(`Slice lastblock not found - ${slice.slice.blockHeight - 1}`);
      slice.status = BlockchainStatus.TX_FAILED;
    } else {
      const ctx = this.transactionsProvider.createContext(blockTree, lastBlockSlice);
      slice.outputs = [];
      for (let j = 0; j < slice.slice.transactions.length && !error; j++) {
        const txHash = slice.slice.transactions[j];
        let txInfo = blockTree.getTxInfo(txHash);
        if (!txInfo) {
          await this.transactionsProvider.populateTxInfo(blockTree, txHash);
          txInfo = blockTree.getTxInfo(txHash);
        }
        if (!txInfo) throw new Error(`Slice not complete - ${slice.slice.hash}`);
        const output = await this.transactionsProvider.simulateTransaction(txInfo.tx, slice.slice, ctx);
        slice.outputs.push(output);
        if (output.error) {
          this.logger.error(output.error)
          error = true;
        }
      }
      await this.transactionsProvider.disposeContext(ctx);
    }


    if (error) {
      this.logger.error(`Slice has invalid transactions - hash: ${slice.slice.hash}`)
      slice.status = BlockchainStatus.TX_FAILED;
    } else {
      slice.isExecuted = true;
      this.logger.verbose(`exec-slices: exec slice - height: ${slice.slice.blockHeight} - hash: ${slice.slice.hash.substring(0, 10)}...`)
    }
    await this.updateSlice(slice);
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

  async populateSliceInfo(blockTree: BlockTree, hash: string) {
    const slice = await this.SliceRepository.findByHash(hash);
    if (slice) {
      const sliceInfo: Slices = {
        slice: new Slice(slice.slice),
        status: slice.status,
        isComplete: slice.isComplete,
        isExecuted: slice.isExecuted,
        blockHash: slice.blockHash,
        outputs: slice.outputs,
      }
      blockTree.setSliceInfo(sliceInfo);

      for (let j = 0; j < slice.slice.transactions.length; j++) {
        const txHash = slice.slice.transactions[j];
        await this.transactionsProvider.populateTxInfo(blockTree, txHash);
      }
      return true;
    }
    return false;
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

  async getBestSlice(blockTree: BlockTree, currentBlock: Block) {
    let needFrom = '';
    const lastBlockInfo = blockTree.getBlockInfo(currentBlock.lastHash);
    if (lastBlockInfo) {
      needFrom = lastBlockInfo.block.from;
    } else {
      needFrom = currentBlock.from;
    }

    const slices = blockTree.sliceInfoList.filter(info => info.isExecuted === true && info.status === BlockchainStatus.TX_MEMPOOL && info.slice.blockHeight === currentBlock.height + 1);
    let bestSlice: Slices | null = null;
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      if (slice.slice.from === needFrom) {
        if (slice.slice.end) {
          return slice;
        }
        if (bestSlice === null ||
          slice.slice.transactions.length > bestSlice.slice.transactions.length) {
          bestSlice = slice;
        }
      }
    }
    return bestSlice;
  }
}
