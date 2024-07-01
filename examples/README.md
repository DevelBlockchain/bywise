# 🌟 Welcome to Bywise Smart Contracts Examples 🌟

Welcome to the Bywise Smart Contracts Examples repository! 🚀 Here, you'll find a collection of smart contracts tailored for the Bywise blockchain, along with deployment scripts to get you up and running in no time. Let's dive into each contract and learn how to deploy them! 🎉

## 📁 Folder Structure

- **BST20**: A standard ERC20 token contract.
- **BST721**: A standard ERC721 non-fungible token (NFT) contract.
- **BST1155**: A standard ERC1155 multi-token contract.
- **BSTSupplyChain**: A supply chain management contract using NFTs.

## 📋 Table of Contents

- [BST20 - Standard ERC20 Token](#bst20---standard-erc20-token)
- [BST721 - Standard ERC721 NFT](#bst721---standard-erc721-nft)
- [BST1155 - Standard ERC1155 Multi-Token](#bst1155---standard-erc1155-multi-token)
- [BSTSupplyChain - Supply Chain Management](#bstsupplychain---supply-chain-management)
- [Running the Deployment Scripts](#running-the-deployment-scripts)

## BST20 - Standard ERC20 Token

🪙 **BST20** is an ERC20 token contract, which represents a standard fungible token on the Bywise blockchain.

### How to Deploy:

1. **Navigate to the BST20 directory**:
   ```bash
   cd examples/BST20
   ```

2. **Run the deployment script using ts-node**:
   ```bash
   ts-node deploy_BST20.ts
   ```

## BST721 - Standard ERC721 NFT

🎨 **BST721** is an ERC721 token contract, perfect for creating unique non-fungible tokens (NFTs) on the Bywise blockchain.

### How to Deploy:

1. **Navigate to the BST721 directory**:
   ```bash
   cd examples/BST721
   ```

2. **Run the deployment script using ts-node**:
   ```bash
   ts-node deploy_BST721.ts
   ```

## BST1155 - Standard ERC1155 Multi-Token

🔀 **BST1155** is an ERC1155 multi-token contract, allowing the creation and management of both fungible and non-fungible tokens within a single contract.

### How to Deploy:

1. **Navigate to the BST1155 directory**:
   ```bash
   cd examples/BST1155
   ```

2. **Run the deployment script using ts-node**:
   ```bash
   ts-node deploy_BST1155.ts
   ```

## BSTSupplyChain - Supply Chain Management

🚚 **BSTSupplyChain** is a contract designed to track and manage products throughout the supply chain, ensuring transparency and authenticity.

### How to Deploy:

1. **Navigate to the BSTSupplyChain directory**:
   ```bash
   cd examples/BSTSupplyChain
   ```

2. **Run the deployment script using ts-node**:
   ```bash
   ts-node deploy_BSTSupplyChain.ts
   ```

## Running the Deployment Scripts

### Prerequisites

Make sure you have the following installed:
- Node.js (version 12 or higher)
- npm (version 6 or higher)
- ts-node

### Steps

1. **Install ts-node globally (if not already installed)**:
   ```bash
   npm install -g ts-node
   ```

2. **Navigate to the contract directory**:
   ```bash
   cd examples/<ContractDirectory>
   ```

3. **Run the script using ts-node**:
   ```bash
   ts-node deploy_<ContractName>.ts
   ```

Replace `<ContractDirectory>` and `<ContractName>` with the respective contract you are deploying.

## 🎉 Conclusion

And there you have it! Each of these contracts is ready to be deployed on the Bywise blockchain. Follow the steps above, and you'll be up and running in no time. If you have any questions or run into issues, feel free to reach out. Happy coding! 💻🎨
