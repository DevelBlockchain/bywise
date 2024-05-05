import fs from 'fs';
import { BlockPack, BywiseHelper, Tx, TxType, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { BlocksProvider, TransactionsProvider } from '../services';
import { WalletProvider } from '../services/wallet.service';
import helper from '../utils/helper';
import { ChainConfig } from '../types';
import { ConfigProvider } from '../services/configs.service';

var bywise: Bywise;
var transactionsProvider: TransactionsProvider;
var blocksProvider: BlocksProvider;
var walletProvider: WalletProvider;
var b0: BlockPack;

const chain = 'local';
const port0 = Math.floor(Math.random() * 7000 + 3000);
const wallet = new Wallet();

const ERCCode = fs.readFileSync('./assets/ERC20.js', 'utf8');

beforeAll(async () => {
    const nodeWallet = new Wallet();
    b0 = await helper.createNewBlockZero(chain, nodeWallet, [
        ChainConfig.setConfig('blockTime', `30`),
        ChainConfig.addAdmin(wallet.address),
        ChainConfig.addAdmin(nodeWallet.address),
        ChainConfig.addValidator(nodeWallet.address),
        ChainConfig.setBalance(nodeWallet.address, ConfigProvider.MIN_BWS_VALUE),
    ]);
    bywise = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [JSON.stringify(b0)],
        mainWalletSeed: wallet.seed,
        startServices: ['api'],
    });
    transactionsProvider = new TransactionsProvider(bywise.applicationContext);
    blocksProvider = new BlocksProvider(bywise.applicationContext);
    walletProvider = new WalletProvider(bywise.applicationContext);
}, 30000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
    await bywise.core.blockProvider.setNewZeroBlock(b0);
    await helper.sleep(500);
}, 60000)

afterAll(async () => {
    await bywise.stop();
}, 30000)

describe('basic tests', () => {

    test('create basic transation', async () => {
        const tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_NONE
        );
        tx.isValid();

        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;

        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        const output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('set balance', async () => {
        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;
        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_COMMAND,
            {
                name: "setBalance",
                input: [
                    wallet.address,
                    "100"
                ]
            }
        );
        tx.isValid();
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);

        let balance = await walletProvider.getWalletBalance(ctx.blockTree, ctx.block.hash, wallet.address);
        expect(balance.balance.toString()).toEqual('100');

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('add balance', async () => {
        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;
        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_COMMAND,
            {
                name: "addBalance",
                input: [
                    wallet.address,
                    "30"
                ]
            }
        );
        tx.isValid();
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);

        let balance = await walletProvider.getWalletBalance(ctx.blockTree, ctx.block.hash, wallet.address);
        expect(balance.balance.toString()).toEqual('60');

        await transactionsProvider.disposeContext(ctx);
    }), 30000;

    test('sub balance', async () => {
        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;
        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_COMMAND,
            {
                name: "setBalance",
                input: [
                    wallet.address,
                    "100"
                ]
            }
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_COMMAND,
            {
                name: "subBalance",
                input: [
                    wallet.address,
                    "25"
                ]
            }
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);

        let balance = await walletProvider.getWalletBalance(ctx.blockTree, ctx.block.hash, wallet.address);
        expect(balance.balance.toString()).toEqual('75');

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('make transfer', async () => {
        let wallet2 = new Wallet();
        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;
        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);
        ctx.simulate = false;
        ctx.simulateWallet = false;
        let balance = await walletProvider.getWalletBalance(ctx.blockTree, ctx.block.hash, wallet.address);
        expect(balance.balance.toString()).toEqual('0');

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_COMMAND,
            {
                name: "setBalance",
                input: [
                    wallet.address,
                    "100"
                ]
            }
        );
        tx.isValid();
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);

        balance = await walletProvider.getWalletBalance(ctx.blockTree, ctx.block.hash, wallet.address);
        expect(balance.balance.toString()).toEqual('100');

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet2.address,
            '70',
            '0',
            TxType.TX_NONE
        );
        tx.isValid();
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);

        balance = await walletProvider.getWalletBalance(ctx.blockTree, ctx.block.hash, wallet.address);
        expect(balance.balance.toString()).toEqual('30');

        balance = await walletProvider.getWalletBalance(ctx.blockTree, ctx.block.hash, wallet2.address);
        expect(balance.balance.toString()).toEqual('70');

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet2.address,
            '50',
            '0',
            TxType.TX_NONE
        );
        tx.isValid();
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual('insufficient funds');

        await transactionsProvider.disposeContext(ctx);
    }, 30000);
});

