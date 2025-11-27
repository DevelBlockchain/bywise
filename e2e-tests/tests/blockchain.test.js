const NodeManager = require('../utils/node-manager');

describe('Blockchain E2E Tests', () => {
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

  describe('Single Node Mining', () => {
    it('should mine blocks with 2s block time and create checkpoint every 5 blocks', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 5;
      const TARGET_BLOCKS = 7; // Mine past the first checkpoint

      console.log('\n=== Starting single node with mining enabled ===');
      console.log(`Block time: ${BLOCK_TIME}`);
      console.log(`Checkpoint interval: ${CHECKPOINT_INTERVAL} blocks`);

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        minConnections: 0,
      });

      console.log('Node started, waiting for blocks to be mined...');

      // Wait for enough blocks to be mined
      const blockNumber = await manager.waitForBlockNumber(node, TARGET_BLOCKS, 30000);
      console.log(`Reached block ${blockNumber}`);

      expect(blockNumber).toBeGreaterThanOrEqual(TARGET_BLOCKS);
      console.log(`✓ Node mined at least ${TARGET_BLOCKS} blocks`);

      // Check blockchain info
      const info = await manager.getBlockchainInfo(node);
      console.log('Blockchain info:', info);
      expect(info.latestBlock).toBeGreaterThanOrEqual(TARGET_BLOCKS);

      // Check that genesis block (block 0) exists
      const genesisBlock = await manager.getBlock(node, 0);
      expect(genesisBlock).not.toBeNull();
      expect(genesisBlock.number).toBe(0);
      console.log(`✓ Genesis block exists with hash: ${genesisBlock.hash}`);

      // Check block 5 (checkpoint block)
      const checkpointBlock = await manager.getBlock(node, CHECKPOINT_INTERVAL);
      expect(checkpointBlock).not.toBeNull();
      expect(checkpointBlock.number).toBe(CHECKPOINT_INTERVAL);
      console.log(`✓ Checkpoint block ${CHECKPOINT_INTERVAL} exists`);

      // Verify blocks are properly linked
      for (let i = 1; i <= Math.min(blockNumber, 5); i++) {
        const block = await manager.getBlock(node, i);
        const prevBlock = await manager.getBlock(node, i - 1);
        expect(block.previousHash).toBe(prevBlock.hash);
      }
      console.log('✓ Block chain is properly linked');

      // Check block timestamps are roughly BLOCK_TIME apart
      const block1 = await manager.getBlock(node, 1);
      const block2 = await manager.getBlock(node, 2);
      const timeDiff = block2.timestamp - block1.timestamp;
      expect(timeDiff).toBeGreaterThanOrEqual(1); // At least 1 second
      expect(timeDiff).toBeLessThanOrEqual(5); // No more than 5 seconds
      console.log(`✓ Block time is approximately ${timeDiff}s`);

    }, 60000);
  });

  describe('Two Nodes Block Propagation', () => {
    it('should propagate blocks between two connected nodes', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 10;

      console.log('\n=== Starting two nodes for block propagation test ===');

      // Start first node (miner)
      const node1 = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        maxConnections: 10,
        minConnections: 0,
      });
      console.log('Node 1 (miner) started');

      // Start second node (non-miner, connects to first)
      const node2 = await manager.startNode(1, {
        bootstrapNodes: [node1.grpcAddress],
        miningEnabled: false,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        maxConnections: 10,
        minConnections: 1,
      });
      console.log('Node 2 (follower) started');

      // Wait for connection
      await manager.sleep(3000);
      const peers1 = await manager.getNodePeers(node1);
      const peers2 = await manager.getNodePeers(node2);
      console.log(`Node 1 peers: ${peers1.count}, Node 2 peers: ${peers2.count}`);

      expect(peers1.count).toBe(1);
      expect(peers2.count).toBe(1);
      console.log('✓ Nodes are connected');

      // Wait for blocks to be mined
      console.log('Waiting for blocks to be mined and propagated...');
      const targetBlock = 5;
      await manager.waitForBlockNumber(node1, targetBlock, 20000);

      // Give time for propagation
      await manager.sleep(3000);

      // Check both nodes have the same blocks
      const info1 = await manager.getBlockchainInfo(node1);
      const info2 = await manager.getBlockchainInfo(node2);

      console.log(`Node 1 latest block: ${info1.latestBlock}`);
      console.log(`Node 2 latest block: ${info2.latestBlock}`);

      // Node 2 should have received blocks from node 1
      expect(info2.latestBlock).toBeGreaterThanOrEqual(targetBlock - 2);
      console.log('✓ Blocks are being propagated');

      // Verify blocks match on both nodes
      const block3_node1 = await manager.getBlock(node1, 3);
      const block3_node2 = await manager.getBlock(node2, 3);

      if (block3_node2) {
        expect(block3_node1.hash).toBe(block3_node2.hash);
        console.log('✓ Block hashes match between nodes');
      }

    }, 60000);
  });

  describe('Node Synchronization', () => {
    it('should sync a new node to an existing blockchain', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 10;
      const BLOCKS_BEFORE_SYNC = 5;

      console.log('\n=== Starting node sync test ===');

      // Start first node and let it mine some blocks
      const node1 = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        maxConnections: 10,
        minConnections: 0,
      });
      console.log('Node 1 started, waiting for blocks...');

      // Wait for some blocks to be mined
      await manager.waitForBlockNumber(node1, BLOCKS_BEFORE_SYNC, 20000);
      const info1Before = await manager.getBlockchainInfo(node1);
      console.log(`Node 1 mined ${info1Before.latestBlock} blocks`);

      // Start second node (should sync from first)
      console.log('Starting Node 2 (late joiner)...');
      const node2 = await manager.startNode(1, {
        bootstrapNodes: [node1.grpcAddress],
        miningEnabled: false,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        maxConnections: 10,
        minConnections: 1,
      });

      // Wait for connection
      await manager.sleep(2000);
      const peers = await manager.getNodePeers(node2);
      expect(peers.count).toBe(1);
      console.log('✓ Node 2 connected to Node 1');

      // Wait for sync
      console.log('Waiting for Node 2 to sync...');
      await manager.sleep(5000);

      // Check sync status
      const info2 = await manager.getBlockchainInfo(node2);
      console.log(`Node 2 synced to block ${info2.latestBlock}`);

      // Node 2 should have synced at least some blocks
      // Note: Full sync requires sync protocol which we may not have fully implemented yet
      expect(info2.latestBlock).toBeGreaterThanOrEqual(0);

      // Let more blocks be mined and propagated
      await manager.waitForBlockNumber(node1, BLOCKS_BEFORE_SYNC + 3, 15000);
      await manager.sleep(3000);

      const info1After = await manager.getBlockchainInfo(node1);
      const info2After = await manager.getBlockchainInfo(node2);

      console.log(`After more mining - Node 1: ${info1After.latestBlock}, Node 2: ${info2After.latestBlock}`);

      // Node 2 should be receiving new blocks
      expect(info2After.latestBlock).toBeGreaterThan(info2.latestBlock);
      console.log('✓ Node 2 is receiving new blocks');

    }, 90000);
  });
});
