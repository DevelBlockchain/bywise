# go-bywise

Go implementation of the Bywise blockchain protocol - a high-performance Proof-of-Stake blockchain with delegated execution and state validation.

## Features

### Blockchain Core
- **Proof-of-Stake Consensus**: Weighted Sortition for miner selection based on stake
- **Delegated Execution**: Validators execute transactions, miners verify state consistency
- **Transaction Read/Write Sets**: Pre-computed state dependencies for parallel validation
- **Full EVM Implementation**: Complete Ethereum Virtual Machine for smart contract execution
- **Checkpoints**: Periodic state snapshots stored on IPFS for fast synchronization
- **LevelDB Storage**: Efficient key-value storage for blockchain state

### Network Layer
- **P2P Network**: gRPC-based peer-to-peer communication with TLS encryption
- **Auto-discovery**: Automatic peer discovery from bootstrap nodes
- **Authentication**: Token-based authentication for authenticated RPC calls
- **Rate Limiting**: Per-peer rate limiting with automatic banning of misbehaving nodes

### Wallet
- **Ethereum-compatible**: secp256k1 keys, Keccak-256 hashing, standard address derivation
- **Message Signing**: Support for `personal_sign` format signatures

## Project Structure

```
go-bywise/
├── src/
│   ├── main.go              # CLI entry point
│   ├── api/                 # HTTP API server
│   │   ├── api.go           # Core API routes & server management
│   │   ├── blockchain.go    # Blockchain endpoints
│   │   └── validator.go     # Validator execution endpoints
│   ├── config/              # Configuration management
│   │   └── config.go
│   ├── core/                # Blockchain core types
│   │   ├── types.go         # Hash, Address, BigInt
│   │   ├── statekey.go      # State key management
│   │   ├── transaction.go   # Transaction structure
│   │   ├── block.go         # Block structure & genesis
│   │   └── account.go       # Account and stake info
│   ├── executor/            # EVM execution engine
│   │   ├── evm.go           # Ethereum Virtual Machine
│   │   ├── memory.go        # EVM memory management
│   │   ├── stack.go         # EVM stack operations
│   │   └── state.go         # State database interface
│   ├── storage/             # LevelDB storage layer
│   │   └── storage.go       # State persistence
│   ├── miner/               # Mining and consensus
│   │   └── miner.go         # Weighted Sortition miner
│   ├── checkpoint/          # State checkpoints
│   │   ├── tson.go          # TSON format encoder
│   │   └── checkpoint.go    # IPFS checkpoint manager
│   ├── wallet/              # Ethereum-compatible wallet
│   │   └── wallet.go        # Key management & signing
│   ├── network/             # P2P network layer
│   │   ├── network.go       # Network manager
│   │   ├── peer.go          # Peer management
│   │   ├── server.go        # gRPC server
│   │   ├── blockchain_server.go  # Blockchain message handler
│   │   ├── discovery.go     # Peer discovery protocol
│   │   └── rate_limiter.go  # Per-peer rate limiting
│   ├── crypto/              # Cryptographic utilities
│   │   └── tls.go           # TLS certificate management
│   └── proto/               # Protocol Buffers definitions
│       ├── network.proto    # gRPC service definitions
│       └── pb/              # Generated protobuf code
├── e2e-tests/               # End-to-end tests (Node.js/Jest)
│   ├── tests/               # Test suites
│   ├── utils/               # Test utilities
│   └── package.json
├── contracts/               # Smart contract files (for testing)
├── config.example.json      # Example configuration
└── README.md
```

## Quick Start

### Build

```bash
go build -o bywise ./src
```

### CLI Commands

```bash
./bywise init [config.json]     # Initialize configuration file with defaults
./bywise start [config.json]    # Start the blockchain node
./bywise wallet <command>       # Wallet management commands
./bywise config <command>       # Configuration management commands
./bywise blockchain <command>   # Blockchain management commands
./bywise version                # Show version information
./bywise help [command]         # Display help message
```

### Wallet Commands

```bash
./bywise wallet create [path]              # Create a new wallet
./bywise wallet info <path>                # Show wallet information
./bywise wallet import <private-key> [path] # Import wallet from private key
```

### Config Commands

```bash
./bywise config validate <path>            # Validate configuration file
./bywise config show <path>                # Show configuration details
./bywise config set-auth <path> <user> <pass> # Enable API authentication
./bywise config gen-password               # Generate a secure random password
```

### Blockchain Commands

