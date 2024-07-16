import BigNumber from "bignumber.js";
import { Block, BywiseHelper, Slice, BlockPack } from '@bywise/web3';
import { RoutingKeys } from "../datasource/message-queue";
import { Blocks, Slices } from "../models";
import { ApplicationContext, BlockchainStatus, ZERO_HASH } from '../types';
import { MinnerProvider } from './minner.service';
import { SlicesProvider } from "./slices.service";
import { TransactionsProvider } from "./transactions.service";

export class BlocksProvider {

  private applicationContext;
  private mq;
  private minnerProvider;
  private slicesProvider;
  private transactionsProvider;
  private BlockRepository;
  private SliceRepository;
  private VotesRepository;
  private TransactionRepository;

  constructor(applicationContext: ApplicationContext, slicesProvider: SlicesProvider, transactionsProvider: TransactionsProvider) {
    this.applicationContext = applicationContext;
    this.mq = applicationContext.mq;
    this.minnerProvider = new MinnerProvider();
    this.slicesProvider = slicesProvider;
    this.transactionsProvider = transactionsProvider;
    this.BlockRepository = applicationContext.database.BlockRepository;
    this.SliceRepository = applicationContext.database.SliceRepository;
    this.VotesRepository = applicationContext.database.VotesRepository;
    this.TransactionRepository = applicationContext.database.TransactionRepository;
  }

  async getBlockInfo(hash: string): Promise<Blocks> {
    let blockInfo = await this.BlockRepository.findByHash(hash);
    if (!blockInfo) throw new Error(`block not found ${hash}`);
    return blockInfo;
  }

  async saveNewBlock(block: Block): Promise<Blocks> {
    let bBlock = await this.BlockRepository.findByHash(block.hash);
    if (!bBlock) {
      block.isValid();
      if(block.height == 0) throw new Error("Block invalid height zero");

      bBlock = {
        block: block,
        status: BlockchainStatus.TX_MEMPOOL,
        attempts: 0,
        distance: '',
      }
      await this.BlockRepository.save(bBlock);
      this.mq.send(RoutingKeys.new_block, block);
    }
    return bBlock;
  }

  calcBlockModule = (lastBlock: Block, newBlock: Block, lastBlockDistance: string): string => {
    if (lastBlock.hash !== newBlock.lastHash) throw new Error(`calcBlockModule - invalid hash`);
    const mod = this.minnerProvider.calcModule(
      lastBlock.hash.substring(24).toLowerCase(),
      BywiseHelper.decodeBWSAddress(newBlock.from).ethAddress.substring(2).toLowerCase()
    );
    if (!lastBlockDistance) {
      return mod.toString(16);
    } else {
      return mod.plus(new BigNumber(lastBlockDistance, 16)).toString(16);
    }
  }

  public async updateBlock(infoBlock: Blocks) {
    await this.BlockRepository.save(infoBlock);
  }

  async syncBlocks(chain: string) {
    let blockInfoList = await this.BlockRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);

