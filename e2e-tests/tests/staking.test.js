const NodeManager = require('../utils/node-manager');

describe('Staking E2E Tests', () => {
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

  describe('Miner Staking', () => {
    it('should register a new miner with stake', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting miner registration test ===');

      // Start a node
      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      // Wait for genesis
      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Use the node's wallet (which has genesis balance) for the miner
      const minerAddress = await manager.getNodeWalletAddress(node);
      console.log(`Miner wallet (node wallet): ${minerAddress}`);

      // Register as miner with minimum stake
      const stakeAmount = '1000000';
      console.log(`Registering as miner with stake: ${stakeAmount}`);

      const registerResult = await manager.registerAsMiner(node, minerAddress, stakeAmount);
      console.log('Register result:', registerResult);

      expect(registerResult.success).toBe(true);
      expect(registerResult.isMiner).toBe(true);
      // Note: Node wallet is auto-registered as both miner and validator during init
      expect(registerResult.isValidator).toBe(true);
      expect(registerResult.isActive).toBe(true);
      expect(registerResult.minerStake).toBe(stakeAmount);
      console.log('Miner registered successfully');

      // Verify stake info
      const stakeInfo = await manager.getStakeInfo(node, minerAddress);
      console.log('Stake info:', stakeInfo);

      expect(stakeInfo).not.toBeNull();
      expect(stakeInfo.isMiner).toBe(true);
      expect(stakeInfo.isActive).toBe(true);
      expect(stakeInfo.minerStake).toBe(stakeAmount);
      console.log('Stake info verified');

    }, 60000);

    it('should reject miner registration with insufficient stake', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting insufficient stake test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Use a new wallet with no balance to test the "insufficient stake" error
      const minerWallet = manager.createWallet();
      console.log(`Miner wallet (empty): ${minerWallet.address}`);

      // Try to register with insufficient stake (wallet has no balance)
      const insufficientStake = '100'; // Less than minimum
      console.log(`Trying to register with insufficient stake: ${insufficientStake}`);

      const registerResult = await manager.registerAsMiner(node, minerWallet.address, insufficientStake);
      console.log('Register result:', registerResult);

      expect(registerResult.success).toBe(false);
      expect(registerResult.error).toContain('stake must be at least');
      console.log('Insufficient stake correctly rejected');

    }, 30000);

    it('should verify node wallet is already registered as miner during init', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting verify initial miner test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Get node wallet address
      const nodeWallet = await manager.getNodeWalletAddress(node);
      console.log(`Node wallet: ${nodeWallet}`);

      // Verify the node wallet is already registered during blockchain init
      const stakeInfo = await manager.getStakeInfo(node, nodeWallet);
      console.log('Initial stake info:', stakeInfo);

      expect(stakeInfo).not.toBeNull();
      expect(stakeInfo.isMiner).toBe(true);
      expect(stakeInfo.isValidator).toBe(true);
      expect(stakeInfo.isActive).toBe(true);
      console.log('Node wallet verified as miner and validator');

    }, 30000);
  });

  describe('Validator Staking', () => {
    it('should verify node wallet is registered as validator', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting validator verification test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Get node wallet (already registered as validator during init)
      const validatorAddress = await manager.getNodeWalletAddress(node);
      console.log(`Validator wallet (node wallet): ${validatorAddress}`);

      // Verify stake info
      const stakeInfo = await manager.getStakeInfo(node, validatorAddress);
      console.log('Stake info:', stakeInfo);

      expect(stakeInfo).not.toBeNull();
      expect(stakeInfo.isValidator).toBe(true);
      expect(stakeInfo.isMiner).toBe(true);
      expect(stakeInfo.isActive).toBe(true);
      console.log('Validator stake info verified');

    }, 60000);

    it('should update validator stake', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting validator stake update test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Get node wallet
      const validatorAddress = await manager.getNodeWalletAddress(node);
      console.log(`Validator wallet: ${validatorAddress}`);

      // Get initial stake info
      let stakeInfo = await manager.getStakeInfo(node, validatorAddress);
      console.log('Initial stake info:', stakeInfo);
      const initialValidatorStake = stakeInfo.validatorStake;

      // Update validator stake to a higher amount
      const newStake = '3000000';
      console.log(`Updating validator stake to: ${newStake}`);

      const updateResult = await manager.registerAsValidator(node, validatorAddress, newStake);
      console.log('Update result:', updateResult);

      expect(updateResult.success).toBe(true);
      expect(updateResult.isValidator).toBe(true);
      expect(updateResult.validatorStake).toBe(newStake);

      // Verify updated stake
      stakeInfo = await manager.getStakeInfo(node, validatorAddress);
      expect(stakeInfo.validatorStake).toBe(newStake);
      console.log(`Validator stake updated from ${initialValidatorStake} to ${stakeInfo.validatorStake}`);

    }, 60000);
  });

  describe('Stake Updates', () => {
    it('should update stake amount for existing staker', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting stake update test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Use node wallet (has balance)
      const minerAddress = await manager.getNodeWalletAddress(node);

      // Get initial stake
      let stakeInfo = await manager.getStakeInfo(node, minerAddress);
      const initialStake = stakeInfo.minerStake;
      console.log(`Initial stake: ${initialStake}`);

      // Update stake to higher amount
      const updatedStake = '3000000';
      console.log(`Updating stake to: ${updatedStake}`);

      const updateResult = await manager.registerAsMiner(node, minerAddress, updatedStake);
      expect(updateResult.success).toBe(true);
      expect(updateResult.minerStake).toBe(updatedStake);

      // Verify updated stake
      stakeInfo = await manager.getStakeInfo(node, minerAddress);
      expect(stakeInfo.minerStake).toBe(updatedStake);
      console.log(`Updated stake verified: ${stakeInfo.minerStake}`);

    }, 60000);

    it('should update both miner and validator stakes', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting dual stake update test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Use node wallet
      const wallet = await manager.getNodeWalletAddress(node);
      const newMinerStake = '2000000';
      const newValidatorStake = '1500000';

      // Update miner stake
      console.log(`Updating miner stake to: ${newMinerStake}`);
      let result = await manager.registerAsMiner(node, wallet, newMinerStake);
      expect(result.success).toBe(true);
      expect(result.isMiner).toBe(true);

      // Update validator stake
      console.log(`Updating validator stake to: ${newValidatorStake}`);
      result = await manager.registerAsValidator(node, wallet, newValidatorStake);
      expect(result.success).toBe(true);
      expect(result.isValidator).toBe(true);

      // Verify both stakes
      const stakeInfo = await manager.getStakeInfo(node, wallet);
      expect(stakeInfo.isMiner).toBe(true);
      expect(stakeInfo.isValidator).toBe(true);
      expect(stakeInfo.minerStake).toBe(newMinerStake);
      expect(stakeInfo.validatorStake).toBe(newValidatorStake);
      console.log('Both stakes updated successfully');

    }, 60000);
  });

  describe('Stake Verification in Network', () => {
    it('should see registered stakers reflected in blockchain info', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting blockchain info verification test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Get blockchain info (should have at least one miner and validator from init)
      const info = await manager.getBlockchainInfo(node);
      console.log(`Blockchain info - Miners: ${info.activeMiners}, Validators: ${info.activeValidators}`);

      // Verify there's at least one miner and validator
      expect(info.activeMiners).toBeGreaterThanOrEqual(1);
      expect(info.activeValidators).toBeGreaterThanOrEqual(1);
      console.log('Initial stakers verified in blockchain info');

      // Update the node's stake and verify it's still active
      const nodeWallet = await manager.getNodeWalletAddress(node);
      const newStake = '2000000';

      const result = await manager.registerAsMiner(node, nodeWallet, newStake);
      expect(result.success).toBe(true);
      console.log(`Stake updated to ${newStake}`);

      // Wait a bit for state to settle
      await manager.sleep(500);

      // Verify counts remain the same (same wallet, just updated stake)
      const updatedInfo = await manager.getBlockchainInfo(node);
      console.log(`Updated info - Miners: ${updatedInfo.activeMiners}, Validators: ${updatedInfo.activeValidators}`);

      expect(updatedInfo.activeMiners).toBeGreaterThanOrEqual(1);
      expect(updatedInfo.activeValidators).toBeGreaterThanOrEqual(1);
      console.log('Blockchain info verification complete');

    }, 60000);
  });
});
