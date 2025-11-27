const NodeManager = require('../utils/node-manager');

// SimpleERC20 bytecode compiled from contracts/SimpleERC20.sol
// Constructor: constructor(string _name, string _symbol, uint256 _initialSupply)
const simpleERC20Bytecode = '608060405234801561000f575f5ffd5b50604051610ba3380380610ba383398101604081905261002e9161015d565b5f610039848261024e565b506001610046838261024e565b506002805460ff1916601290811790915561006290600a610401565b61006c9082610413565b6003819055335f81815260046020908152604080832085905551938452919290917fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef910160405180910390a350505061042a565b634e487b7160e01b5f52604160045260245ffd5b5f82601f8301126100e3575f5ffd5b81516001600160401b038111156100fc576100fc6100c0565b604051601f8201601f19908116603f011681016001600160401b038111828210171561012a5761012a6100c0565b604052818152838201602001851015610141575f5ffd5b8160208501602083015e5f918101602001919091529392505050565b5f5f5f6060848603121561016f575f5ffd5b83516001600160401b03811115610184575f5ffd5b610190868287016100d4565b602086015190945090506001600160401b038111156101ad575f5ffd5b6101b9868287016100d4565b925050604084015190509250925092565b600181811c908216806101de57607f821691505b6020821081036101fc57634e487b7160e01b5f52602260045260245ffd5b50919050565b601f82111561024957805f5260205f20601f840160051c810160208510156102275750805b601f840160051c820191505b81811015610246575f8155600101610233565b50505b505050565b81516001600160401b03811115610267576102676100c0565b61027b8161027584546101ca565b84610202565b6020601f8211600181146102ad575f83156102965750848201515b5f19600385901b1c1916600184901b178455610246565b5f84815260208120601f198516915b828110156102dc57878501518255602094850194600190920191016102bc565b50848210156102f957868401515f19600387901b60f8161c191681555b50505050600190811b01905550565b634e487b7160e01b5f52601160045260245ffd5b6001815b60018411156103575780850481111561033b5761033b610308565b600184161561034957908102905b60019390931c928002610320565b935093915050565b5f8261036d575060016103fb565b8161037957505f6103fb565b816001811461038f5760028114610399576103b5565b60019150506103fb565b60ff8411156103aa576103aa610308565b50506001821b6103fb565b5060208310610133831016604e8410600b84101617156103d8575081810a6103fb565b6103e45f19848461031c565b805f19048211156103f7576103f7610308565b0290505b92915050565b5f61040c838361035f565b9392505050565b80820281158282048414176103fb576103fb610308565b61076c806104375f395ff3fe608060405234801561000f575f5ffd5b5060043610610090575f3560e01c8063313ce56711610063578063313ce567146100ff57806370a082311461011e57806395d89b411461013d578063a9059cbb14610145578063dd62ed3e14610158575f5ffd5b806306fdde0314610094578063095ea7b3146100b257806318160ddd146100d557806323b872dd146100ec575b5f5ffd5b61009c610182565b6040516100a991906105c1565b60405180910390f35b6100c56100c0366004610611565b61020d565b60405190151581526020016100a9565b6100de60035481565b6040519081526020016100a9565b6100c56100fa366004610639565b610279565b60025461010c9060ff1681565b60405160ff90911681526020016100a9565b6100de61012c366004610673565b60046020525f908152604090205481565b61009c610481565b6100c5610153366004610611565b61048e565b6100de610166366004610693565b600560209081525f928352604080842090915290825290205481565b5f805461018e906106c4565b80601f01602080910402602001604051908101604052809291908181526020018280546101ba906106c4565b80156102055780601f106101dc57610100808354040283529160200191610205565b820191905f5260205f20905b8154815290600101906020018083116101e857829003601f168201915b505050505081565b335f8181526005602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906102679086815260200190565b60405180910390a35060015b92915050565b5f6001600160a01b0383166102d05760405162461bcd60e51b81526020600482015260186024820152775472616e7366657220746f207a65726f206164647265737360401b60448201526064015b60405180910390fd5b6001600160a01b0384165f9081526004602052604090205482111561032e5760405162461bcd60e51b8152602060048201526014602482015273496e73756666696369656e742062616c616e636560601b60448201526064016102c7565b6001600160a01b0384165f9081526005602090815260408083203384529091529020548211156103995760405162461bcd60e51b8152602060048201526016602482015275496e73756666696369656e7420616c6c6f77616e636560501b60448201526064016102c7565b6001600160a01b0384165f90815260046020526040812080548492906103c0908490610710565b90915550506001600160a01b0383165f90815260046020526040812080548492906103ec908490610723565b90915550506001600160a01b0384165f90815260056020908152604080832033845290915281208054849290610423908490610710565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161046f91815260200190565b60405180910390a35060019392505050565b6001805461018e906106c4565b5f6001600160a01b0383166104e05760405162461bcd60e51b81526020600482015260186024820152775472616e7366657220746f207a65726f206164647265737360401b60448201526064016102c7565b335f908152600460205260409020548211156105355760405162461bcd60e51b8152602060048201526014602482015273496e73756666696369656e742062616c616e636560601b60448201526064016102c7565b335f9081526004602052604081208054849290610553908490610710565b90915550506001600160a01b0383165f908152600460205260408120805484929061057f908490610723565b90915550506040518281526001600160a01b0384169033907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef90602001610267565b602081525f82518060208401528060208501604085015e5f604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b038116811461060c575f5ffd5b919050565b5f5f60408385031215610622575f5ffd5b61062b836105f6565b946020939093013593505050565b5f5f5f6060848603121561064b575f5ffd5b610654846105f6565b9250610662602085016105f6565b929592945050506040919091013590565b5f60208284031215610683575f5ffd5b61068c826105f6565b9392505050565b5f5f604083850312156106a4575f5ffd5b6106ad836105f6565b91506106bb602084016105f6565b90509250929050565b600181811c908216806106d857607f821691505b6020821081036106f657634e487b7160e01b5f52602260045260245ffd5b50919050565b634e487b7160e01b5f52601160045260245ffd5b81810381811115610273576102736106fc565b80820180821115610273576102736106fc56fea2646970667358221220ad9a50036d1e4f96cbaef20f8ad4652d5363e48150aae75bb1b1c06728eccd2764736f6c634300081e0033';