    for (let i = 0; i < blockInfoList.length; i++) {
      const blockInfo = blockInfoList[i];

      await this.syncBlockByHash(blockInfo);
    }
    return blockInfoList.length > 0;
  }

  async syncBlockByHash(blockInfo: Blocks): Promise<boolean> {
    let isComplete = true;

    if (blockInfo.block.lastHash !== ZERO_HASH) {
      const lastBlock = await this.BlockRepository.findByHash(blockInfo.block.lastHash);
      if (!lastBlock) {
        isComplete = false;
        await this.mq.send(RoutingKeys.find_slice, blockInfo.block.lastHash);
      } else if (lastBlock.status == BlockchainStatus.TX_FAILED) {
        lastBlock.status = BlockchainStatus.TX_FAILED;
        this.applicationContext.logger.error(`sync-blocks: Last block is failed - block.hash: ${blockInfo.block.hash}`);
        await this.updateBlock(lastBlock);
        return false;
      } else if (lastBlock.status == BlockchainStatus.TX_MEMPOOL) {
        return false; // wait
      }
    }
    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];

      const sliceInfo = await this.SliceRepository.findByHash(sliceHash);
      if (!sliceInfo) {
        isComplete = false;
        await this.mq.send(RoutingKeys.find_slice, sliceHash);
      } else {
        if (sliceInfo.status == BlockchainStatus.TX_FAILED) {
          blockInfo.status = BlockchainStatus.TX_FAILED;
          this.applicationContext.logger.error(`Last block is failed - block.hash: ${blockInfo.block.hash}`);
          await this.updateBlock(blockInfo);
          return false;
        }
      }
    }

    if (!isComplete) {
      blockInfo.attempts++;
      if (blockInfo.attempts > 100) {
        this.applicationContext.logger.error(`sync-slices: Not found some transactions - block.hash: ${blockInfo.block.hash}`);
        blockInfo.status = BlockchainStatus.TX_FAILED;
      }
    } else {
      this.applicationContext.logger.info(`sync-blocks: height: ${blockInfo.block.height} - hash: ${blockInfo.block.hash.substring(0, 10)}...`)
      blockInfo.status = BlockchainStatus.TX_COMPLETE;
      blockInfo.attempts = 0;
    }
    await this.updateBlock(blockInfo);
    return isComplete;
  }

  async processVotes(chain: string) {
    const unprocessedVotes = await this.VotesRepository.findByChainAndProcessed(chain, false);
    for (let i = 0; i < unprocessedVotes.length; i++) {
      const unprocessedVote = unprocessedVotes[i];
      let block = await this.BlockRepository.findByHash(unprocessedVote.blockHash);
      if (block) {
        unprocessedVote.lastHash = block.block.lastHash;
        unprocessedVote.processed = true;
        if (unprocessedVote.valid) {
          const userVotes = await this.VotesRepository.findByChainAndHeightAndFrom(chain, unprocessedVote.height, unprocessedVote.from);
          if (userVotes.length === 1) {
            if (!unprocessedVote.add) {
              unprocessedVote.add = true;
              this.applicationContext.logger.verbose(`compute vote in ${unprocessedVote.height} - hash: ${unprocessedVote.blockHash.substring(0, 10)}... - from: ${unprocessedVote.from.substring(0, 10)}...`);
            }
          } else if (unprocessedVote.add) {
            this.applicationContext.logger.verbose(`remove vote in ${unprocessedVote.height} - hash: ${unprocessedVote.blockHash.substring(0, 10)}... - from: ${unprocessedVote.from.substring(0, 10)}...`);
            unprocessedVote.add = false;
          }
        }
      } else {
        await this.mq.send(RoutingKeys.find_block, unprocessedVote.blockHash);
      }
    }
    await this.VotesRepository.saveMany(unprocessedVotes)
  }

  async executeCompleteBlocks(chain: string) {
    let isExecuted = false;
    let blockInfoList = await this.BlockRepository.findByChainAndStatus(chain, BlockchainStatus.TX_COMPLETE);
    blockInfoList = blockInfoList.sort((b1, b2) => b1.block.created - b2.block.created);

    for (let i = 0; i < blockInfoList.length; i++) {
      const blockInfo = blockInfoList[i];

      let success = await this.executeCompleteBlockByHash(blockInfo);
      if (success) {
        isExecuted = true;
      }
    }
    return isExecuted;
  }

  async executeCompleteBlockByHash(blockInfo: Blocks): Promise<boolean> {
    let lastBlock: Blocks | null = null;
    let expectedFrom = blockInfo.block.from;
    if (blockInfo.block.lastHash !== ZERO_HASH) {
      lastBlock = await this.getBlockInfo(blockInfo.block.lastHash);
      expectedFrom = lastBlock.block.from;
      if (lastBlock.block.lastHash !== ZERO_HASH) {
        const lastlastBlockInfo = await this.getBlockInfo(lastBlock.block.lastHash);
        expectedFrom = lastlastBlockInfo.block.from;
      }

      if (lastBlock.status == BlockchainStatus.TX_FAILED) {
        blockInfo.status = BlockchainStatus.TX_FAILED;
        await this.updateBlock(blockInfo);
        return false;
      } else if (lastBlock.status == BlockchainStatus.TX_MEMPOOL) {
        throw new Error(`error execute slice - last slice status mempool`);
      } else if (lastBlock.status == BlockchainStatus.TX_COMPLETE) {
        return false; // wait execute last block
      }
    }

    const slices = await this.SliceRepository.findByHashs(blockInfo.block.slices);
    for (let j = 0; j < slices.length; j++) {
      const sliceInfo = slices[j];

      if (sliceInfo.status == BlockchainStatus.TX_FAILED) {
        blockInfo.status = BlockchainStatus.TX_FAILED;
        await this.updateBlock(blockInfo);
        return false;
      } else if (sliceInfo.status == BlockchainStatus.TX_COMPLETE) {
        return false; // wait execute slice
      } else if (sliceInfo.status == BlockchainStatus.TX_MEMPOOL) {
        throw new Error(`error execute block - slice status mempool`);
      }

      if (blockInfo.block.height !== sliceInfo.slice.blockHeight) throw new Error(`tryExecBlock - wrong blockHeight ${blockInfo.block.height}/${sliceInfo.slice.blockHeight}`);
      if (expectedFrom !== sliceInfo.slice.from) throw new Error(`tryExecBlock - slice invalid from`);
    }
    if (!lastBlock) {
      blockInfo.distance = '0';
    } else {
      blockInfo.distance = this.calcBlockModule(lastBlock.block, blockInfo.block, lastBlock.distance);
    }
    blockInfo.status = BlockchainStatus.TX_CONFIRMED;
    this.applicationContext.logger.info(`exec block: height: ${blockInfo.block.height} - hash: ${blockInfo.block.hash.substring(0, 10)}...`)

    await this.updateBlock(blockInfo);
    return true;
  }

  async selectUndoMiningBlock(blockInfo: Blocks) {
    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];
      const sliceInfo = await this.slicesProvider.getSliceInfo(sliceHash);
      sliceInfo.status = BlockchainStatus.TX_CONFIRMED;
      sliceInfo.blockHash = '';
      await this.slicesProvider.updateSlice(sliceInfo);
    }
    blockInfo.status = BlockchainStatus.TX_MEMPOOL;
    await this.updateBlock(blockInfo);
  }

  async selectMinedBlock(chain: string, hash: string) {
    if (hash === ZERO_HASH) {
      return;
    }
    const blockInfo = await this.getBlockInfo(hash);
    if (blockInfo.status === BlockchainStatus.TX_MINED) {
      return;
    }
    if (blockInfo.status !== BlockchainStatus.TX_CONFIRMED) throw new Error(`block not executed`);

    let lastMinnedBlock = await this.BlockRepository.findByChainAndStatusAndHeight(chain, BlockchainStatus.TX_MINED, blockInfo.block.height);
    if (lastMinnedBlock.length > 0) {
      await this.selectUndoMiningBlock(lastMinnedBlock[0]);
    }
    await this.selectMinedBlock(chain, blockInfo.block.lastHash);

    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];
      const sliceInfo = await this.slicesProvider.getSliceInfo(sliceHash);
      sliceInfo.status = BlockchainStatus.TX_MINED;
      sliceInfo.blockHash = blockInfo.block.hash;
      await this.slicesProvider.updateSlice(sliceInfo);
    }
    blockInfo.status = BlockchainStatus.TX_MINED;
    await this.updateBlock(blockInfo);
  }

  async setNewZeroBlock(blockPack: BlockPack): Promise<void> {
    const foundBlocks = await this.BlockRepository.findByChainAndHeight(blockPack.block.chain, 0);
    if (foundBlocks.length > 0) {
      throw new Error(`conflict zero block`);
    }

    if (blockPack.block.height !== 0) throw new Error(`expected height = 0`);
    if (blockPack.block.lastHash !== ZERO_HASH) throw new Error(`invalid lastHash ${blockPack.block.lastHash}`);
    this.applicationContext.logger.verbose(`select new zero block`);

    const newBlock: Blocks = {
      block: blockPack.block,
      status: BlockchainStatus.TX_MEMPOOL,
      attempts: 0,
      distance: '',
    }
    await this.BlockRepository.save(newBlock);

    await this.setNewBlockPack(newBlock.block.chain, blockPack);
  }

  async setNewBlockPack(chain: string, blockPack: BlockPack): Promise<void> {
    for (let i = 0; i < blockPack.txs.length; i++) {
      const tx = blockPack.txs[i];
      this.TransactionRepository.addMempool(tx);
    }

    let blockInfo = await this.saveNewBlock(blockPack.block);

    for (let i = 0; i < blockPack.slices.length; i++) {
      const slice = blockPack.slices[i];
      let sliceInfo = await this.slicesProvider.saveNewSlice(slice);
      await this.slicesProvider.syncSliceByHash(sliceInfo);
      await this.slicesProvider.executeCompleteSlice(sliceInfo);
      if (sliceInfo.status !== BlockchainStatus.TX_CONFIRMED) throw new Error(`slice not executed ${slice.hash}`);
    }

    await this.processVotes(chain);
    await this.syncBlockByHash(blockInfo);
    await this.executeCompleteBlockByHash(blockInfo);
    await this.selectMinedBlock(chain, blockPack.block.hash);
  }

  async getMempool(chain: string) {
    return await this.BlockRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);
  }

  async getBlockPack(chain: string, height: number) {
    const blocks = await this.BlockRepository.findByChainAndHeight(chain, height);
    let blockInfo: Blocks | undefined;
    blocks.forEach(b => {
      if (b.status === BlockchainStatus.TX_MINED) {
        blockInfo = b;
      }
    })
    if (!blockInfo) return null;
    const blockPack: BlockPack = {
      block: blockInfo.block,
      slices: [],
      txs: [],
    }
    const slices = await this.slicesProvider.getSlices(blockInfo.block.slices);
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];

      blockPack.slices.push(slice.slice);
      const transactions = await this.transactionsProvider.getTransactions(slice.slice.transactions);

      for (let j = 0; j < transactions.length; j++) {
        const tx = transactions[j];
        blockPack.txs.push(tx);
      }
    }
    return blockPack;
  }

  async getLastMinedBlock(chain: string) {
    const blocks = await this.BlockRepository.findBlocksLastsByStatus(chain, BlockchainStatus.TX_MINED, 1, 0, "desc");
    if (blocks.length == 0) throw new Error("last minned block not found");
    return blocks[0];
  }

  async getLastSlicesBlock(chain: string) {
    const blocks = await this.BlockRepository.findBlocksLastsByStatus(chain, BlockchainStatus.TX_MINED, 2, 0, "desc");
    if (blocks.length == 0) throw new Error("last minned block not found");
    const currentBlock = blocks[0];

    let from = currentBlock.block.from;
    if (blocks.length == 2) {
      from = blocks[1].block.from;
    }
    return await this.slicesProvider.getByHeight(chain, from, currentBlock.block.height + 1);
  }

  async getLastContext(chain: string) {
    const blocks = await this.BlockRepository.findBlocksLastsByStatus(chain, BlockchainStatus.TX_MINED, 2, 0, "desc");
    if (blocks.length == 0) throw new Error("last minned block not found");
    let block = blocks[0].block;

    let from = block.from;
    if (blocks.length == 2) {
      from = blocks[1].block.from;
    }

    const slices = await this.slicesProvider.getByHeight(chain, from, block.height + 1);
    if (slices.length > 0) {
      return slices[slices.length - 1];
    }

    let lastSlice: Slices | null = null;
    while (!lastSlice) {
      if (block.slices.length > 0) {
        lastSlice = await this.slicesProvider.getSliceInfo(block.slices[block.slices.length - 1]);
      } else if (block.lastHash == ZERO_HASH) {
        throw new Error(`Invalid zero block slices`);
      } else {
        block = (await this.getBlockInfo(block.lastHash)).block;
      }
    }
    if (!lastSlice) throw new Error(`Invalid current slice`);
    return lastSlice;
  }
}
