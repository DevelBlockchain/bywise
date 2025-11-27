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

      // Create a new wallet for the miner
      const minerWallet = manager.createWallet();
      console.log(`Miner wallet: ${minerWallet.address}`);

      // Register as miner with minimum stake
      const stakeAmount = '1000000';
      console.log(`Registering as miner with stake: ${stakeAmount}`);

      const registerResult = await manager.registerAsMiner(node, minerWallet.address, stakeAmount);
      console.log('Register result:', registerResult);

      expect(registerResult.success).toBe(true);
      expect(registerResult.isMiner).toBe(true);
      expect(registerResult.isValidator).toBeFalsy(); // Can be false or undefined due to omitempty
      expect(registerResult.isActive).toBe(true);
      expect(registerResult.minerStake).toBe(stakeAmount);
      console.log('Miner registered successfully');

      // Verify stake info
      const stakeInfo = await manager.getStakeInfo(node, minerWallet.address);
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

      const minerWallet = manager.createWallet();
      console.log(`Miner wallet: ${minerWallet.address}`);

      // Try to register with insufficient stake
      const insufficientStake = '100'; // Less than minimum
      console.log(`Trying to register with insufficient stake: ${insufficientStake}`);

      const registerResult = await manager.registerAsMiner(node, minerWallet.address, insufficientStake);
      console.log('Register result:', registerResult);

      expect(registerResult.success).toBe(false);
      expect(registerResult.error).toContain('stake must be at least');
      console.log('Insufficient stake correctly rejected');

    }, 30000);

    it('should allow multiple miners to register', async () => {
      const BLOCK_TIME = '2s';
      const NUM_MINERS = 3;

      console.log('\n=== Starting multiple miners test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Register multiple miners
      const miners = [];
      for (let i = 0; i < NUM_MINERS; i++) {
        const minerWallet = manager.createWallet();
        const stakeAmount = `${1000000 + i * 500000}`; // Varying stake amounts

        const result = await manager.registerAsMiner(node, minerWallet.address, stakeAmount);
        expect(result.success).toBe(true);

        miners.push({
          address: minerWallet.address,
          stake: stakeAmount,
        });
        console.log(`Miner ${i + 1} registered: ${minerWallet.address} with stake ${stakeAmount}`);
      }

      // Verify all miners are registered
      for (let i = 0; i < NUM_MINERS; i++) {
        const stakeInfo = await manager.getStakeInfo(node, miners[i].address);
        expect(stakeInfo).not.toBeNull();
        expect(stakeInfo.isMiner).toBe(true);
        expect(stakeInfo.isActive).toBe(true);
        console.log(`Verified miner ${i + 1}`);
      }

      console.log(`All ${NUM_MINERS} miners registered and verified`);

    }, 60000);
  });

  describe('Validator Staking', () => {
    it('should register a new validator with stake', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting validator registration test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Create a new wallet for the validator
      const validatorWallet = manager.createWallet();
      console.log(`Validator wallet: ${validatorWallet.address}`);

      // Register as validator with stake
      const stakeAmount = '2000000';
      console.log(`Registering as validator with stake: ${stakeAmount}`);

      const registerResult = await manager.registerAsValidator(node, validatorWallet.address, stakeAmount);
      console.log('Register result:', registerResult);

      expect(registerResult.success).toBe(true);
      expect(registerResult.isMiner).toBeFalsy(); // Can be false or undefined due to omitempty
      expect(registerResult.isValidator).toBe(true);
      expect(registerResult.isActive).toBe(true);
      expect(registerResult.validatorStake).toBe(stakeAmount);
      console.log('Validator registered successfully');

      // Verify stake info
      const stakeInfo = await manager.getStakeInfo(node, validatorWallet.address);
      console.log('Stake info:', stakeInfo);

      expect(stakeInfo).not.toBeNull();
      expect(stakeInfo.isValidator).toBe(true);
      expect(stakeInfo.isMiner).toBe(false);
      expect(stakeInfo.isActive).toBe(true);
      expect(stakeInfo.validatorStake).toBe(stakeAmount);
      console.log('Validator stake info verified');

    }, 60000);

    it('should register as both miner and validator', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting dual registration test (miner + validator) ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Create a wallet
      const dualWallet = manager.createWallet();
      console.log(`Dual-role wallet: ${dualWallet.address}`);

      // Register as both miner and validator
      // The stake will be split: 2500000 for miner, 2500000 for validator
      const totalStake = '5000000';
      const expectedEachStake = '2500000';
      console.log(`Registering as both miner and validator with total stake: ${totalStake}`);

      const registerResult = await manager.registerAsMinerAndValidator(
        node,
        dualWallet.address,
        totalStake
      );
      console.log('Register result:', registerResult);

      expect(registerResult.success).toBe(true);
      expect(registerResult.isMiner).toBe(true);
      expect(registerResult.isValidator).toBe(true);
      expect(registerResult.isActive).toBe(true);
      expect(registerResult.minerStake).toBe(expectedEachStake);
      expect(registerResult.validatorStake).toBe(expectedEachStake);
      console.log('Dual registration successful');

      // Verify stake info
      const stakeInfo = await manager.getStakeInfo(node, dualWallet.address);
      console.log('Stake info:', stakeInfo);

      expect(stakeInfo).not.toBeNull();
      expect(stakeInfo.isMiner).toBe(true);
      expect(stakeInfo.isValidator).toBe(true);
      expect(stakeInfo.isActive).toBe(true);
      expect(stakeInfo.minerStake).toBe(expectedEachStake);
      expect(stakeInfo.validatorStake).toBe(expectedEachStake);
      console.log('Dual-role stake info verified');

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

      // Create and register a miner
      const minerWallet = manager.createWallet();
      const initialStake = '1000000';

      console.log(`Initial registration with stake: ${initialStake}`);
      const initialResult = await manager.registerAsMiner(node, minerWallet.address, initialStake);
      expect(initialResult.success).toBe(true);

      // Verify initial stake
      let stakeInfo = await manager.getStakeInfo(node, minerWallet.address);
      expect(stakeInfo.minerStake).toBe(initialStake);
      console.log(`Initial stake verified: ${stakeInfo.minerStake}`);

      // Update stake to higher amount
      const updatedStake = '3000000';
      console.log(`Updating stake to: ${updatedStake}`);

      const updateResult = await manager.registerAsMiner(node, minerWallet.address, updatedStake);
      expect(updateResult.success).toBe(true);
      expect(updateResult.minerStake).toBe(updatedStake);

      // Verify updated stake
      stakeInfo = await manager.getStakeInfo(node, minerWallet.address);
      expect(stakeInfo.minerStake).toBe(updatedStake);
      console.log(`Updated stake verified: ${stakeInfo.minerStake}`);

    }, 60000);

    it('should add validator role to existing miner', async () => {
      const BLOCK_TIME = '2s';

      console.log('\n=== Starting role addition test ===');

      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        blockTime: BLOCK_TIME,
        minConnections: 0,
      });
      console.log('Node started');

      await manager.waitForBlockNumber(node, 1, 15000);

      // Create and register as miner first
      const wallet = manager.createWallet();
      const minerStake = '2000000';
      const validatorStake = '1500000';

      console.log('Registering as miner...');
      let result = await manager.registerAsMiner(node, wallet.address, minerStake);
      expect(result.success).toBe(true);
      expect(result.isMiner).toBe(true);
      expect(result.isValidator).toBeFalsy(); // Can be false or undefined due to omitempty

      let stakeInfo = await manager.getStakeInfo(node, wallet.address);
      expect(stakeInfo.isMiner).toBe(true);
      expect(stakeInfo.isValidator).toBe(false);
      console.log('Registered as miner');

      // Now add validator role (keeps miner role)
      console.log('Adding validator role...');
      result = await manager.registerAsValidator(node, wallet.address, validatorStake);
      expect(result.success).toBe(true);
      expect(result.isMiner).toBe(true); // Should still be miner
      expect(result.isValidator).toBe(true); // Now also validator

      stakeInfo = await manager.getStakeInfo(node, wallet.address);
      expect(stakeInfo.isMiner).toBe(true);
      expect(stakeInfo.isValidator).toBe(true);
      expect(stakeInfo.minerStake).toBe(minerStake);
      expect(stakeInfo.validatorStake).toBe(validatorStake);
      console.log('Validator role added successfully');

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

      // Get initial counts (there should be at least one miner from node startup)
      let info = await manager.getBlockchainInfo(node);
      const initialMiners = info.activeMiners;
      const initialValidators = info.activeValidators;
      console.log(`Initial state - Miners: ${initialMiners}, Validators: ${initialValidators}`);

      // Register new miners
      const numNewMiners = 2;
      for (let i = 0; i < numNewMiners; i++) {
        const wallet = manager.createWallet();
        const result = await manager.registerAsMiner(node, wallet.address, '1000000');
        expect(result.success).toBe(true);
        console.log(`Registered miner ${i + 1}`);
      }

      // Register new validators
      const numNewValidators = 2;
      for (let i = 0; i < numNewValidators; i++) {
        const wallet = manager.createWallet();
        const result = await manager.registerAsValidator(node, wallet.address, '1000000');
        expect(result.success).toBe(true);
        console.log(`Registered validator ${i + 1}`);
      }

      // Wait a bit for state to settle
      await manager.sleep(1000);

      // Check updated counts
      info = await manager.getBlockchainInfo(node);
      console.log(`Final state - Miners: ${info.activeMiners}, Validators: ${info.activeValidators}`);

      // Verify miners increased
      expect(info.activeMiners).toBeGreaterThanOrEqual(initialMiners + numNewMiners);
      console.log(`Active miners increased from ${initialMiners} to ${info.activeMiners}`);

      // Verify validators increased
      expect(info.activeValidators).toBeGreaterThanOrEqual(initialValidators + numNewValidators);
      console.log(`Active validators increased from ${initialValidators} to ${info.activeValidators}`);

    }, 60000);
  });
});
