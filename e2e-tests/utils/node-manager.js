const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { keccak256 } = require('ethereum-cryptography/keccak');
const secp256k1 = require('ethereum-cryptography/secp256k1');

class NodeManager {
  constructor() {
    this.nodes = [];
    this.baseGrpcPort = 20000;
    this.baseApiPort = 21000;
    this.configDir = path.join(__dirname, '..', 'temp-configs');
    this.binaryPath = path.join(__dirname, '..', '..', 'bywise');
  }

  async buildBinary() {
    return new Promise((resolve, reject) => {
      const build = spawn('go', ['build', '-o', this.binaryPath, './src'], {
        cwd: path.join(__dirname, '..', '..'),
      });

      let stderr = '';
      build.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      build.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Build failed: ${stderr}`));
        }
      });
    });
  }

  async startNode(index, options = {}) {
    const {
      bootstrapNodes = [],
      maxConnections = 3,
      minConnections = 1,
      discoveryEnabled = true,
      discoveryInterval = '2s',
      // Blockchain options
      miningEnabled = false,
      validatorEnabled = false,
      blockTime = '5s',
      checkpointInterval = 50000,
      dataDir = null,
      // Stake amounts (defaults to minimum required)
      minerStake = '1000000',
      validatorStake = '1000000',
    } = options;

    const grpcPort = this.baseGrpcPort + index;
    const apiPort = this.baseApiPort + index;

    // Create config directory
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // Determine data directory
    const nodeDataDir = dataDir || path.join(this.configDir, `data-${index}`);

    // Create config file
    const config = {
      nodeId: `node-${index}`,
      bootstrapNodes: bootstrapNodes.map((addr) => ({ address: addr })),
      discovery: {
        enabled: discoveryEnabled,
        interval: discoveryInterval,
        maxPeersToAsk: 5,
        maxPeersPerQuery: 10,
      },
      connection: {
        minConnections,
        maxConnections,
        connectionTimeout: '5s',
        handshakeTimeout: '3s',
        reconnectInterval: '5s',
        maxReconnectAttempts: 3,
      },
      rateLimit: {
        enabled: true,
        requestsPerSecond: 100,
        burstSize: 200,
        banDuration: '1m',
        maxInvalidRequests: 10,
      },
      server: {
        host: '127.0.0.1',
        port: grpcPort,
      },
      tls: {
        certFile: path.join(this.configDir, `certs-${index}`, 'server.crt'),
        keyFile: path.join(this.configDir, `certs-${index}`, 'server.key'),
        autoGenerate: true,
      },
      api: {
        enabled: true,
        host: '127.0.0.1',
        port: apiPort,
      },
      wallet: {
        path: path.join(this.configDir, `wallet-${index}.json`),
      },
      blockchain: {
        dataDir: nodeDataDir,
        blockTime: blockTime,
        checkpointInterval: checkpointInterval,
        // Note: Mining/validator roles are now auto-detected based on stake
      },
    };

    const configPath = path.join(this.configDir, `config-${index}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Initialize blockchain if this node needs mining/validation capability
    // This sets up the genesis block with initial stake
    if (miningEnabled || validatorEnabled) {
      await this.initializeBlockchain(configPath);
    }

    // Start node
    const proc = spawn(this.binaryPath, ['start', configPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const node = {
      index,
      process: proc,
      grpcPort,
      apiPort,
      grpcAddress: `127.0.0.1:${grpcPort}`,
      apiUrl: `http://127.0.0.1:${apiPort}`,
      configPath,
      dataDir: nodeDataDir,
      logs: [],
    };

    proc.stdout.on('data', (data) => {
      node.logs.push(data.toString());
    });

    proc.stderr.on('data', (data) => {
      node.logs.push(data.toString());
    });

    this.nodes.push(node);

    // Wait for node to start
    await this.waitForNodeReady(node);

    return node;
  }

  // Initialize blockchain with genesis block and initial stake
  async initializeBlockchain(configPath) {
    return new Promise((resolve, reject) => {
      const init = spawn(this.binaryPath, ['blockchain', 'init', configPath, '--yes'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';
      let stdout = '';
      init.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      init.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      init.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Init failed (code ${code}): ${stderr || stdout || 'no output'}\nCommand: ${this.binaryPath} blockchain init ${configPath} --yes`));
        }
      });

      init.on('error', (err) => {
        reject(new Error(`Failed to spawn init process: ${err.message}\nBinary path: ${this.binaryPath}`));
      });
    });
  }

  async waitForNodeReady(node, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const response = await axios.get(`${node.apiUrl}/health`, {
          timeout: 1000,
        });
        if (response.status === 200) {
          return;
        }
      } catch (e) {
        // Node not ready yet
      }
      await this.sleep(200);
    }
    throw new Error(`Node ${node.index} failed to start within ${timeout}ms`);
  }

  async getNodeInfo(node) {
    const response = await axios.get(`${node.apiUrl}/info`);
    return response.data;
  }

  async getNodePeers(node) {
    const response = await axios.get(`${node.apiUrl}/peers`);
    return response.data;
  }

  async getNodeHealth(node) {
    const response = await axios.get(`${node.apiUrl}/health`);
    return response.data;
  }

  // Blockchain API methods
  async getBlockchainInfo(node) {
    try {
      const response = await axios.get(`${node.apiUrl}/blockchain/info`);
      return response.data;
    } catch (e) {
      return null;
    }
  }

  async getBlock(node, number) {
    try {
      const response = await axios.get(`${node.apiUrl}/blockchain/block?number=${number}`);
      return response.data;
    } catch (e) {
      return null;
    }
  }

  async getLatestBlock(node) {
    try {
      const response = await axios.get(`${node.apiUrl}/blockchain/block`);
      return response.data;
    } catch (e) {
      return null;
    }
  }

  async waitForBlockNumber(node, targetBlock, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const info = await this.getBlockchainInfo(node);
      if (info && info.latestBlock >= targetBlock) {
        return info.latestBlock;
      }
      await this.sleep(500);
    }
    const info = await this.getBlockchainInfo(node);
    return info ? info.latestBlock : 0;
  }

  async stopNode(node) {
    return new Promise((resolve) => {
      if (node.process && !node.process.killed) {
        let resolved = false;
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            if (!node.process.killed) {
              node.process.kill('SIGKILL');
            }
            resolve();
          }
        }, 5000);

        node.process.on('close', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            resolve();
          }
        });
        node.process.kill('SIGTERM');
      } else {
        resolve();
      }
    });
  }

  async stopAllNodes() {
    // Copy node list before cleanup
    const nodesToClean = [...this.nodes];
    await Promise.all(this.nodes.map((node) => this.stopNode(node)));
    this.nodes = [];
    // Clean up node data directories to allow reinitialization
    for (const node of nodesToClean) {
      if (node.dataDir && fs.existsSync(node.dataDir)) {
        fs.rmSync(node.dataDir, { recursive: true, force: true });
      }
    }
  }

  cleanup() {
    // Clean up config directory
    if (fs.existsSync(this.configDir)) {
      fs.rmSync(this.configDir, { recursive: true, force: true });
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForConnections(node, minConnections, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const info = await this.getNodeInfo(node);
      if (info.connectedPeers >= minConnections) {
        return info.connectedPeers;
      }
      await this.sleep(500);
    }
    const info = await this.getNodeInfo(node);
    return info.connectedPeers;
  }

  getNodeLogs(node) {
    return node.logs.join('');
  }

  // Transaction-related methods
  async submitTransaction(node, tx) {
    try {
      const response = await axios.post(`${node.apiUrl}/blockchain/tx/submit`, tx);
      return response.data;
    } catch (e) {
      if (e.response) {
        return e.response.data;
      }
      throw e;
    }
  }

  async getTransaction(node, txId) {
    try {
      const response = await axios.get(`${node.apiUrl}/blockchain/tx?id=${txId}`);
      return response.data;
    } catch (e) {
      return null;
    }
  }

  async getPendingTransactions(node) {
    try {
      const response = await axios.get(`${node.apiUrl}/miner/pending`);
      return response.data;
    } catch (e) {
      return null;
    }
  }

  async getMinerInfo(node) {
    try {
      const response = await axios.get(`${node.apiUrl}/miner/info`);
      return response.data;
    } catch (e) {
      return null;
    }
  }

  // Wallet utilities for creating signed transactions
  createWallet() {
    const privateKey = secp256k1.secp256k1.utils.randomPrivateKey();
    const publicKey = secp256k1.secp256k1.getPublicKey(privateKey, false);
    const addressBytes = keccak256(publicKey.slice(1)).slice(-20);
    const address = '0x' + Buffer.from(addressBytes).toString('hex');
    return {
      privateKey: Buffer.from(privateKey).toString('hex'),
      publicKey: Buffer.from(publicKey).toString('hex'),
      address: address,
    };
  }

  // Get node wallet address from API
  async getNodeWalletAddress(node) {
    const info = await this.getNodeInfo(node);
    return info.walletAddress;
  }

  // Create and sign a transaction
  // This follows the Bywise 2-step protocol:
  // 1. User signs proposal first: hash(validator, from, to, value, nonce, blockLimit, data)
  // 2. Validator executes and signs: hash(userProposalHash, userSig, sequenceId, readSet, writeSet)
  createSignedTransaction(fromWallet, toAddress, value, data, validatorWallet, sequenceId = 0, readSet = {}, writeSet = {}, nonce = '0', blockLimit = 0) {
    // Normalize addresses to 20-byte hex without prefix
    const normalizeAddress = (addr) => {
      if (!addr || addr === '') {
        return '0000000000000000000000000000000000000000'; // Zero address for contract creation
      }
      if (addr.startsWith('0x')) {
        return addr.slice(2).toLowerCase();
      }
      return addr.toLowerCase();
    };

    const fromAddr = normalizeAddress(fromWallet.address);
    const toAddr = normalizeAddress(toAddress);
    const validatorAddr = normalizeAddress(validatorWallet.address);

    // Build bytes for all fields
    const validatorAddrBytes = Buffer.from(validatorAddr, 'hex');
    const fromBytes = Buffer.from(fromAddr, 'hex');
    const toBytes = Buffer.from(toAddr, 'hex'); // Will be 20 zero bytes for contract creation

    // Value as big-endian bytes
    let valueBytes = Buffer.alloc(0);
    if (value && value !== '0') {
      const valueBigInt = BigInt(value);
      const hexValue = valueBigInt.toString(16);
      const paddedHex = hexValue.length % 2 === 0 ? hexValue : '0' + hexValue;
      valueBytes = Buffer.from(paddedHex, 'hex');
    }

    // Nonce as big-endian bytes
    let nonceBytes = Buffer.alloc(0);
    if (nonce && nonce !== '0') {
      const nonceBigInt = BigInt(nonce);
      const hexNonce = nonceBigInt.toString(16);
      const paddedHex = hexNonce.length % 2 === 0 ? hexNonce : '0' + hexNonce;
      nonceBytes = Buffer.from(paddedHex, 'hex');
    }

    // BlockLimit as 8-byte big-endian
    const blockLimitBytes = Buffer.alloc(8);
    blockLimitBytes.writeBigUInt64BE(BigInt(blockLimit));

    // Data bytes
    const dataBytes = data ? Buffer.from(data, 'hex') : Buffer.alloc(0);

    // 1. User signing hash (the proposal)
    // hash(validator + from + to + value + nonce + blockLimit + data)
    const userSigningData = Buffer.concat([
      validatorAddrBytes, fromBytes, toBytes, valueBytes, nonceBytes, blockLimitBytes, dataBytes
    ]);
    const userSigningHash = keccak256(userSigningData);

    // Sign as user first (new 2-step flow)
    const userPrivKey = Buffer.from(fromWallet.privateKey, 'hex');
    const userSigObj = secp256k1.secp256k1.sign(userSigningHash, userPrivKey);
    const userSig = Buffer.concat([
      userSigObj.toCompactRawBytes(),
      Buffer.from([userSigObj.recovery])
    ]);

    // SequenceID as 8-byte big-endian
    const seqBytes = Buffer.alloc(8);
    seqBytes.writeBigUInt64BE(BigInt(sequenceId));

    // ReadSet (sorted by key) - now a map with values
    const readSortedKeys = Object.keys(readSet).sort();
    let readSetBytes = Buffer.alloc(0);
    for (const key of readSortedKeys) {
      const keyBuffer = Buffer.from(key);
      const valueBuffer = Buffer.from(readSet[key], 'hex');
      readSetBytes = Buffer.concat([readSetBytes, keyBuffer, valueBuffer]);
    }

    // WriteSet (sorted by key)
    const writeSortedKeys = Object.keys(writeSet).sort();
    let writeSetBytes = Buffer.alloc(0);
    for (const key of writeSortedKeys) {
      const keyBuffer = Buffer.from(key);
      const valueBuffer = Buffer.from(writeSet[key], 'hex');
      writeSetBytes = Buffer.concat([writeSetBytes, keyBuffer, valueBuffer]);
    }

    // 2. Validator signing hash
    // hash(userProposalHash + userSig + sequenceId + readSet + writeSet)
    const validatorSigningData = Buffer.concat([
      Buffer.from(userSigningHash), userSig, seqBytes, readSetBytes, writeSetBytes
    ]);
    const validatorSigningHash = keccak256(validatorSigningData);

    // Sign as validator (after execution)
    const validatorPrivKey = Buffer.from(validatorWallet.privateKey, 'hex');
    const validatorSigObj = secp256k1.secp256k1.sign(validatorSigningHash, validatorPrivKey);
    const validatorSig = Buffer.concat([
      validatorSigObj.toCompactRawBytes(),
      Buffer.from([validatorSigObj.recovery])
    ]);

    // Build transaction request
    // For contract creation, send empty string for 'to'
    const toField = (!toAddress || toAddress === '') ? '' : '0x' + toAddr;

    return {
      validator: '0x' + validatorAddr,
      from: '0x' + fromAddr,
      to: toField,
      value: value || '0',
      nonce: nonce || '0',
      data: data || '',
      userSig: userSig.toString('hex'),
      sequenceId: sequenceId,
      readSet: readSet,  // Now a map (object), not an array
      writeSet: writeSet,
      validatorSig: validatorSig.toString('hex'),
    };
  }

  // Wait for a transaction to be mined (appear in a block)
  async waitForTransactionMined(node, txId, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const tx = await this.getTransaction(node, txId);
      if (tx && tx.id) {
        return tx;
      }
      await this.sleep(500);
    }
    return null;
  }

  // Wait for pending transactions to be cleared (mined)
  async waitForPendingTransactionsCleared(node, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const pending = await this.getPendingTransactions(node);
      if (pending && pending.count === 0) {
        return true;
      }
      await this.sleep(500);
    }
    return false;
  }

  // Validator API methods

  // Execute a transaction through the validator (returns ReadSet/WriteSet)
  async executeTransaction(node, from, to, value, data) {
    try {
      const response = await axios.post(`${node.apiUrl}/validator/execute`, {
        from: from,
        to: to || '',
        value: value || '0',
        data: data || '',
      });
      return response.data;
    } catch (e) {
      if (e.response) {
        return e.response.data;
      }
      throw e;
    }
  }

  // Simulate a transaction (no state changes)
  async simulateTransaction(node, from, to, value, data) {
    try {
      const response = await axios.post(`${node.apiUrl}/validator/simulate`, {
        from: from,
        to: to || '',
        value: value || '0',
        data: data || '',
      });
      return response.data;
    } catch (e) {
      if (e.response) {
        return e.response.data;
      }
      throw e;
    }
  }

  // Get validator info
  async getValidatorInfo(node) {
    try {
      const response = await axios.get(`${node.apiUrl}/validator/info`);
      return response.data;
    } catch (e) {
      return null;
    }
  }

  // Execute and submit a transaction in one flow
  // This handles the full 2-step flow:
  // 1. User signs proposal and sends to validator
  // 2. Validator executes, fills ReadSet/WriteSet, signs, and returns fully signed tx
  // 3. Submit to blockchain
  async executeAndSubmit(node, userWallet, to, value, data, nonce = '1', blockLimit = 0) {
    // Get validator info to know which validator will execute
    const validatorInfo = await this.getValidatorInfo(node);
    if (!validatorInfo) {
      return {
        success: false,
        error: 'Validator not available',
      };
    }
    const validatorAddress = validatorInfo.address;

    // Create user proposal signature
    // The user signs: keccak256(Validator + From + To + Value + Nonce + BlockLimit + Data)
    const userSig = this.signProposal(userWallet, validatorAddress, to, value, nonce, blockLimit, data);

    // Send proposal to validator for execution and signing
    const proposalResult = await this.processProposal(node, {
      from: userWallet.address,
      to: to || '',
      value: value || '0',
      nonce: nonce || '0',
      blockLimit: blockLimit || 0,
      data: data || '',
      userSig: userSig,
    });

    if (!proposalResult.success) {
      return {
        success: false,
        error: proposalResult.error || 'Proposal processing failed',
      };
    }

    // Build the fully signed transaction from the proposal result
    const tx = {
      validator: proposalResult.validator,
      from: userWallet.address,
      to: to || '',
      value: value || '0',
      nonce: nonce || '0',
      blockLimit: blockLimit || 0,
      data: data || '',
      userSig: userSig,
      sequenceId: proposalResult.sequenceId,
      readSet: proposalResult.readSet || {},
      writeSet: proposalResult.writeSet || {},
      validatorSig: proposalResult.validatorSig,
    };

    // Submit the fully signed transaction
    const submitResult = await this.submitTransaction(node, tx);

    return {
      success: submitResult.success,
      txId: submitResult.txId || proposalResult.txId,
      error: submitResult.error,
      contractAddr: proposalResult.contractAddr,
    };
  }

  // Sign a user proposal
  // Hash: keccak256(Validator + From + To + Value + Nonce + BlockLimit + Data)
  signProposal(userWallet, validatorAddress, to, value, nonce, blockLimit, data) {
    const normalizeAddress = (addr) => {
      if (!addr || addr === '') {
        return '0000000000000000000000000000000000000000';
      }
      if (addr.startsWith('0x')) {
        return addr.slice(2).toLowerCase();
      }
      return addr.toLowerCase();
    };

    const validatorAddr = normalizeAddress(validatorAddress);
    const fromAddr = normalizeAddress(userWallet.address);
    const toAddr = normalizeAddress(to);

    // Build the proposal hash
    const validatorAddrBytes = Buffer.from(validatorAddr, 'hex');
    const fromBytes = Buffer.from(fromAddr, 'hex');
    const toBytes = Buffer.from(toAddr, 'hex');

    // Value as big-endian bytes
    let valueBytes = Buffer.alloc(0);
    if (value && value !== '0') {
      const valueBigInt = BigInt(value);
      const hexValue = valueBigInt.toString(16);
      const paddedHex = hexValue.length % 2 === 0 ? hexValue : '0' + hexValue;
      valueBytes = Buffer.from(paddedHex, 'hex');
    }

    // Nonce as big-endian bytes
    let nonceBytes = Buffer.alloc(0);
    if (nonce && nonce !== '0') {
      const nonceBigInt = BigInt(nonce);
      const hexNonce = nonceBigInt.toString(16);
      const paddedHex = hexNonce.length % 2 === 0 ? hexNonce : '0' + hexNonce;
      nonceBytes = Buffer.from(paddedHex, 'hex');
    }

    // BlockLimit as 8-byte big-endian
    const blockLimitBytes = Buffer.alloc(8);
    blockLimitBytes.writeBigUInt64BE(BigInt(blockLimit || 0));

    // Data bytes
    const dataBytes = data ? Buffer.from(data, 'hex') : Buffer.alloc(0);

    // Build the signing hash
    const signingData = Buffer.concat([
      validatorAddrBytes, fromBytes, toBytes, valueBytes, nonceBytes, blockLimitBytes, dataBytes
    ]);
    const signingHash = keccak256(signingData);

    // Sign with user's private key
    const userPrivKey = Buffer.from(userWallet.privateKey, 'hex');
    const sigObj = secp256k1.secp256k1.sign(signingHash, userPrivKey);
    const sig = Buffer.concat([
      sigObj.toCompactRawBytes(),
      Buffer.from([sigObj.recovery])
    ]);

    return sig.toString('hex');
  }

  // Process a user-signed proposal through the validator
  async processProposal(node, proposal) {
    try {
      const response = await axios.post(`${node.apiUrl}/validator/proposal`, proposal);
      return response.data;
    } catch (e) {
      if (e.response) {
        return e.response.data;
      }
      throw e;
    }
  }

  // ERC20 helper methods

  // Encode ERC20 constructor arguments
  encodeERC20Constructor(name, symbol, initialSupply) {
    // ABI encoding for constructor(string, string, uint256)
    const padLeft = (hex, size) => {
      const s = hex.replace('0x', '');
      return '0'.repeat(Math.max(0, size * 2 - s.length)) + s;
    };

    const padRight = (hex, size) => {
      const s = hex.replace('0x', '');
      return s + '0'.repeat(Math.max(0, size * 2 - s.length));
    };

    const toHex = (str) => Buffer.from(str).toString('hex');
    const bigIntToHex = (n) => BigInt(n).toString(16);

    // Calculate offsets
    const nameOffset = 96; // 0x60 - after 3 params
    const nameLen = name.length;
    const namePaddedLen = Math.ceil(nameLen / 32) * 32 || 32;
    const symbolOffset = nameOffset + 32 + namePaddedLen;

    let result = '';

    // Param 1: offset to name
    result += padLeft(nameOffset.toString(16), 32);
    // Param 2: offset to symbol
    result += padLeft(symbolOffset.toString(16), 32);
    // Param 3: initialSupply
    result += padLeft(bigIntToHex(initialSupply), 32);

    // Name string data
    result += padLeft(nameLen.toString(16), 32);
    result += padRight(toHex(name), namePaddedLen);

    // Symbol string data
    const symbolLen = symbol.length;
    const symbolPaddedLen = Math.ceil(symbolLen / 32) * 32 || 32;
    result += padLeft(symbolLen.toString(16), 32);
    result += padRight(toHex(symbol), symbolPaddedLen);

    return result;
  }

  // Encode ERC20 transfer(address, uint256) call
  encodeERC20Transfer(toAddress, amount) {
    const selector = 'a9059cbb'; // transfer(address,uint256)
    const addr = toAddress.replace('0x', '').toLowerCase().padStart(64, '0');
    const value = BigInt(amount).toString(16).padStart(64, '0');
    return selector + addr + value;
  }

  // Encode ERC20 balanceOf(address) call
  encodeERC20BalanceOf(address) {
    const selector = '70a08231'; // balanceOf(address)
    const addr = address.replace('0x', '').toLowerCase().padStart(64, '0');
    return selector + addr;
  }

  // Encode ERC20 totalSupply() call
  encodeERC20TotalSupply() {
    return '18160ddd'; // totalSupply()
  }

  // Decode uint256 from hex return data
  decodeUint256(hexData) {
    const hex = hexData.replace('0x', '');
    return BigInt('0x' + hex).toString();
  }

  // Staking API methods

  // Register stake for an address (as miner, validator, or both)
  // Uses new API fields: minerStake and validatorStake
  async registerStake(node, address, options = {}) {
    const { minerStake = '0', validatorStake = '0' } = options;
    try {
      const response = await axios.post(`${node.apiUrl}/blockchain/stake/register`, {
        address: address,
        minerStake: minerStake.toString(),
        validatorStake: validatorStake.toString(),
        isMiner: minerStake !== '0' && minerStake !== 0,
        isValidator: validatorStake !== '0' && validatorStake !== 0,
      });
      return response.data;
    } catch (e) {
      if (e.response) {
        return e.response.data;
      }
      throw e;
    }
  }

  // Get stake info for an address
  async getStakeInfo(node, address) {
    try {
      const response = await axios.get(`${node.apiUrl}/blockchain/stake?address=${address}`);
      return response.data;
    } catch (e) {
      if (e.response && e.response.status === 404) {
        return null;
      }
      throw e;
    }
  }

  // Register as miner with stake
  async registerAsMiner(node, address, stakeAmount) {
    return this.registerStake(node, address, { minerStake: stakeAmount });
  }

  // Register as validator with stake
  async registerAsValidator(node, address, stakeAmount) {
    return this.registerStake(node, address, { validatorStake: stakeAmount });
  }

  // Register as both miner and validator with combined stake
  // The stake is split between miner and validator roles
  async registerAsMinerAndValidator(node, address, totalStake) {
    // Split stake equally between miner and validator roles
    const halfStake = (BigInt(totalStake) / 2n).toString();
    return this.registerStake(node, address, { minerStake: halfStake, validatorStake: halfStake });
  }

  // Get all active miners
  async getActiveMiners(node) {
    try {
      const info = await this.getBlockchainInfo(node);
      return info ? info.activeMiners : 0;
    } catch (e) {
      return 0;
    }
  }

  // Get all active validators
  async getActiveValidators(node) {
    try {
      const info = await this.getBlockchainInfo(node);
      return info ? info.activeValidators : 0;
    } catch (e) {
      return 0;
    }
  }
}

module.exports = NodeManager;
