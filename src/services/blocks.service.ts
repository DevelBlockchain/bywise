import BigNumber from "bignumber.js";
import { Block, BywiseHelper, Slice, Tx, BlockPack } from '@bywise/web3';
import { ApplicationContext } from '../types/task.type';
import { BlockchainStatus } from '../types';
import { MinnerProvider } from './minner.service';
import { BlockTree, CompiledContext } from '../types/environment.types';
import { EnvironmentProvider } from "./environment.service";
import { RoutingKeys } from "../datasource/message-queue";
import { Blocks } from "../models";
import { SlicesProvider } from "./slices.service";
import { TransactionsProvider } from "./transactions.service";

export class BlocksProvider {

  private applicationContext;
  private mq;
  private environmentProvider;
  private minnerProvider;
  private slicesProvider;
  private transactionsProvider;
  private BlockRepository;
  private SliceRepository;
  private VotesRepository;

  constructor(applicationContext: ApplicationContext) {
    this.applicationContext = applicationContext;
    this.mq = applicationContext.mq;
    this.environmentProvider = new EnvironmentProvider(applicationContext);
    this.minnerProvider = new MinnerProvider(applicationContext);
    this.slicesProvider = new SlicesProvider(applicationContext);
    this.transactionsProvider = new TransactionsProvider(applicationContext);
    this.BlockRepository = applicationContext.database.BlockRepository;
    this.SliceRepository = applicationContext.database.SliceRepository;
    this.VotesRepository = applicationContext.database.VotesRepository;
  }

  async getBlockInfo(hash: string): Promise<Blocks> {
    let foundBlock = await this.BlockRepository.findByHash(hash);
    if (!foundBlock) throw new Error(`block not found ${hash}`);
    const info: Blocks = {
      block: new Block(foundBlock.block),
      status: foundBlock.status,
      countTrys: foundBlock.countTrys,
      isComplete: foundBlock.isComplete,
      isExecuted: foundBlock.isExecuted,
      isImmutable: foundBlock.isImmutable,
      distance: foundBlock.distance,
    }
    return info;
  }

  async saveNewBlock(block: Block): Promise<Blocks> {
    let bBlock = await this.BlockRepository.findByHash(block.hash);
    if (!bBlock) {
      block.isValid();

      bBlock = {
        block: block,
        status: BlockchainStatus.TX_MEMPOOL,
        countTrys: 0,
        isComplete: false,
        isExecuted: false,
        isImmutable: false,
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
    const bblock = await this.BlockRepository.findByHash(infoBlock.block.hash);
    if (bblock) {
      bblock.status = infoBlock.status;
      bblock.distance = infoBlock.distance;
      bblock.countTrys = infoBlock.countTrys;
      bblock.isComplete = infoBlock.isComplete;
      bblock.isExecuted = infoBlock.isExecuted;
      bblock.isImmutable = infoBlock.isImmutable;
      await this.BlockRepository.save(bblock);
    }
  }

  async syncBlocks(blockTree: BlockTree) {
    let blockInfoList = await this.BlockRepository.findByChainAndStatus(blockTree.chain, BlockchainStatus.TX_MEMPOOL);
    blockInfoList = blockInfoList.filter(info => info.isComplete === false);

    for (let i = 0; i < blockInfoList.length; i++) {
      const blockInfo = blockInfoList[i];

      await this.syncBlockByHash(blockTree, blockInfo.block.hash);
    }
  }

  async syncBlockByHash(blockTree: BlockTree, hash: string) {
    const blockInfo = await this.getBlockInfo(hash);

    let isComplete = true;
    const lastBlockInfo = await this.BlockRepository.findByHash(blockInfo.block.lastHash);

    if (!lastBlockInfo) {
      if (blockInfo.block.lastHash !== BlockTree.ZERO_HASH) {
        isComplete = false;
        await this.mq.send(RoutingKeys.find_block, blockInfo.block.lastHash);
      }
    } else {
      if(!lastBlockInfo.isComplete) {
        isComplete = false;
      }
    }
    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];

      const sliceInfo = await this.SliceRepository.findByHash(sliceHash);
      if (!sliceInfo) {
        isComplete = false;
        await this.mq.send(RoutingKeys.find_slice, sliceHash);
      } else {
        if (!sliceInfo.isComplete) {
          isComplete = false;
        }
      }
    }

    if (!isComplete) {
      blockInfo.countTrys++;
      if (blockInfo.countTrys > 100) {
        this.applicationContext.logger.error(`Block reached max countTrys - ${blockInfo.block.hash}`)
        blockInfo.status = BlockchainStatus.TX_FAILED;
      }
    } else {
      this.applicationContext.logger.verbose(`sync-blocks: complete - height: ${blockInfo.block.height} - hash: ${blockInfo.block.hash.substring(0, 10)}...`)
      blockInfo.isComplete = true;
      blockTree.addBlock(blockInfo.block);
    }
    await this.updateBlock(blockInfo);
  }

