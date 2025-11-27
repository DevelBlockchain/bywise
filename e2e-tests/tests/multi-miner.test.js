const NodeManager = require('../utils/node-manager');

// Helper to normalize addresses for comparison (lowercase without 0x)
const normalizeAddress = (addr) => {
  if (!addr) return '';
  return addr.toLowerCase().replace('0x', '');
};

describe('Multi-Node Mining E2E Tests', () => {
  let manager;

  beforeAll(async () => {
    manager = new NodeManager();
    console.log('Building Go binary...');
    await manager.buildBinary();
    console.log('Binary built successfully');
  });

  afterAll(async () => {
    await manager.stopAllNodes();
    manager.cleanup();
  });

  afterEach(async () => {
    await manager.stopAllNodes();
  });

  describe('Single Miner with Multiple Sync Nodes', () => {
    it('should have miner produce blocks and sync nodes follow', async () => {
      const BLOCK_TIME = '2s';
      const TEST_DURATION = 20000;
      const EXPECTED_MIN_BLOCKS = 8;

      console.log('\n=== Starting miner with sync nodes test ===\n');

      // Start miner node
      console.log('Starting Miner node...');
      const miner = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
        maxConnections: 10,
      });
      console.log(`Miner started at ${miner.grpcAddress}`);

      // Wait for some blocks
      await manager.waitForBlockNumber(miner, 3, 15000);
      console.log('Miner produced initial blocks');

      const minerInfo = await manager.getNodeInfo(miner);
      const minerAddress = normalizeAddress(minerInfo.walletAddress);
      console.log(`Miner address: ${minerInfo.walletAddress}`);

      // Start sync node 1
      console.log('Starting Sync Node 1...');
      const syncNode1 = await manager.startNode(1, {
        bootstrapNodes: [miner.grpcAddress],
        miningEnabled: false, // Not a miner, just syncs
        blockTime: BLOCK_TIME,
        minConnections: 1,
        maxConnections: 10,
      });
      console.log(`Sync Node 1 started at ${syncNode1.grpcAddress}`);

      // Start sync node 2
      console.log('Starting Sync Node 2...');
      const syncNode2 = await manager.startNode(2, {
        bootstrapNodes: [miner.grpcAddress],
        miningEnabled: false,
        blockTime: BLOCK_TIME,
        minConnections: 1,
        maxConnections: 10,
      });
      console.log(`Sync Node 2 started at ${syncNode2.grpcAddress}`);

      // Wait for connections
      await manager.sleep(5000);

      // Check connections
      const minerPeers = await manager.getNodeInfo(miner);
      console.log(`Miner has ${minerPeers.connectedPeers} peers`);
      expect(minerPeers.connectedPeers).toBeGreaterThanOrEqual(2);
      console.log('✓ All nodes connected');

      // Let miner produce blocks
      console.log(`\nLetting miner work for ${TEST_DURATION / 1000} seconds...\n`);

      const startTime = Date.now();
      let lastReportedBlock = 0;
      while (Date.now() - startTime < TEST_DURATION) {
        const minerBlockInfo = await manager.getBlockchainInfo(miner);
        if (minerBlockInfo && minerBlockInfo.latestBlock > lastReportedBlock) {
          const block = await manager.getBlock(miner, minerBlockInfo.latestBlock);
          if (block) {
            console.log(`  Block ${minerBlockInfo.latestBlock} mined by ${block.minerAddress.slice(0, 10)}...`);
            lastReportedBlock = minerBlockInfo.latestBlock;
          }
        }
        await manager.sleep(1000);
      }

      console.log('\n=== Test completed, verifying results ===\n');

      // Get final state
      const finalMinerInfo = await manager.getBlockchainInfo(miner);
      const finalSync1Info = await manager.getBlockchainInfo(syncNode1);
      const finalSync2Info = await manager.getBlockchainInfo(syncNode2);

      console.log(`Miner: block ${finalMinerInfo.latestBlock}`);
      console.log(`Sync Node 1: block ${finalSync1Info.latestBlock}`);
      console.log(`Sync Node 2: block ${finalSync2Info.latestBlock}`);

      // 1. Verify miner produced enough blocks
      expect(finalMinerInfo.latestBlock).toBeGreaterThanOrEqual(EXPECTED_MIN_BLOCKS);
      console.log(`✓ Miner produced ${finalMinerInfo.latestBlock} blocks (>= ${EXPECTED_MIN_BLOCKS})`);

      // 2. Verify sync nodes are following (may be 1-2 blocks behind due to propagation)
      const sync1Diff = finalMinerInfo.latestBlock - finalSync1Info.latestBlock;
      const sync2Diff = finalMinerInfo.latestBlock - finalSync2Info.latestBlock;
      expect(sync1Diff).toBeLessThanOrEqual(2);
      expect(sync2Diff).toBeLessThanOrEqual(2);
      console.log(`✓ Sync nodes are following (diff: ${sync1Diff}, ${sync2Diff})`);

      // 3. Verify all blocks came from the miner
      let allFromMiner = true;
      for (let blockNum = 0; blockNum <= Math.min(finalSync1Info.latestBlock, 10); blockNum++) {
        const block = await manager.getBlock(syncNode1, blockNum);
        if (block && normalizeAddress(block.minerAddress) !== minerAddress) {
          allFromMiner = false;
          console.log(`  Block ${blockNum} not from miner: ${block.minerAddress}`);
        }
      }
      expect(allFromMiner).toBe(true);
      console.log('✓ All blocks produced by the miner');

      // 4. Verify chain consistency (blocks match)
      console.log('\nVerifying chain consistency...');
      let chainsMatch = true;
      const checkUntil = Math.min(finalSync1Info.latestBlock, finalSync2Info.latestBlock);
      for (let blockNum = 0; blockNum <= checkUntil; blockNum++) {
        const minerBlock = await manager.getBlock(miner, blockNum);
        const sync1Block = await manager.getBlock(syncNode1, blockNum);
        const sync2Block = await manager.getBlock(syncNode2, blockNum);

        if (!minerBlock || !sync1Block || !sync2Block) continue;

        if (minerBlock.hash !== sync1Block.hash || sync1Block.hash !== sync2Block.hash) {
          chainsMatch = false;
          console.log(`  Block ${blockNum} hash mismatch!`);
        }
      }
      expect(chainsMatch).toBe(true);
      console.log(`✓ All ${checkUntil + 1} blocks match across all nodes`);

    }, 90000);

    it('should sync node catch up after late join', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting late join sync test ===\n');

      // Start miner
      console.log('Starting Miner...');
      const miner = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });

      // Let miner produce several blocks
      console.log('Waiting for miner to produce 10 blocks...');
      await manager.waitForBlockNumber(miner, 10, 30000);

      const beforeJoin = await manager.getBlockchainInfo(miner);
      console.log(`Miner at block ${beforeJoin.latestBlock} before late joiner`);

      // Start late joining sync node
      console.log('\nStarting late joining sync node...');
      const lateNode = await manager.startNode(1, {
        bootstrapNodes: [miner.grpcAddress],
        miningEnabled: false,
        blockTime: BLOCK_TIME,
        minConnections: 1,
      });

      // Wait for sync
      console.log('Waiting for late node to sync...');
      await manager.sleep(10000);

      // Check sync status
      const minerInfo = await manager.getBlockchainInfo(miner);
      const lateNodeInfo = await manager.getBlockchainInfo(lateNode);

      console.log(`\nAfter sync:`);
      console.log(`  Miner: block ${minerInfo.latestBlock}`);
      console.log(`  Late Node: block ${lateNodeInfo.latestBlock}`);

      // Late node should have caught up
      const blockDiff = minerInfo.latestBlock - lateNodeInfo.latestBlock;
      expect(blockDiff).toBeLessThanOrEqual(2);
      console.log(`✓ Late node caught up (diff: ${blockDiff})`);

      // Late node should have at least the blocks that existed before it joined
      expect(lateNodeInfo.latestBlock).toBeGreaterThanOrEqual(beforeJoin.latestBlock);
      console.log(`✓ Late node has historical blocks`);

      // Verify chain integrity
      let blocksMatch = true;
      for (let i = 0; i <= Math.min(lateNodeInfo.latestBlock, 10); i++) {
        const minerBlock = await manager.getBlock(miner, i);
        const lateBlock = await manager.getBlock(lateNode, i);
        if (minerBlock && lateBlock && minerBlock.hash !== lateBlock.hash) {
          blocksMatch = false;
        }
      }
      expect(blocksMatch).toBe(true);
      console.log('✓ Chain integrity verified');

    }, 90000);

    it('should continue producing blocks with consistent state', async () => {
      const BLOCK_TIME = '2s';
      const TOTAL_BLOCKS = 15;

      console.log('\n=== Starting continuous mining test ===\n');

      // Start miner
      const miner = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });

      console.log(`Waiting for ${TOTAL_BLOCKS} blocks...`);

      // Track block production
      const blocks = [];
      let lastBlock = 0;

      while (blocks.length < TOTAL_BLOCKS) {
        const info = await manager.getBlockchainInfo(miner);
        if (info && info.latestBlock > lastBlock) {
          for (let i = lastBlock + 1; i <= info.latestBlock; i++) {
            const block = await manager.getBlock(miner, i);
            if (block) {
              blocks.push({
                number: block.number,
                hash: block.hash,
                prevHash: block.previousHash,
                miner: block.minerAddress,
              });
              console.log(`  Block ${i}: ${block.hash.slice(0, 10)}...`);
            }
          }
          lastBlock = info.latestBlock;
        }
        await manager.sleep(500);
      }

      console.log(`\nProduced ${blocks.length} blocks`);

      // Verify chain linkage
      console.log('\nVerifying chain linkage...');
      let chainValid = true;
      for (let i = 1; i < blocks.length; i++) {
        const prevBlock = await manager.getBlock(miner, blocks[i].number - 1);
        if (prevBlock && blocks[i].prevHash !== prevBlock.hash) {
          chainValid = false;
          console.log(`  Block ${blocks[i].number} has invalid previous hash`);
        }
      }
      expect(chainValid).toBe(true);
      console.log('✓ Chain linkage is valid');

      // Verify all blocks from same miner
      const minerAddress = blocks[0].miner;
      const allSameMiner = blocks.every(b => normalizeAddress(b.miner) === normalizeAddress(minerAddress));
      expect(allSameMiner).toBe(true);
      console.log('✓ All blocks from same miner');

    }, 90000);

    it('should sync node reconnect after temporary disconnection', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting reconnection test ===\n');

      // Start miner
      console.log('Starting Miner...');
      const miner = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });

      await manager.waitForBlockNumber(miner, 2, 15000);

      // Start sync node
      console.log('Starting Sync Node...');
      const syncNode = await manager.startNode(1, {
        bootstrapNodes: [miner.grpcAddress],
        miningEnabled: false,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });

      await manager.sleep(5000);

      // Get current state
      const beforeDisconnect = await manager.getBlockchainInfo(syncNode);
      console.log(`Sync node at block ${beforeDisconnect.latestBlock} before disconnect`);

      // Stop sync node
      console.log('\nStopping sync node...');
      await manager.stopNode(syncNode);

      // Let miner continue for a while
      console.log('Miner continuing alone...');
      await manager.sleep(10000);

      const afterDisconnect = await manager.getBlockchainInfo(miner);
      console.log(`Miner at block ${afterDisconnect.latestBlock} after disconnect period`);

      // Restart sync node
      console.log('\nRestarting sync node...');
      const syncNodeRestarted = await manager.startNode(1, {
        bootstrapNodes: [miner.grpcAddress],
        miningEnabled: false,
        blockTime: BLOCK_TIME,
        minConnections: 1,
      });

      // Wait for resync
      console.log('Waiting for resync...');
      await manager.sleep(10000);

      // Check final state
      const finalMiner = await manager.getBlockchainInfo(miner);
      const finalSync = await manager.getBlockchainInfo(syncNodeRestarted);

      console.log(`\nFinal state:`);
      console.log(`  Miner: block ${finalMiner.latestBlock}`);
      console.log(`  Sync: block ${finalSync.latestBlock}`);

      // Sync node should have caught up
      const blockDiff = finalMiner.latestBlock - finalSync.latestBlock;
      expect(blockDiff).toBeLessThanOrEqual(2);
      console.log(`✓ Sync node reconnected and caught up (diff: ${blockDiff})`);

      // Should have more blocks than before disconnect
      expect(finalSync.latestBlock).toBeGreaterThan(beforeDisconnect.latestBlock);
      console.log(`✓ Sync node has new blocks (${beforeDisconnect.latestBlock} -> ${finalSync.latestBlock})`);

    }, 90000);
  });
});
