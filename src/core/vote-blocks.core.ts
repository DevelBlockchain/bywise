import { Tx, TxType } from "@bywise/web3";
import { CoreProvider } from "../services";
import helper from "../utils/helper";
import { Task } from "../types";
import ExecuteTransactions from "./exec-transactions.core";

export default class VoteBlocks {
    private coreProvider;
    private blockHeight = -1;

    constructor(coreProvider: CoreProvider) {
        this.coreProvider = coreProvider;
    }

    async run() {
        if (!this.coreProvider.isValidator || !this.coreProvider.hasMinimumBWSToMine) {
            return false;
        }
        const mainWallet = this.coreProvider.applicationContext.mainWallet;
        const currentBlock = this.coreProvider.currentBlock;

        const blockTime = this.coreProvider.blockTime;
        const now = helper.getNow();
        const nextVote = currentBlock.created + blockTime / 2;

        if (now < nextVote) {
            return false;
        }
        if (this.blockHeight >= currentBlock.height) {
            return false;
        }
        this.blockHeight = currentBlock.height;

        const tx = new Tx();
        tx.version = '3';
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
        tx.output.ctx = this.coreProvider.currentSlice.hash;
        tx.hash = tx.toHash();
        tx.sign = [await mainWallet.signHash(tx.hash)];
        this.coreProvider.applicationContext.database.TransactionRepository.addMempool(tx);
        this.coreProvider.applicationContext.logger.info(`create vote in ${currentBlock.height} - context: ${tx.output.ctx.substring(0, 10)}...`);
        return true;
    }
}