  async processVotes(blockTree: BlockTree) {
    const unprocessedVotes = await this.VotesRepository.findByChainAndProcessed(blockTree.chain, false);
    for (let i = 0; i < unprocessedVotes.length; i++) {
      const unprocessedVote = unprocessedVotes[i];
      let block = await this.BlockRepository.findByHash(unprocessedVote.blockHash);
      if (block) {
        unprocessedVote.lastHash = block.block.lastHash;
        unprocessedVote.processed = true;
        if (unprocessedVote.valid) {
          const userVotes = await this.VotesRepository.findByChainAndHeightAndFrom(blockTree.chain, unprocessedVote.height, unprocessedVote.from);
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

  async executeCompleteBlocks(blockTree: BlockTree) {
    let blockInfoList = await this.BlockRepository.findByChainAndStatus(blockTree.chain, BlockchainStatus.TX_MEMPOOL);
    blockInfoList = blockInfoList.filter(info => info.isComplete === true && info.isExecuted === false);
    blockInfoList = blockInfoList.sort((b1, b2) => b1.block.created - b2.block.created);

    for (let i = 0; i < blockInfoList.length; i++) {
      const blockInfo = blockInfoList[i];

      const lastHash = blockInfo.block.lastHash;
      let lastBlockIsExecuted = false;
      if (lastHash == BlockTree.ZERO_HASH) {
        lastBlockIsExecuted = true;
      } else {
        const lastBlock = await this.getBlockInfo(lastHash);
        if (lastBlock.isExecuted) {
          lastBlockIsExecuted = true;
        }
      }
      if (lastBlockIsExecuted) {
        await this.executeCompleteBlockByHash(blockTree, blockInfo.block.hash);
      }
    }
  }

  async executeCompleteBlockByHash(blockTree: BlockTree, hash: string) {
    const blockInfo = await this.getBlockInfo(hash);

    let lastBlockInfo = null;
    let expectedFrom = blockInfo.block.from;
    if (blockInfo.block.lastHash !== BlockTree.ZERO_HASH) {
      lastBlockInfo = await this.getBlockInfo(blockInfo.block.lastHash);
      expectedFrom = lastBlockInfo.block.from;
      if (lastBlockInfo.block.lastHash !== BlockTree.ZERO_HASH) {
        const lastlastBlockInfo = await this.getBlockInfo(lastBlockInfo.block.lastHash);
        expectedFrom = lastlastBlockInfo.block.from;
      }
    }
    if (blockInfo.block.lastHash === BlockTree.ZERO_HASH || lastBlockInfo && lastBlockInfo.isExecuted) {
      try {
        let isExecuted = true;
        for (let j = 0; j < blockInfo.block.slices.length; j++) {
          const sliceHash = blockInfo.block.slices[j];
          const sliceInfo = await this.slicesProvider.getSliceInfo(sliceHash);

          if (!sliceInfo.isExecuted) {
            isExecuted = false;
          } else {
            if (blockInfo.block.height !== sliceInfo.slice.blockHeight) throw new Error(`tryExecBlock - wrong blockHeight ${blockInfo.block.height}/${sliceInfo.slice.blockHeight}`);
            if (expectedFrom !== sliceInfo.slice.from) throw new Error(`tryExecBlock - slice invalid from`);
          }
        }
        if (isExecuted) {
          for (let j = 0; j < blockInfo.block.slices.length; j++) {
            const sliceHash = blockInfo.block.slices[j];
            const sliceInfo = await this.slicesProvider.getSliceInfo(sliceHash);
  
            await this.environmentProvider.mergeContext(blockTree.chain, sliceInfo.slice.hash, blockInfo.block.hash);
          }
          if (!lastBlockInfo) {
            blockInfo.distance = '0';
          } else {
            blockInfo.distance = this.calcBlockModule(lastBlockInfo.block, blockInfo.block, lastBlockInfo.distance);
          }
          blockInfo.isExecuted = true;
          this.applicationContext.logger.verbose(`sync-blocks: exec block - height: ${blockInfo.block.height} - hash: ${blockInfo.block.hash.substring(0, 10)}...`)
        }
      } catch (err: any) {
        blockInfo.isExecuted = false;
        this.applicationContext.logger.error(`Error: ${err.message}`, err);
        blockInfo.status = BlockchainStatus.TX_FAILED;
      }
      await this.updateBlock(blockInfo);
    }
  }

  async selectUndoMiningBlock(blockInfo: Blocks) {
    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];
      const sliceInfo = await this.slicesProvider.getSliceInfo(sliceHash);

      for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
        const txHash = sliceInfo.slice.transactions[z];
        const txInfo = await this.transactionsProvider.getTxInfo(txHash);

        txInfo.status = BlockchainStatus.TX_CONFIRMED;
        txInfo.blockHash = '';
        txInfo.slicesHash = '';
        await this.transactionsProvider.updateTransaction(txInfo);
      }
      sliceInfo.status = BlockchainStatus.TX_CONFIRMED;
      sliceInfo.blockHash = '';
      await this.slicesProvider.updateSlice(sliceInfo);
    }
    blockInfo.status = BlockchainStatus.TX_MEMPOOL;
    await this.updateBlock(blockInfo);
  }

  async selectMinedBlock(blockTree: BlockTree, hash: string) {
    if (hash === BlockTree.ZERO_HASH) {
      return;
    }
    const blockInfo = await this.getBlockInfo(hash);
    if (!blockInfo.isExecuted) throw new Error(`block not executed`);
    if (blockInfo.status === BlockchainStatus.TX_MINED) {
      blockTree.setMinnedBlock(blockInfo.block);
      return;
    }

    let lastMinnedBlock = blockTree.minnedBlockList.get(blockInfo.block.height);
    if(lastMinnedBlock) {
      const lastMinnedBlockInfo = await this.getBlockInfo(lastMinnedBlock.hash);
      await this.selectUndoMiningBlock(lastMinnedBlockInfo);
    }
    await this.selectMinedBlock(blockTree, blockInfo.block.lastHash);

    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];
      const sliceInfo = await this.slicesProvider.getSliceInfo(sliceHash);

      let countOutputTx = 0;
      for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
        const txHash = sliceInfo.slice.transactions[z];
        let txInfo = await this.transactionsProvider.getTxInfo(txHash);

        txInfo.status = BlockchainStatus.TX_MINED;
        txInfo.slicesHash = sliceInfo.slice.hash;
        txInfo.blockHash = blockInfo.block.hash;
        txInfo.output = sliceInfo.outputs[countOutputTx];
        if (!txInfo.output) throw new Error('selectMinedBlock - last tx output not found');
        countOutputTx++;
        await this.transactionsProvider.updateTransaction(txInfo);
      }
      sliceInfo.status = BlockchainStatus.TX_MINED;
      sliceInfo.blockHash = blockInfo.block.hash;
      await this.slicesProvider.updateSlice(sliceInfo);
    }
    blockInfo.status = BlockchainStatus.TX_MINED;
    await this.updateBlock(blockInfo);
    blockTree.setMinnedBlock(blockInfo.block);
  }

  async setNewZeroBlock(blockPack: BlockPack): Promise<BlockTree> {
    const foundBlocks = await this.BlockRepository.findByChainAndHeight(blockPack.block.chain, 0);
    if (foundBlocks.length > 0) {
      throw new Error(`conflict zero block`);
    }

    if (blockPack.block.height !== 0) throw new Error(`expected height = 0`);
    if (blockPack.block.lastHash !== BlockTree.ZERO_HASH) throw new Error(`invalid lastHash ${blockPack.block.lastHash}`);
    this.applicationContext.logger.verbose(`select new zero block`)

    const newBlock: Blocks = {
      block: blockPack.block,
      status: BlockchainStatus.TX_MEMPOOL,
      countTrys: 0,
      isComplete: false,
      isExecuted: false,
      isImmutable: false,
      distance: '',
    }
    await this.BlockRepository.save(newBlock);

    const blockTree = new BlockTree(blockPack.block.chain);
    await this.setNewBlockPack(blockTree, blockPack);
    await this.mq.send(RoutingKeys.selected_new_block, blockPack.block.chain);

    return blockTree;
  }

  async setNewBlockPack(blockTree: BlockTree, blockPack: BlockPack): Promise<void> {
    for (let i = 0; i < blockPack.txs.length; i++) {
      const tx = blockPack.txs[i];
      await this.transactionsProvider.saveNewTransaction(tx);
    }

    await this.saveNewBlock(blockPack.block);
    blockTree.addBlock(blockPack.block);

    let lastContextHash = blockPack.block.lastHash;
    for (let i = 0; i < blockPack.slices.length; i++) {
      const slice = blockPack.slices[i];
      let sliceInfo = await this.slicesProvider.saveNewSlice(slice);
      sliceInfo = await this.slicesProvider.syncSliceByHash(blockTree, slice.hash);
      await this.slicesProvider.executeCompleteSlice(blockTree, lastContextHash, sliceInfo);

      await this.environmentProvider.mergeContext(blockTree.chain, slice.hash, CompiledContext.SLICE_MINT_CONTEXT_HASH);
      await this.environmentProvider.setLastConsolidatedContextHash(blockTree, slice.hash, CompiledContext.SLICE_MINT_CONTEXT_HASH);
      lastContextHash = slice.hash;
    }

    await this.processVotes(blockTree);
    await this.syncBlockByHash(blockTree, blockPack.block.hash);
    await this.executeCompleteBlockByHash(blockTree, blockPack.block.hash);
    await this.selectMinedBlock(blockTree, blockPack.block.hash);
    await this.environmentProvider.setLastConsolidatedContextHash(blockTree, blockPack.block.hash, CompiledContext.SLICE_MINT_CONTEXT_HASH);
  }

  async getBlockTree(chain: string) {
    const blockTree = new BlockTree(chain);

    const firstBlock = (await this.BlockRepository.findByChainAndHeight(chain, 0))[0];
    if (!firstBlock) throw new Error(`get first imutable block of ${chain} not found`);
    if (firstBlock.block.lastHash !== BlockTree.ZERO_HASH) throw new Error(`invalid zero block lastHash`);
    let blockHeight = firstBlock.block.height;

    blockTree.addBlock(firstBlock.block);
    blockTree.setMinnedBlock(firstBlock.block);
    let slices = await this.SliceRepository.findByChainAndBlockHeight(chain, 0);
    slices = slices.filter(info => info.isComplete === true);
    slices.map(sliceInfo => blockTree.addSlice(sliceInfo.slice));

    while (true) {
      blockHeight += 1;

      slices = await this.SliceRepository.findByChainAndBlockHeight(chain, blockHeight);
      slices = slices.filter(info => info.isComplete === true);
      slices.map(sliceInfo => blockTree.addSlice(sliceInfo.slice));

      const blocks = await this.BlockRepository.findByChainAndHeight(chain, blockHeight);
      for (let i = 0; i < blocks.length; i++) {
        const blockInfo = blocks[i];

        if(blockInfo.isComplete) {
          blockTree.addBlock(blockInfo.block);
          if (blockInfo.status === BlockchainStatus.TX_MINED) {
            blockTree.setMinnedBlock(blockInfo.block);
          }
        }
      }
      if (blocks.length == 0) {
        return blockTree;
      }
    }
  }

  async getMempool(chain: string) {
    return await this.BlockRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);
  }

  async getBlockPack(chain: string, height: number) {
    const blocks = await this.BlockRepository.findByChainAndHeight(chain, height);
    let block: Blocks | undefined;
    blocks.forEach(b => {
      if (b.status === BlockchainStatus.TX_MINED) {
        block = b;
      }
    })
    if (!block) return null;
    const blockPack: BlockPack = {
      block: new Block(block.block),
      slices: [],
      txs: [],
    }
    const slices = await this.slicesProvider.getSlices(block.block.slices);
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];

      blockPack.slices.push(new Slice(slice.slice));
      const transactions = await this.transactionsProvider.getTransactions(slice.slice.transactions);

      for (let j = 0; j < transactions.length; j++) {
        const btx = transactions[j];
        blockPack.txs.push(new Tx(btx.tx));
      }
    }
    return blockPack;
  }
}
