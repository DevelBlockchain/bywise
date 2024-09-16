<p align="center">
  <img src="assets/bywise.png" width="300" alt="Bywise Web3" />
</p>

# Bywise Fullnode

Bywise is an enterprise-grade permissioned Distributed Ledger Technology (DLT), Blockchain for developing solutions and applications. Its modular and versatile design suits a wide range of industry use cases. It offers a unique approach to consensus that enables performance at scale while preserving privacy.

| Describe         | URL                                 |
| ---------------- | ----------------------------------- |
| Mainnet          | https://node1.bywise.org            |
| Explorer         | https://explorer.bywise.org         |
| Testnet          | https://testnet-node1.bywise.org    |
| Explorer Testnet | https://testnet-explorer.bywise.org |

## Setup

### System Requirements
This system spec has been tested by many users and validators and found to be comfortable:

- Quad Core or larger AMD x64, Intel x64 and ARM CPUs like the Apple M1.
- 16GB RAM
- 200GB NVMe Storage
- 10MBPS bidirectional internet connection

You can run Bywise on lower-spec hardware for each component, but you may find that it is not highly performant or prone to crashing.

### Installation

1. Install `NodeJS v20` or newer, Install project dependencies:

```shell
npm install
npm run build
```

2. Create your wallet:

```shell
node dist/index.js -new-wallet
```

2. Make a copy of `.env.examples` and rename the copy to `.env`:

```shell
cp .env.example .env
```

3. Update the environment variables in `.env`. You will need the following:

```
PORT=8080
NODES="http://localhost:8081,http://localhost:8082,http://localhost:8083"
HOST="http://localhost:8080"
SEED="_____________YOUR_SEED______________"
TOKEN="__________RANDOM_STRING____________"
```

Key | Description
------------ | ------------
PORT | The http server port.
NODES | List of servers that the node will try to connect to. If your network does not already have other nodes, just leave it empty.
HOST | Public server address.
SEED | seed generated in the previous step.
TOKEN | A string of random characters for generating authentication encryption.

### Running

1. Create your local chain:

```shell
node dist/index.js -new-chain local
```

2. Run node:

```shell
node dist/index.js -log -chain local.json -start
```