```bash
./bywise blockchain init <config.json>     # Initialize a new blockchain with genesis block
./bywise blockchain info <config.json>     # Show blockchain information
./bywise blockchain export <config.json> <output.json> # Export blockchain data
```

## Configuration

See [config.example.json](config.example.json) for a complete example.

### Key Configuration Options

| Option | Description |
|--------|-------------|
| `nodeId` | Unique node identifier (auto-generated if empty) |
| `bootstrapNodes` | Initial nodes to connect for peer discovery |
| `discovery.enabled` | Enable automatic peer discovery |
| `discovery.interval` | Interval between discovery queries (e.g., "30s") |
| `connection.minConnections` | Minimum number of peers to maintain |
| `connection.maxConnections` | Maximum number of peers allowed |
| `connection.connectionTimeout` | Timeout for new connections |
| `rateLimit.enabled` | Enable per-peer rate limiting |
| `rateLimit.requestsPerSecond` | Max requests per second per peer |
| `rateLimit.banDuration` | Duration to ban misbehaving peers |
| `server.host` | gRPC server bind address |
| `server.port` | gRPC port to listen on |
| `tls.autoGenerate` | Auto-generate TLS certificates |
| `api.enabled` | Enable HTTP API |
| `api.host` | HTTP API bind address |
| `api.port` | HTTP API port |
| `api.auth.enabled` | Enable API authentication (Basic Auth) |
| `api.auth.username` | Username for API authentication |
| `api.auth.password` | Password for API authentication |
| `wallet.path` | Path to wallet file |
| `wallet.privateKey` | Private key (overrides path if set) |
| `blockchain.dataDir` | Directory for blockchain data |
| `blockchain.miningEnabled` | Enable mining on this node |
| `blockchain.validatorEnabled` | Enable validator mode |
| `blockchain.blockTime` | Target block time (default: "5s") |
| `blockchain.checkpointInterval` | Blocks between checkpoints (default: 50000) |

## HTTP API

### Public Endpoints (No Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API metadata and available endpoints |
| `/health` | GET | Health status (healthy/degraded based on peer count) |
| `/auth/status` | GET | Check authentication status and requirements |
| `/wallet` | GET | Wallet HTML interface for interacting with the blockchain |

### Network Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/info` | GET | Node information (ID, address, peer count, uptime) |
| `/peers` | GET | Connected peers with connection details |

### Blockchain Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/blockchain/info` | GET | Blockchain status (latest block, active validators/miners) |
| `/blockchain/block` | GET | Get block by `number`, `hash`, or `latest` |
| `/blockchain/blocks` | GET | Get block range with `from`, `to`, `limit` params |
| `/blockchain/tx` | GET | Get transaction by `id` |
| `/blockchain/tx/submit` | POST | Submit a transaction to the mempool |
| `/blockchain/account` | GET | Get account info by `address` |
| `/blockchain/stake` | GET | Get stake info by `address` |
| `/blockchain/stake/register` | POST | Register as miner or validator with stake |
| `/miner/info` | GET | Miner statistics |
| `/miner/pending` | GET | Pending transactions (up to 100) |

### Validator Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/validator/info` | GET | Validator status (address, stake, active) |
| `/validator/execute` | POST | Execute transaction and get ReadSet/WriteSet |
| `/validator/simulate` | POST | Simulate transaction without signature |
| `/validator/sign` | POST | Sign transaction as validator |

## Architecture

### Bywise Protocol Design

The Bywise protocol prioritizes TPS (Transactions Per Second) by removing execution bottlenecks from the consensus layer. Transactions are **stateless and self-contained** - they can be validated in isolation without external state access.

**Two-Layer Consensus Model:**

1. **Validators (Executors)**: Execute transactions in the EVM, generate ReadSet (inputs with values) and WriteSet (outputs), and sign as "sponsors". Slashed if they submit invalid execution.

2. **Miners (Orderers)**: Don't execute smart contracts. They order transactions, verify ReadSet matches current state, produce blocks, and create checkpoints.

### Transaction Flow

```
1. User → Validator: Send transaction proposal (To, Value, Data, Nonce)
2. Validator: Execute in EVM, generate ReadSet and WriteSet
3. Validator → User: Return populated transaction structure
4. User: Sign the complete transaction
5. User → Validator: Send back signature
6. Validator: Add validator signature, propagate to network
7. Miner: Verify ReadSet, include in block
```

### Consensus: Weighted Sortition

All nodes calculate the miner priority for the next block based on:
```
Priority = Hash(LastBlockHash + MinerAddress) × Stake
```