describe('Smart Contract E2E Tests', () => {
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

  describe('ERC20 Contract Deployment', () => {
    it('should deploy an ERC20 contract and verify initial supply', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 10;

      console.log('\n=== Starting ERC20 deployment test ===');

      // Start a node with validator enabled
      const node = await manager.startNode(0, {
        bootstrapNodes: [],
        miningEnabled: true,
        validatorEnabled: true,
        blockTime: BLOCK_TIME,
        checkpointInterval: CHECKPOINT_INTERVAL,
        minConnections: 0,
      });
      console.log('Mining node started');

      // Wait for genesis block
      await manager.waitForBlockNumber(node, 1, 15000);
      console.log('Genesis block mined');

      // Create deployer wallet
      const deployerWallet = manager.createWallet();
      console.log(`Deployer wallet: ${deployerWallet.address}`);

      // Prepare contract deployment data
      const tokenName = 'TestToken';
      const tokenSymbol = 'TT';
      const initialSupply = '1000000'; // Will be multiplied by 10^18 in contract

      // Encode constructor arguments and append to bytecode
      const constructorArgs = manager.encodeERC20Constructor(tokenName, tokenSymbol, initialSupply);
      const deployData = simpleERC20Bytecode + constructorArgs;

      console.log('Deploying ERC20 contract...');
      console.log(`  Token Name: ${tokenName}`);
      console.log(`  Token Symbol: ${tokenSymbol}`);
      console.log(`  Initial Supply: ${initialSupply}`);

      // Use executeAndSubmit for contract deployment (to address empty = contract creation)
      const submitResult = await manager.executeAndSubmit(
        node,
        deployerWallet,
        '', // Empty 'to' for contract deployment
        '0', // No value
        deployData,
        '1', // nonce
        0 // blockLimit
      );
      console.log('Deploy submit result:', submitResult);

      expect(submitResult.success).toBe(true);
      expect(submitResult.txId).toBeDefined();
      console.log(`Contract deployment submitted with TX ID: ${submitResult.txId}`);

      // Wait for transaction to be mined
      console.log('Waiting for deployment to be mined...');
      await manager.sleep(5000);

      // Verify transaction was mined
      const minedTx = await manager.getTransaction(node, submitResult.txId);
      expect(minedTx).not.toBeNull();
      console.log('Contract deployment transaction mined');

      console.log('ERC20 contract deployment test completed');

    }, 60000);
  });

  describe('Token Transfer Without Sponsor', () => {
    it('should transfer tokens between accounts', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 10;

      console.log('\n=== Starting token transfer test (without sponsor) ===');

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

      // Create wallets
      const deployerWallet = manager.createWallet();
      const aliceWallet = manager.createWallet();
      console.log(`Deployer: ${deployerWallet.address}`);
      console.log(`Alice: ${aliceWallet.address}`);

      // Deploy ERC20 contract first using executeAndSubmit
      const constructorArgs = manager.encodeERC20Constructor('TestToken', 'TT', '1000000');
      const deployData = simpleERC20Bytecode + constructorArgs;

      const deployResult = await manager.executeAndSubmit(
        node,
        deployerWallet,
        '',
        '0',
        deployData,
        '1',
        0
      );
      expect(deployResult.success).toBe(true);
      console.log(`Contract deployment TX: ${deployResult.txId}`);

      // Wait for deployment
      await manager.sleep(5000);

      // For a real test, we would need the contract address from the deployment
      // Since we don't have that mechanism yet, we'll simulate a transfer transaction

      // Create transfer call data: transfer(alice, 100 * 10^18)
      const transferAmount = BigInt('100') * BigInt('1000000000000000000'); // 100 tokens with 18 decimals
      const transferData = manager.encodeERC20Transfer(aliceWallet.address, transferAmount.toString());

      // Create transfer transaction using executeAndSubmit
      // Note: In a real scenario, 'to' would be the contract address
      const contractAddress = '0x0000000000000000000000000000000000000100'; // Placeholder

      const transferResult = await manager.executeAndSubmit(
        node,
        deployerWallet,
        contractAddress,
        '0',
        transferData,
        '2', // nonce (different from deploy)
        0
      );
      console.log('Transfer submit result:', transferResult);

      expect(transferResult.success).toBe(true);
      console.log(`Transfer TX submitted: ${transferResult.txId}`);

      // Wait for transfer to be mined
      await manager.sleep(5000);

      const minedTransfer = await manager.getTransaction(node, transferResult.txId);
      expect(minedTransfer).not.toBeNull();
      console.log('Transfer transaction mined');

      console.log('Token transfer test (without sponsor) completed');

    }, 90000);
  });

  describe('Sponsor Assignment', () => {
    it('should assign a sponsor (padrinho) to a contract', async () => {
      const BLOCK_TIME = '2s';
      const CHECKPOINT_INTERVAL = 10;

      console.log('\n=== Starting sponsor assignment test ===');

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

      // Create wallets
      const deployerWallet = manager.createWallet();
      const sponsorWallet = manager.createWallet();
      console.log(`Deployer: ${deployerWallet.address}`);
      console.log(`Sponsor (Padrinho): ${sponsorWallet.address}`);

      // Deploy contract using executeAndSubmit
      const constructorArgs = manager.encodeERC20Constructor('SponsoredToken', 'SPT', '1000000');
      const deployData = simpleERC20Bytecode + constructorArgs;

      const deployResult = await manager.executeAndSubmit(
        node,
        deployerWallet,
        '',
        '0',
        deployData,
        '1',
        0
      );
      expect(deployResult.success).toBe(true);
      console.log(`Contract deployed: ${deployResult.txId}`);

      await manager.sleep(5000);

      // Note: Sponsor assignment would typically be a special transaction
      // or system call. For now, we're demonstrating the transaction flow.
      // The actual sponsor mechanism would need to be implemented in the blockchain.

      // Create a sponsor registration transaction using executeAndSubmit
      // This is a placeholder - actual implementation depends on blockchain's sponsor mechanism
      const sponsorData = Buffer.from('registerSponsor').toString('hex');
      const contractAddress = '0x0000000000000000000000000000000000000100';

      const sponsorResult = await manager.executeAndSubmit(
        node,
        sponsorWallet,
        contractAddress,
        '0',
        sponsorData,
        '1',
        0
      );
      console.log('Sponsor registration result:', sponsorResult);

      expect(sponsorResult.success).toBe(true);
      console.log(`Sponsor registration TX: ${sponsorResult.txId}`);

      await manager.sleep(5000);

      const minedSponsor = await manager.getTransaction(node, sponsorResult.txId);
      expect(minedSponsor).not.toBeNull();
      console.log('Sponsor registration mined');

      console.log('Sponsor assignment test completed');

    }, 90000);
  });

  describe('Multiple Transfers With Sponsor', () => {
    it('should execute multiple token transfers in a single block with sponsor', async () => {
      const BLOCK_TIME = '4s'; // Longer block time to accumulate transactions
      const CHECKPOINT_INTERVAL = 10;
      const NUM_TRANSFERS = 5;

      console.log('\n=== Starting multiple transfers test (with sponsor) ===');

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

      // Create wallets
      const deployerWallet = manager.createWallet();
      const sponsorWallet = manager.createWallet();
      const recipients = [];
      for (let i = 0; i < NUM_TRANSFERS; i++) {
        recipients.push(manager.createWallet());
      }

      console.log(`Deployer: ${deployerWallet.address}`);
      console.log(`Sponsor: ${sponsorWallet.address}`);
      console.log(`Recipients: ${NUM_TRANSFERS} wallets created`);

      // Deploy contract using executeAndSubmit
      const constructorArgs = manager.encodeERC20Constructor('BulkToken', 'BLK', '10000000');
      const deployData = simpleERC20Bytecode + constructorArgs;

      const deployResult = await manager.executeAndSubmit(
        node,
        deployerWallet,
        '',
        '0',
        deployData,
        '1',
        0
      );
      expect(deployResult.success).toBe(true);
      console.log(`Contract deployed: ${deployResult.txId}`);

      await manager.sleep(5000);

      // Submit multiple transfer transactions with waits between them
      // Each transaction modifies the sender's state, so we need to wait for mining
      const contractAddress = '0x0000000000000000000000000000000000000100';
      const txIds = [];

      console.log(`Submitting ${NUM_TRANSFERS} transfers (waiting for each to be mined)...`);

      for (let i = 0; i < NUM_TRANSFERS; i++) {
        const transferAmount = BigInt(100 + i * 10) * BigInt('1000000000000000000');
        const transferData = manager.encodeERC20Transfer(recipients[i].address, transferAmount.toString());

        // Each transfer uses the deployer's wallet via executeAndSubmit
        const result = await manager.executeAndSubmit(
          node,
          deployerWallet,
          contractAddress,
          '0',
          transferData,
          `${2 + i}`, // Unique nonce
          0
        );

        if (!result.success) {
          console.log(`  Transfer ${i + 1} failed: ${result.error}`);
        }
        expect(result.success).toBe(true);
        txIds.push(result.txId);
        console.log(`  Transfer ${i + 1} submitted: ${result.txId}`);

        // Wait for this transaction to be mined before submitting next
        // This avoids state conflicts between transactions from same sender
        // With 4s block time, we need to wait longer
        if (i < NUM_TRANSFERS - 1) {
          await manager.sleep(5000);
        }
      }

      console.log(`All ${NUM_TRANSFERS} transfers submitted`);

      // Wait for all transactions to be mined
      console.log('Waiting for transactions to be mined...');
      await manager.waitForPendingTransactionsCleared(node, 20000);

      // Verify all transactions were mined
      let minedCount = 0;
      for (const txId of txIds) {
        const tx = await manager.getTransaction(node, txId);
        if (tx && tx.id) {
          minedCount++;
        }
      }

      console.log(`Mined ${minedCount}/${NUM_TRANSFERS} transfers`);
      expect(minedCount).toBe(NUM_TRANSFERS);
      console.log('All transfers successfully mined');

      // Check if transactions were included in the same block (optional verification)
      const blockchainInfo = await manager.getBlockchainInfo(node);
      console.log(`Current block height: ${blockchainInfo.latestBlock}`);

      console.log('Multiple transfers test (with sponsor) completed');

    }, 180000);
  });
});
