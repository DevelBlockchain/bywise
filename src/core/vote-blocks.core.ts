import { Block, Tx, TxType, Web3 } from "@bywise/web3";
import { CoreProvider } from "../services";
import helper from "../utils/helper";

export default class VoteBlocks {
    public isRun = true;
    private coreProvider;
    private blockHeight = -1;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        if (!this.coreProvider.isValidator || !this.coreProvider.hasMinimumBWSToMine) {
            return;
        }
        const mainWallet = await this.coreProvider.walletProvider.getMainWallet();
        const currentBlock = await this.coreProvider.blockTree.currentMinnedBlock;

        const blockTime = this.coreProvider.blockTime;
        const now = helper.getNow();
        const nextVote = currentBlock.created + blockTime / 2;

        if (now < nextVote) {
            return;
        }
        if (this.blockHeight >= currentBlock.height) {
            return;
        }
        this.blockHeight = currentBlock.height;

        const tx = new Tx();
        tx.version = '2';
        tx.chain = this.coreProvider.chain;
        tx.from = [mainWallet.address];
        tx.to = [mainWallet.address];
        tx.amount = ['0'];
        tx.fee = '0';
        tx.type = TxType.TX_BLOCKCHAIN_COMMAND;
        tx.data = {
            name: 'vote-block',
            input: [currentBlock.hash, currentBlock.height]
        };
        tx.foreignKeys = [];
        tx.created = Math.floor(Date.now() / 1000);
        tx.hash = tx.toHash();
        tx.sign = [await mainWallet.signHash(tx.hash)];
        await this.coreProvider.transactionsProvider.saveNewTransaction(tx);
        this.coreProvider.applicationContext.logger.info(`create vote in ${currentBlock.height}`);

        await this.makePOI(currentBlock);
    }

    async makePOI(block: Block) {
        if (block.chain === 'mainnet' || block.chain === 'testnet' || block.chain === 'local') {
            return;
        }
        const mainWallet = await this.coreProvider.walletProvider.getMainWallet();

        const web3 = new Web3({
            initialNodes: ['https://node1.bywise.org'],
        })

        const tx = new Tx();
        tx.version = '2';
        tx.chain = 'mainnet';
        tx.from = [mainWallet.address];
        tx.to = [mainWallet.address];
        tx.amount = ['0'];
        tx.fee = '0';
        tx.type = TxType.TX_BLOCKCHAIN_COMMAND;
        tx.data = {
            name: 'poi',
            input: [block.height, block.chain, block.hash]
        };
        tx.foreignKeys = [];
        tx.created = Math.floor(Date.now() / 1000);
        tx.hash = tx.toHash();
        tx.sign = [await mainWallet.signHash(tx.hash)];

        await web3.network.connect();
        try {
            await web3.transactions.sendTransactionSync(tx);
            this.coreProvider.applicationContext.logger.verbose(`create poi in ${block.height} - hash: ${tx.hash}`);
        } catch (err: any) {
            this.coreProvider.applicationContext.logger.error(`cant create poi in ${block.height} - error: ${err.message}`);
        }
    }
}