Higher stake increases selection probability while maintaining randomization.

### State Keys

State is organized with typed prefixes:
- `0x01`: Account data (balance, nonce)
- `0x02`: Contract storage slots
- `0x03`: Contract code
- `0x04`: Stake information
- `0x05`: Wallet configuration

### Checkpoints

Every 50,000 blocks (configurable), a checkpoint is created:
1. Export state to TSON (Typed JSON) format
2. Upload to IPFS
3. Include CID and hash in block header
4. Other nodes validate by comparing local state hash

## Data Structures

### Primitive Types

```go
type Hash [32]byte      // Keccak256 hash (32 bytes)
type Address [20]byte   // Ethereum-compatible address (20 bytes)
type BigInt struct {    // Wraps math/big.Int for JSON serialization
    *big.Int
}
```

### Transaction

```go
type Transaction struct {
    // ID: Keccak256 hash of complete transaction
    ID Hash

    // User Proposal (signed by user before sending to validator)
    Validator  Address       // Validator chosen to execute
    From       Address       // Sender
    To         Address       // Recipient (empty = contract creation)
    Value      *BigInt       // Amount to transfer
    Nonce      *BigInt       // Replay protection
    BlockLimit uint64        // Max block number for inclusion (0 = no limit)
    Data       []byte        // EVM call data
    UserSig    []byte        // User signature

    // Execution Evidence (filled by Validator)
    SequenceID   uint64              // Ordering for sponsored contracts
    ReadSet      map[string][]byte   // Input: keys AND values read during execution
    WriteSet     map[string][]byte   // Output: state changes (key -> new value)
    ValidatorSig []byte              // Validator signature
}
```

### Block

```go
type BlockHeader struct {
    Number         uint64    // Block height
    PreviousHash   Hash      // Previous block hash
    Timestamp      int64     // Unix timestamp
    MinerAddress   Address   // Who mined this block
    TxRoot         Hash      // Merkle root of transactions
    StateRoot      Hash      // Root hash of state after all txs
    CheckpointCID  string    // IPFS CID (checkpoint blocks only)
    CheckpointHash Hash      // TSON hash (checkpoint blocks only)
}

type Block struct {
    Header       BlockHeader
    Transactions []*Transaction
    MinerSig     []byte
}
```

### Account & Stake

```go
type Account struct {
    Address Address  // Account address
    Balance *BigInt  // Account balance
    Nonce   uint64   // Transaction counter
}

type StakeInfo struct {
    Address     Address  // Account address
    StakeAmount *BigInt  // Staked amount
    IsValidator bool     // Can execute transactions
    IsMiner     bool     // Can produce blocks
    Rewards     *BigInt  // Accumulated rewards
    SlashCount  uint64   // Number of slashing events
    IsActive    bool     // Currently active
}
```

## gRPC Protocol

The P2P layer uses gRPC with the following services:

**Peer Management:**
- `Handshake` - Initiate connection with authentication
- `GetPeers` - Discover peers for network expansion
- `Ping` - Keepalive mechanism
- `Disconnect` - Graceful connection close

**Blockchain Sync:**
- `BroadcastBlock` - Propagate new blocks
- `GetBlock` / `GetBlocks` - Request blocks by number or hash
- `GetLatestBlock` - Get chain tip

**Transaction:**
- `BroadcastTransaction` - Propagate transactions to miners

## Testing

### Unit Tests

```bash
go clean -testcache && go test ./src/... -timeout=30s
```

### E2E Tests

The E2E test suite uses Node.js with Jest:

```bash
cd e2e-tests
npm install
npm test
```

**Test Suites:**
| Test File | Purpose |
|-----------|---------|
| `blockchain.test.js` | Basic blockchain operations |
| `transaction.test.js` | Transaction lifecycle and validation |
| `smart-contract.test.js` | EVM contract deployment and execution |
| `staking.test.js` | Stake registration and miner/validator ops |
| `multi-miner.test.js` | Multi-node mining consensus |
| `network-discovery.test.js` | P2P peer discovery and connectivity |

## Security

- **TLS Encryption**: All P2P connections use TLS 1.2+ (auto-generated or custom certs)
- **Token Authentication**: Unique tokens per peer connection
- **Rate Limiting**: Token bucket algorithm per peer with automatic banning
- **Slashing**: Fraudulent validators lose 100% of stake
- **Wallet Security**: Files stored with 0600 permissions

## License

MIT
