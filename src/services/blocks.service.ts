import BigNumber from "bignumber.js";
import { Block, BywiseHelper, Slice, Tx, BlockPack } from '@bywise/web3';
import { ApplicationContext } from '../types/task.type';
import { BlockchainStatus, SimulateDTO } from '../types';
import { MinnerProvider } from './minner.service';
import { BlockTree } from '../types/environment.types';
import { VirtualMachineProvider } from "./virtual-machine.service";
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
  private virtualMachineProvider;
  private slicesProvider;
  private transactionsProvider;
  private BlockRepository;
  private VotesRepository;

  constructor(applicationContext: ApplicationContext) {
    this.applicationContext = applicationContext;
    this.mq = applicationContext.mq;
    this.environmentProvider = new EnvironmentProvider(applicationContext);
    this.minnerProvider = new MinnerProvider(applicationContext);
    this.virtualMachineProvider = new VirtualMachineProvider(applicationContext);
    this.slicesProvider = new SlicesProvider(applicationContext);
    this.transactionsProvider = new TransactionsProvider(applicationContext);
    this.BlockRepository = applicationContext.database.BlockRepository;
    this.VotesRepository = applicationContext.database.VotesRepository;
  }

  async populateBlockInfo(blockTree: BlockTree, hash: string) {
    let foundBlock = await this.BlockRepository.findByHash(hash);
    if (foundBlock) {
      const info: Blocks = {
        block: new Block(foundBlock.block),
        status: foundBlock.status,
        countTrys: foundBlock.countTrys,
        isComplete: foundBlock.isComplete,
        isExecuted: foundBlock.isExecuted,
        isImmutable: foundBlock.isImmutable,
        distance: foundBlock.distance,
      }
      if (info.isImmutable) {
        blockTree.addHash(BlockTree.ZERO_HASH, info.block.hash);
      } else {
        blockTree.addHash(info.block.lastHash, info.block.hash);
      }
      blockTree.setBlockInfo(info);
      for (let i = 0; i < info.block.slices.length; i++) {
        const sliceHash = info.block.slices[i];
        await this.slicesProvider.populateSliceInfo(blockTree, sliceHash);
      }
      return true;
    }
    return false;
  }

  async saveNewBlock(block: Block) {
    if (block.height === 0) return null;

    let bBlock = await this.BlockRepository.findByHash(block.hash);
    if (!bBlock) {
      block.isValid();

      const newBlock: Blocks = {
        block: block,
        status: BlockchainStatus.TX_MEMPOOL,
        countTrys: 0,
        isComplete: false,
        isExecuted: false,
        isImmutable: false,
        distance: '',
      }
      await this.BlockRepository.save(newBlock);
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
    const blockInfoList = blockTree.blockInfoList.filter(info => info.isComplete === false && info.status === BlockchainStatus.TX_MEMPOOL);

    for (let i = 0; i < blockInfoList.length; i++) {
      const blockInfo = blockInfoList[i];

      let isComplete = true;
      const lastBlockInfo = blockTree.getBlockInfo(blockInfo.block.lastHash);

      if (!lastBlockInfo && blockInfo.block.lastHash !== BlockTree.ZERO_HASH) {
        isComplete = false;
        let found = await this.populateBlockInfo(blockTree, blockInfo.block.lastHash);
        if (!found) {
          await this.mq.send(RoutingKeys.find_block, blockInfo.block.lastHash);
        }
      }
      for (let j = 0; j < blockInfo.block.slices.length; j++) {
        const sliceHash = blockInfo.block.slices[j];

        const sliceInfo = blockTree.getSliceInfo(sliceHash);
        if (!sliceInfo) {
          isComplete = false;
          let found = await this.slicesProvider.populateSliceInfo(blockTree, sliceHash);
          if (!found) {
            await this.mq.send(RoutingKeys.find_slice, sliceHash);
          }
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
        if (blockInfo.block.lastHash === BlockTree.ZERO_HASH) {
          blockInfo.distance = '0';
        } else {
          if (!lastBlockInfo) throw new Error('syncBlocks - lastBlock not found');
          blockInfo.distance = this.calcBlockModule(lastBlockInfo.block, blockInfo.block, lastBlockInfo.distance);
        }
        this.applicationContext.logger.verbose(`sync-blocks: complete - height: ${blockInfo.block.height} - hash: ${blockInfo.block.hash.substring(0, 10)}...`)
        blockInfo.isComplete = true;
      }
      await this.updateBlock(blockInfo);
    }
  }

  async processVotes(blockTree: BlockTree) {
    const unprocessedVotes = await this.VotesRepository.findByChainAndProcessed(blockTree.chain, false);
    for (let i = 0; i < unprocessedVotes.length; i++) {
      const unprocessedVote = unprocessedVotes[i];
      let block = blockTree.getBlockInfo(unprocessedVote.blockHash);
      if (!block) {
        await this.populateBlockInfo(blockTree, unprocessedVote.blockHash);
        block = blockTree.getBlockInfo(unprocessedVote.blockHash);
      }
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
    const blockInfoList = blockTree.blockInfoList.filter(info => info.isComplete === true && info.isExecuted === false && info.status === BlockchainStatus.TX_MEMPOOL);

    for (let i = 0; i < blockInfoList.length; i++) {
      const blockInfo = blockInfoList[i];
      let lastBlockInfo = blockTree.getBlockInfo(blockInfo.block.lastHash);
      if (blockInfo.block.lastHash !== BlockTree.ZERO_HASH) {
        if (!lastBlockInfo) {
          this.populateBlockInfo(blockTree, blockInfo.block.lastHash);
          lastBlockInfo = blockTree.getBlockInfo(blockInfo.block.lastHash);
          if (!lastBlockInfo) {
            await this.populateBlockInfo(blockTree, blockInfo.block.lastHash);
            lastBlockInfo = blockTree.getBlockInfo(blockInfo.block.lastHash);
            if (!lastBlockInfo) throw new Error('tryExecBlock - last block not found');
          }
        }
      }
      if (blockInfo.block.lastHash === BlockTree.ZERO_HASH || lastBlockInfo && lastBlockInfo.isExecuted) {
        try {
          const ctx = new SimulateDTO(blockTree, blockInfo.block);
          let isExecuted = true;
          for (let j = 0; j < blockInfo.block.slices.length; j++) {
            const sliceHash = blockInfo.block.slices[j];
            const sliceInfo = blockTree.getSliceInfo(sliceHash);
            if (!sliceInfo) throw new Error('tryExecBlock - last slice not found');

            if (!sliceInfo.isExecuted) {
              isExecuted = false;
            } else {
              if (blockInfo.block.height !== sliceInfo.slice.blockHeight) throw new Error(`tryExecBlock - wrong blockHeight ${blockInfo.block.height}/${sliceInfo.slice.blockHeight}`);
              if (lastBlockInfo) {
                const lastlastBlockInfo = blockTree.getBlockInfo(lastBlockInfo.block.lastHash);
                if (lastlastBlockInfo) {
                  if (lastlastBlockInfo.block.from !== sliceInfo.slice.from) throw new Error(`tryExecBlock - slice invalid from`);
                } else {
                  if (lastBlockInfo.block.from !== sliceInfo.slice.from) throw new Error(`tryExecBlock - slice invalid from`);
                }
              } else {
                if (blockInfo.block.from !== sliceInfo.slice.from) throw new Error(`tryExecBlock - slice invalid from`);
              }
              for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
                const txHash = sliceInfo.slice.transactions[z];

                const txInfo = blockTree.getTxInfo(txHash);
                if (!txInfo) throw new Error('tryExecBlock - last tx not found');

                try {
                  await this.virtualMachineProvider.executeTransaction(txInfo.tx, sliceInfo.slice, ctx);
                } catch (err: any) {
                  ctx.output.error = err.message;
                  this.applicationContext.logger.error(err.message, err);
                }
                if (ctx.output.error) throw new Error(`tryExecBlock - execute tx error - hash ${txHash}`);
              }
            }
          }
          if (isExecuted) {
            blockInfo.isExecuted = true;
            this.applicationContext.logger.verbose(`sync-blocks: exec block - height: ${blockInfo.block.height} - hash: ${blockInfo.block.hash.substring(0, 10)}...`)
            await this.updateBlock(blockInfo);
          }
        } catch (err: any) {
          blockInfo.isExecuted = false;
          await this.environmentProvider.deleteSimulation(blockTree, blockInfo.block.hash);
          this.applicationContext.logger.error(`Error: ${err.message}`, err);
          blockInfo.status = BlockchainStatus.TX_FAILED;
          await this.updateBlock(blockInfo);
        }
      }
    }
  }

  async selectUndoMiningBlock(blockTree: BlockTree, blockInfo: Blocks) {
    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];
      const sliceInfo = blockTree.getSliceInfo(sliceHash);
      if (!sliceInfo) throw new Error('tryExecBlock - last slice not found');

      for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
        const txHash = sliceInfo.slice.transactions[z];
        const txInfo = blockTree.getTxInfo(txHash);
        if (!txInfo) throw new Error('tryExecBlock - last tx not found');

        txInfo.status = BlockchainStatus.TX_MEMPOOL;
        txInfo.blockHash = '';
        txInfo.slicesHash = '';
        await this.transactionsProvider.updateTransaction(txInfo);
      }
      sliceInfo.status = BlockchainStatus.TX_MEMPOOL;
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
    const blockInfo = blockTree.getBlockInfo(hash);
    if (!blockInfo) throw new Error(`block not found`);
    if (!blockInfo.isExecuted) throw new Error(`block not executed`);
    if (blockInfo.status === BlockchainStatus.TX_MINED) {
      return;
    }
    const minedBlocks = blockTree.blockInfoList.filter(info => info.block.height === blockInfo.block.height && info.status === BlockchainStatus.TX_MINED);
    if (minedBlocks.length > 0) {
      await this.selectUndoMiningBlock(blockTree, minedBlocks[0]);
    }
    await this.selectMinedBlock(blockTree, blockInfo.block.lastHash);

    for (let j = 0; j < blockInfo.block.slices.length; j++) {
      const sliceHash = blockInfo.block.slices[j];
      const sliceInfo = blockTree.getSliceInfo(sliceHash);
      if (!sliceInfo) throw new Error('selectMinedBlock - last slice not found');

      let countOutputTx = 0;
      for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
        const txHash = sliceInfo.slice.transactions[z];
        let txInfo = blockTree.getTxInfo(txHash);
        if (!txInfo) {
          this.transactionsProvider.populateTxInfo(blockTree, txHash);
          txInfo = blockTree.getTxInfo(txHash);
        }
        if (!txInfo) throw new Error('selectMinedBlock - last tx not found');

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

    blockTree.blockTreeLastMinedHash = blockInfo.block.hash;
  }

  async updateConsolidatedBlockTree(blockTree: BlockTree, height: number) {
    let hash = blockTree.blockTreeLastMinedHash;
    const lastBlock = blockTree.getBlockInfo(hash);
    if (!lastBlock) throw new Error(`block not found`);

    if (lastBlock.status === BlockchainStatus.TX_MINED && lastBlock.block.height === 0) {
      await this.environmentProvider.consolideBlock(blockTree, lastBlock.block.hash);
      lastBlock.isImmutable = true;
      await this.updateBlock(lastBlock);
    }

    const oldBlocks = blockTree.blockInfoList.filter(info => info.block.height < lastBlock.block.height - height).sort((a, b) => a.block.height - b.block.height);
    for (let i = 0; i < oldBlocks.length; i++) {
      const oldBlock = oldBlocks[i];

      if (oldBlock.status === BlockchainStatus.TX_MINED) {
        await this.environmentProvider.consolideBlock(blockTree, oldBlock.block.hash);
        oldBlock.isImmutable = true;
        await this.updateBlock(oldBlock);
      }

      for (let j = 0; j < oldBlock.block.slices.length; j++) {
        const sliceHash = oldBlock.block.slices[j];
        const sliceInfo = blockTree.getSliceInfo(sliceHash);
        if (sliceInfo) {
          for (let z = 0; z < sliceInfo.slice.transactions.length; z++) {
            const txHash = sliceInfo.slice.transactions[z];
            const txInfo = blockTree.getTxInfo(txHash);
            if (txInfo) {
              if (txInfo.status !== BlockchainStatus.TX_MINED) {
                txInfo.status = BlockchainStatus.TX_FAILED;
                await this.transactionsProvider.updateTransaction(txInfo);
                blockTree.removeTxInfo(txInfo.tx.hash);
              }
            }
          }
          if (sliceInfo.status !== BlockchainStatus.TX_MINED) {
            sliceInfo.status = BlockchainStatus.TX_FAILED;
            await this.slicesProvider.updateSlice(sliceInfo);
            blockTree.removeSliceInfo(sliceInfo.slice.hash);
          }
        }
      }
      blockTree.removeBlockInfo(oldBlock.block.hash);
    }

    const oldSlices = blockTree.sliceInfoList.filter(info => info.status === BlockchainStatus.TX_MEMPOOL);
    for (let i = 0; i < oldSlices.length; i++) {
      const slice = oldSlices[i];
      if (slice.slice.blockHeight < lastBlock.block.height - height) {
        slice.status = BlockchainStatus.TX_FAILED;
        await this.slicesProvider.updateSlice(slice);
        blockTree.removeSliceInfo(slice.slice.hash);
      }
    }

    const oldTxs = blockTree.txInfoList.filter(info => info.status === BlockchainStatus.TX_FAILED);
    for (let i = 0; i < oldTxs.length; i++) {
      const tx = oldTxs[i];
      blockTree.removeTxInfo(tx.tx.hash);
    }
  }

  async setNewZeroBlock(blockPack: BlockPack): Promise<void> {
    const foundBlocks = await this.BlockRepository.findByChainAndHeight(blockPack.block.chain, 0);
    if (foundBlocks.length > 0) {
      if (foundBlocks[0].block.hash !== blockPack.block.hash) throw new Error(`conflict zero block`);
      return;
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

    await this.populateBlockInfo(blockTree, blockPack.block.hash);
    await this.setNewBlockPack(blockTree, blockPack);
    await this.applicationContext.mq.send(RoutingKeys.selected_new_block, blockPack.block.chain);
  }

  async setNewBlockPack(blockTree: BlockTree, blockPack: BlockPack): Promise<void> {
    blockPack.block.isValid();
    for (let i = 0; i < blockPack.txs.length; i++) {
      const tx = blockPack.txs[i];
      await this.transactionsProvider.saveNewTransaction(tx);
      await this.transactionsProvider.populateTxInfo(blockTree, tx.hash);
    }
    for (let i = 0; i < blockPack.slices.length; i++) {
      const slice = blockPack.slices[i];
      await this.slicesProvider.saveNewSlice(slice);
      await this.slicesProvider.populateSliceInfo(blockTree, slice.hash);
    }

    await this.saveNewBlock(blockPack.block);
    await this.populateBlockInfo(blockTree, blockPack.block.hash);

    await this.slicesProvider.syncSlices(blockTree);
    await this.slicesProvider.executeCompleteSlices(blockTree);
    await this.processVotes(blockTree);
    await this.syncBlocks(blockTree);
    await this.executeCompleteBlocks(blockTree);
    await this.selectMinedBlock(blockTree, blockPack.block.hash);
    await this.updateConsolidatedBlockTree(blockTree, 60);
  }

  async getBlockTree(chain: string) {
    const blockTree = new BlockTree(chain);

    const firstBlock = await this.BlockRepository.findFirstImutableBlockByChain(chain);
    if (firstBlock === null) throw new Error(`get first imutable block of ${chain} not found`);
    blockTree.blockTreeLastMinedHash = firstBlock.block.hash;
    let lastBlockHeight = firstBlock.block.height;

    await this.populateBlockInfo(blockTree, firstBlock.block.hash);

    const lastBlocks = await this.BlockRepository.findByChainAndGreaterHeight(chain, firstBlock.block.height);
    for (let i = 0; i < lastBlocks.length; i++) {
      const bblock = lastBlocks[i];
      await this.populateBlockInfo(blockTree, bblock.block.hash);
      if (bblock.status === BlockchainStatus.TX_MINED && bblock.block.height > lastBlockHeight) {
        blockTree.blockTreeLastMinedHash = bblock.block.hash;
        lastBlockHeight = bblock.block.height;
      }
    }

    const mempoolTxs = await this.transactionsProvider.getMempool(chain);
    for (let i = 0; i < mempoolTxs.length; i++) {
      const btx = mempoolTxs[i];
      await this.transactionsProvider.populateTxInfo(blockTree, btx.tx.hash);
    }

    const mempoolSlices = await this.slicesProvider.getMempool(chain);
    for (let i = 0; i < mempoolSlices.length; i++) {
      const bslice = mempoolSlices[i];
      await this.slicesProvider.populateSliceInfo(blockTree, bslice.slice.hash);
    }

    const mempoolBlocks = await this.getMempool(chain);
    for (let i = 0; i < mempoolBlocks.length; i++) {
      const bblock = mempoolBlocks[i];
      await this.populateBlockInfo(blockTree, bblock.block.hash);
    }

    return blockTree;
  }

  async getMempool(chain: string) {
    return await this.BlockRepository.findByChainAndStatus(chain, BlockchainStatus.TX_MEMPOOL);
  }

  async getMainBlockTree(chain: string) {
    const blockTree = new BlockTree(chain);

    const firstBlock = await this.BlockRepository.findFirstImutableBlockByChain(chain);
    if (firstBlock === null) throw new Error(`get first imutable block of ${chain} not found`);
    blockTree.blockTreeLastMinedHash = firstBlock.block.hash;
    let lastBlockHeight = firstBlock.block.height;

    await this.populateBlockInfo(blockTree, firstBlock.block.hash);

    const lastBlocks = await this.BlockRepository.findByChainAndGreaterHeight(chain, firstBlock.block.height);

    for (let i = 0; i < lastBlocks.length; i++) {
      const bblock = lastBlocks[i];
      if (bblock.status === BlockchainStatus.TX_MINED) {
        await this.populateBlockInfo(blockTree, bblock.block.hash);
        if (bblock.block.height > lastBlockHeight) {
          blockTree.blockTreeLastMinedHash = bblock.block.hash;
          lastBlockHeight = bblock.block.height;
        }
      }
    }
    return blockTree;
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