describe('set configs', () => {
    test('set basic fee', async () => {
        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;
        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_COMMAND,
            {
                name: "setBalance",
                input: [
                    wallet.address,
                    "100"
                ]
            }
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);
        expect(ctx.output.feeUsed).toEqual("0");

        transactionsProvider.createSubContext(ctx);
        ctx.block.height++;// affter first block

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_COMMAND,
            {
                name: "setConfig",
                input: [
                    "feeBasic",
                    "0.1"
                ]
            }
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);
        expect(ctx.output.feeUsed).toEqual("0");

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '2',
            TxType.TX_NONE
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);
        expect(ctx.output.feeUsed).toEqual("0");

        transactionsProvider.createSubContext(ctx);
        ctx.block.height += 10; // wait 10 blocks

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '2',
            TxType.TX_NONE
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);
        expect(ctx.output.feeUsed).toEqual("0");

        transactionsProvider.createSubContext(ctx); // waited more than 100 blocks
        ctx.block.height += 100;

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '2',
            TxType.TX_NONE
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);
        expect(ctx.output.feeUsed).toEqual("0.1");

        await transactionsProvider.disposeContext(ctx);
    }, 30000);
});

describe('contracts', () => {
    test('deploy contract', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCode }
        );
        tx.isValid();

        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;

        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "name", inputs: [] }]
        );
        tx.isValid();

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("SimpleToken");

        await transactionsProvider.disposeContext(ctx);
    }, 30000);
});

describe('stress testing', () => {
    test('simple transactions', async () => {
        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;

        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        let uptime = new Date().getTime();

        for (let i = 0; i < 100; i++) {
            let tx = new Tx();
            tx.chain = chain;
            tx.version = "2";
            tx.from = [wallet.address];
            tx.to = [wallet.address];
            tx.amount = ['0'];
            tx.type = TxType.TX_NONE;
            tx.data = {};
            tx.foreignKeys = [];
            tx.created = helper.getNow();
            tx.fee = '0';
            tx.hash = tx.toHash();
            tx.sign = [''];

            const output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
            expect(output.error).toEqual(undefined);
        }

        uptime = (new Date().getTime() - uptime) / 1000;
        expect(uptime).toBeLessThan(1);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('contract transactions', async () => {
        const blockTree = await blocksProvider.getMainBlockTree(chain);
        const lastBlockInfo = blockTree.getBlockInfo(blockTree.blockTreeLastMinedHash);
        expect(lastBlockInfo !== undefined).toEqual(true);
        if (!lastBlockInfo) return;

        const ctx = transactionsProvider.createContext(blockTree, lastBlockInfo);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCode }
        );
        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        let uptime = new Date().getTime();

        for (let i = 0; i < 100; i++) {
            tx = new Tx();
            tx.chain = chain;
            tx.version = "2";
            tx.from = [wallet.address];
            tx.to = [contractAddress];
            tx.amount = ['0'];
            tx.type = TxType.TX_CONTRACT_EXE;
            tx.data = [{ method: 'transfer', inputs: [wallet.address, `0`] }];
            tx.foreignKeys = [];
            tx.created = helper.getNow();
            tx.fee = '0';
            tx.hash = tx.toHash();
            tx.sign = [''];

            output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
            expect(output.error).toEqual(undefined);
        }

        uptime = (new Date().getTime() - uptime) / 1000;
        expect(uptime).toBeLessThan(3);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);
});