// deploy_BSTSupplyChain.ts
import { BywiseHelper, Tx, TxType, Wallet, Web3 } from "@bywise/web3";
import * as fs from "fs";

const chain = 'local';
const web3 = new Web3({
    initialNodes: ["http://localhost:8080"]
});

const SupplyChainCode = fs.readFileSync('./BSTSupplyChain/BSTSupplyChain.js', 'utf8');

// Change to your own SEED 
const seed = "fossil tool course letter negative eight scheme blur soccer hundred govern abandon";
const wallet = new Wallet({ seed });

const waitSend = async (tx: Tx): Promise<void> => {
    while (true) {
        const output = await web3.transactions.getTransactionByHash(tx.hash);
        if (output && output.status !== 'mempool') {
            return;
        }
        await BywiseHelper.sleep(100);
    }
}

const main = async (): Promise<void> => {
    await web3.network.tryConnection();

    const contractAddress = BywiseHelper.getBWSAddressContract();

    const tx = await web3.transactions.buildSimpleTx(
        wallet,
        chain,
        wallet.address,
        '0',
        TxType.TX_CONTRACT,
        { contractAddress, code: SupplyChainCode }
    );

    console.log("Deploying BSTSupplyChain contract at address", contractAddress);
    const output = await web3.transactions.sendTransaction(tx);
    console.log('sendTransaction', tx.hash, output);
    await waitSend(tx);

    console.log("BSTSupplyChain contract deployed at:", contractAddress);
}

main().catch(err => console.error(err));
