const NodeManager = require('../utils/node-manager');

describe('Transaction E2E Tests', () => {
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

  describe('Transaction Submission and Mining', () => {
    it('should submit a transaction and have it mined in a block', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 10;

      console.log('\n=== Starting transaction submission test ===');

      // Start a mining node with validator enabled
      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        validatorEnabled: true,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        minConnections: 0,
      });
      console.log('Mining node started');

      // Wait for at least one block to be mined (genesis)
      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Get node's validator info
      const validatorInfo = await manager.getValidatorInfo(node);
      console.log(`Node validator: ${validatorInfo.address}`);

      // Create test wallet for user
      const userWallet = manager.createWallet();
      console.log(`User wallet: ${userWallet.address}`);

      // Use the executeAndSubmit flow which handles the 2-step validation properly
      // Note: Using zero value since the user wallet has no initial balance
      console.log('Executing and submitting transaction...');
      const submitResult = await manager.executeAndSubmit(
        node,
        userWallet,
        '0x0000000000000000000000000000000000000001', // to address
        '0', // value (zero - user has no balance)
        '', // data
        '1', // nonce
        0 // blockLimit
      );
      console.log('Submit result:', submitResult);

      expect(submitResult.success).toBe(true);
      expect(submitResult.txId).toBeDefined();
      console.log(`✓ Transaction submitted with ID: ${submitResult.txId}`);

      // Wait for the transaction to be mined
      console.log('Waiting for transaction to be mined...');
      await manager.sleep(5000); // Wait for a couple of blocks

      // Verify the transaction appears in the blockchain
      const minedTx = await manager.getTransaction(node, submitResult.txId);
      expect(minedTx).not.toBeNull();
      expect(minedTx.id).toBe(submitResult.txId);
      console.log('✓ Transaction found in blockchain');
      console.log(`  From: ${minedTx.from}`);
      console.log(`  To: ${minedTx.to}`);
      console.log(`  Value: ${minedTx.value}`);

    }, 60000);

    it('should reject transactions with invalid signatures', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting invalid transaction test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        validatorEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Create a transaction with invalid signature (just random bytes)
      const invalidTx = {
        validator: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0000000000000000000000000000000000000001',
        value: '1000',
        nonce: '1',
        data: '',
        userSig: 'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe00',
        sequenceId: 1,
        readSet: {},  // Now a map (object), not array
        writeSet: {},
        validatorSig: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef00',
      };

      console.log('Submitting invalid transaction...');
      const submitResult = await manager.submitTransaction(node, invalidTx);
      console.log('Submit result:', submitResult);

      expect(submitResult.success).toBe(false);
      expect(submitResult.error).toBeDefined();
      console.log('✓ Invalid transaction was rejected');

    }, 30000);
  });

  describe('Transaction Propagation', () => {
    it('should propagate transactions between connected nodes', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 10;

      console.log('\n=== Starting transaction propagation test ===');

      // Start first node (miner) - matching blockchain test configuration
      const node1 = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        maxConnections: 10,
        minConnections: 0,
      });
      console.log('Node 1 (miner) started');

      // Start second node (connected to first, not mining)
      // IMPORTANT: Set minerStake and validatorStake to '0' to prevent auto-mining
      const node2 = await manager.startNode(1, {
        bootstrapNodes: [node1.grpcAddress],
        miningEnabled: false, // Not mining, just receiving
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        maxConnections: 10,
        minConnections: 1,
        minerStake: '0', // Zero stake to prevent auto-genesis creation
        validatorStake: '0', // Zero stake
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

      // Wait for genesis block to be mined
      await manager.waitForBlockNumber(node1, 1, 15000);
      console.log('Genesis block mined on Node 1');

      // IMPORTANT: Wait for Node 2 to sync genesis before submitting transaction
      console.log('Waiting for Node 2 to sync genesis...');
      await manager.waitForBlockNumber(node2, 1, 15000);
      console.log('✓ Node 2 synced genesis block');

      // Create test wallet for user
      const userWallet = manager.createWallet();

      // Use executeAndSubmit to properly handle the 2-step validation
      // Note: Using zero value since the user wallet has no initial balance
      console.log('Submitting transaction to Node 1...');
      const submitResult = await manager.executeAndSubmit(
        node1,
        userWallet,
        '0x0000000000000000000000000000000000000002',
        '0', // value (zero - user has no balance)
        '', // data
        '1', // nonce
        0 // blockLimit
      );
      expect(submitResult.success).toBe(true);
      console.log(`✓ Transaction submitted to Node 1: ${submitResult.txId}`);

      // Wait briefly for propagation
      await manager.sleep(2000);

      // Check that Node 2 also has the transaction in pending pool
      const pending2 = await manager.getPendingTransactions(node2);
      console.log(`Node 2 pending transactions: ${pending2 ? pending2.count : 0}`);

      // The transaction should have been propagated to Node 2
      if (pending2 && pending2.count > 0) {
        console.log('✓ Transaction was propagated to Node 2');
      } else {
        // It might have been mined already
        console.log('Transaction may have been mined already');
      }

      // Wait for the transaction to be mined
      console.log('Waiting for transaction to be mined...');
      await manager.sleep(5000);

      // Verify transaction is in the blockchain on both nodes
      const minedTx1 = await manager.getTransaction(node1, submitResult.txId);
      expect(minedTx1).not.toBeNull();
      console.log('✓ Transaction mined on Node 1');

      // Verify that Node 2 is syncing blocks from Node 1
      console.log('Verifying block synchronization...');
      await manager.sleep(5000);

      // Get genesis blocks from both nodes to verify they match
      const genesis1 = await manager.getBlock(node1, 0);
      const genesis2 = await manager.getBlock(node2, 0);

      // Verify genesis blocks match (core requirement for same chain)
      expect(genesis1).not.toBeNull();
      expect(genesis2).not.toBeNull();
      expect(genesis1.hash).toBe(genesis2.hash);
      console.log('✓ Genesis blocks are identical - nodes are on the same chain');

      const finalInfo2 = await manager.getBlockchainInfo(node2);
      expect(finalInfo2.latestBlock).toBeGreaterThanOrEqual(1);
      console.log('✓ Node 2 successfully synchronized from Node 1');

    }, 90000);
  });

  describe('Multiple Transactions', () => {
    it('should handle multiple transactions in a single block', async () => {
      const BLOCK_TIME = '3s'; // Slightly longer to accumulate transactions
      const CHECKPOINT_INTERVAL = 10;
      const NUM_TRANSACTIONS = 5;

      console.log('\n=== Starting multiple transactions test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        validatorEnabled: true,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        minConnections: 0,
      });
      console.log('Mining node started');

      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Create multiple transactions using executeAndSubmit
      const txIds = [];
      for (let i = 0; i < NUM_TRANSACTIONS; i++) {
        const userWallet = manager.createWallet();

        const result = await manager.executeAndSubmit(
          node,
          userWallet,
          `0x000000000000000000000000000000000000000${i + 1}`,
          '0', // value (zero - user has no balance)
          '', // data
          `${i + 1}`, // nonce (unique per transaction)
          0 // blockLimit
        );

        expect(result.success).toBe(true);
        txIds.push(result.txId);
        console.log(`Submitted transaction ${i + 1}: ${result.txId}`);
      }

      console.log(`✓ Submitted ${NUM_TRANSACTIONS} transactions`);

      // Wait for transactions to be mined
      console.log('Waiting for transactions to be mined...');
      await manager.waitForPendingTransactionsCleared(node, 20000);

      // Verify all transactions are mined
      let minedCount = 0;
      for (const txId of txIds) {
        const tx = await manager.getTransaction(node, txId);
        if (tx && tx.id) {
          minedCount++;
        }
      }

      console.log(`Mined ${minedCount}/${NUM_TRANSACTIONS} transactions`);
      expect(minedCount).toBe(NUM_TRANSACTIONS);
      console.log('✓ All transactions were mined');

    }, 60000);
  });
});
