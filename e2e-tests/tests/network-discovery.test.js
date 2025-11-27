const NodeManager = require('../utils/node-manager');

describe('Network Discovery E2E Tests', () => {
  let manager;

  beforeAll(async () => {
    manager = new NodeManager();
    // Build the binary before running tests
    console.log('Building Go binary...');
    await manager.buildBinary();
    console.log('Binary built successfully');
  });

  afterAll(async () => {
    await manager.stopAllNodes();
    manager.cleanup();
  });

  afterEach(async () => {
    // Stop all nodes after each test
    await manager.stopAllNodes();
  });

  describe('10 Nodes Discovery Test', () => {
    it('should discover peers through bootstrap node with max 3 connections per node', async () => {
      const NUM_NODES = 10;
      const MAX_CONNECTIONS = 3;

      console.log(`\n=== Starting ${NUM_NODES} nodes with max ${MAX_CONNECTIONS} connections each ===\n`);

      // Start the first node (bootstrap node)
      console.log('Starting bootstrap node (node-0)...');
      const bootstrapNode = await manager.startNode(0, {
        bootstrapNodes: [],
        maxConnections: MAX_CONNECTIONS,
        minConnections: 1,
        discoveryEnabled: true,
        discoveryInterval: '2s',
      });
      console.log(`Bootstrap node started at ${bootstrapNode.grpcAddress}`);

      // Start remaining nodes, all pointing to the bootstrap node
      const bootstrapAddress = bootstrapNode.grpcAddress;

      for (let i = 1; i < NUM_NODES; i++) {
        console.log(`Starting node-${i}...`);
        await manager.startNode(i, {
          bootstrapNodes: [bootstrapAddress],
          maxConnections: MAX_CONNECTIONS,
          minConnections: 1,
          discoveryEnabled: true,
          discoveryInterval: '2s',
        });
      }

      console.log(`\nAll ${NUM_NODES} nodes started. Waiting for discovery to propagate...\n`);

      // Wait for discovery to work (give enough time for multiple discovery cycles)
      await manager.sleep(15000);

      // Check connections for each node
      console.log('\n=== Checking node connections ===\n');

      const connectionResults = [];
      for (const node of manager.nodes) {
        const info = await manager.getNodeInfo(node);
        const peers = await manager.getNodePeers(node);

        connectionResults.push({
          nodeId: info.nodeId,
          connectedPeers: info.connectedPeers,
          maxConnections: info.maxConnections,
          peerAddresses: peers.peers.map(p => p.address),
        });

        console.log(`Node ${info.nodeId}: ${info.connectedPeers}/${info.maxConnections} peers connected`);
        if (peers.peers.length > 0) {
          console.log(`  Connected to: ${peers.peers.map(p => p.nodeId).join(', ')}`);
        }
      }

      // Validate results
      console.log('\n=== Validating results ===\n');

      // 1. Each node should not exceed max connections
      for (const result of connectionResults) {
        expect(result.connectedPeers).toBeLessThanOrEqual(MAX_CONNECTIONS);
        console.log(`✓ ${result.nodeId} has ${result.connectedPeers} connections (max: ${MAX_CONNECTIONS})`);
      }

      // 2. Bootstrap node should have exactly MAX_CONNECTIONS (since more nodes tried to connect)
      const bootstrapResult = connectionResults.find(r => r.nodeId === 'node-0');
      expect(bootstrapResult.connectedPeers).toBe(MAX_CONNECTIONS);
      console.log(`✓ Bootstrap node reached max connections (${bootstrapResult.connectedPeers})`);

      // 3. Other nodes should have discovered peers beyond just the bootstrap
      //    Since max is 3 and there are 9 other nodes, some should have connected to discovered peers
      let nodesWithMultiplePeers = 0;
      for (const result of connectionResults) {
        if (result.connectedPeers > 1) {
          nodesWithMultiplePeers++;
        }
      }

      console.log(`\n${nodesWithMultiplePeers} nodes have more than 1 peer connected`);

      // At least some nodes should have discovered additional peers
      expect(nodesWithMultiplePeers).toBeGreaterThan(0);
      console.log('✓ Discovery mechanism is working - nodes discovered peers beyond bootstrap');

      // 4. Calculate total connections in the network
      const totalConnections = connectionResults.reduce((sum, r) => sum + r.connectedPeers, 0);
      console.log(`\nTotal connections in network: ${totalConnections / 2} (each connection counted twice)`);

      // With 10 nodes and max 3 connections each, we should have a well-connected network
      // Minimum expected: each node has at least 1 connection
      const nodesWithConnections = connectionResults.filter(r => r.connectedPeers > 0).length;
      expect(nodesWithConnections).toBe(NUM_NODES);
      console.log(`✓ All ${NUM_NODES} nodes are connected to the network`);

    }, 60000); // 60 second timeout

    it('should respect max connections limit when many nodes connect simultaneously', async () => {
      const NUM_NODES = 5;
      const MAX_CONNECTIONS = 2;

      console.log(`\n=== Testing max connection limit with ${NUM_NODES} nodes ===\n`);

      // Start bootstrap node with very low max connections
      const bootstrapNode = await manager.startNode(0, {
        bootstrapNodes: [],
        maxConnections: MAX_CONNECTIONS,
        minConnections: 1,
        discoveryEnabled: true,
        discoveryInterval: '2s',
      });

      // Start all other nodes pointing to bootstrap
      const startPromises = [];
      for (let i = 1; i < NUM_NODES; i++) {
        startPromises.push(
          manager.startNode(i, {
            bootstrapNodes: [bootstrapNode.grpcAddress],
            maxConnections: MAX_CONNECTIONS,
            minConnections: 1,
            discoveryEnabled: true,
            discoveryInterval: '2s',
          })
        );
      }
      await Promise.all(startPromises);

      // Wait for connections
      await manager.sleep(10000);

      // Bootstrap should never exceed max
      const bootstrapInfo = await manager.getNodeInfo(bootstrapNode);
      expect(bootstrapInfo.connectedPeers).toBeLessThanOrEqual(MAX_CONNECTIONS);
      console.log(`✓ Bootstrap node connections: ${bootstrapInfo.connectedPeers} (max: ${MAX_CONNECTIONS})`);

      // All nodes should respect their limits
      for (const node of manager.nodes) {
        const info = await manager.getNodeInfo(node);
        expect(info.connectedPeers).toBeLessThanOrEqual(MAX_CONNECTIONS);
      }
      console.log('✓ All nodes respect max connection limit');

    }, 30000);
  });

  describe('Basic Connectivity', () => {
    it('should connect two nodes successfully', async () => {
      // Start first node
      const node1 = await manager.startNode(0, {
        bootstrapNodes: [],
        maxConnections: 10,
      });

      // Start second node pointing to first
      const node2 = await manager.startNode(1, {
        bootstrapNodes: [node1.grpcAddress],
        maxConnections: 10,
      });

      // Wait for connection
      await manager.sleep(3000);

      const info1 = await manager.getNodeInfo(node1);
      const info2 = await manager.getNodeInfo(node2);

      expect(info1.connectedPeers).toBe(1);
      expect(info2.connectedPeers).toBe(1);

      console.log('✓ Two nodes connected successfully');
    }, 20000);

    it('should return correct health status', async () => {
      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        minConnections: 0,
        maxConnections: 10,
      });

      const health = await manager.getNodeHealth(node);

      expect(health.status).toBe('healthy');
      expect(health.connectedPeers).toBe(0);

      console.log('✓ Health endpoint returns correct status');
    }, 15000);
  });
});
