import fs from 'fs';
import { BlockPack, BywiseHelper, Tx, TxType, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { BlocksProvider, EnvironmentProvider, TransactionsProvider } from '../services';
import { WalletProvider } from '../services/wallet.service';
import helper from '../utils/helper';
import { ChainConfig } from '../types';
import { ConfigProvider } from '../services/configs.service';
import { CompiledContext } from '../types/environment.types';

var bywise: Bywise;
var transactionsProvider: TransactionsProvider;
var blocksProvider: BlocksProvider;
var walletProvider: WalletProvider;
var environmentProvider: EnvironmentProvider;
var b0: BlockPack;

const chain = 'local';
const port0 = Math.floor(Math.random() * 7000 + 3000);
const wallet = new Wallet();

const ERCCode = fs.readFileSync('./assets/ERC20.js', 'utf8');
const ERCCodeV2 = fs.readFileSync('./assets/ERC20_v2.js', 'utf8');
const ERCCodeTestContract = fs.readFileSync('./assets/test_contract.js', 'utf8');

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
    environmentProvider = new EnvironmentProvider(bywise.applicationContext);
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

        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;

        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        const output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('set balance', async () => {
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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

        let balance = await walletProvider.getWalletBalance(ctx.envContext, wallet.address);
        expect(balance.balance.toString()).toEqual('100');

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('add balance', async () => {
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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

        let balance = await walletProvider.getWalletBalance(ctx.envContext, wallet.address);
        expect(balance.balance.toString()).toEqual('60');

        await transactionsProvider.disposeContext(ctx);
    }), 30000;

    test('sub balance', async () => {
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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

        let balance = await walletProvider.getWalletBalance(ctx.envContext, wallet.address);
        expect(balance.balance.toString()).toEqual('75');

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('make transfer', async () => {
        let wallet2 = new Wallet();
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);
        let balance = await walletProvider.getWalletBalance(ctx.envContext, wallet.address);
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

        balance = await walletProvider.getWalletBalance(ctx.envContext, wallet.address);
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

        balance = await walletProvider.getWalletBalance(ctx.envContext, wallet.address);
        expect(balance.balance.toString()).toEqual('30');

        balance = await walletProvider.getWalletBalance(ctx.envContext, wallet2.address);
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
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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

        environmentProvider.commit(ctx.envContext);
        ctx.envContext.blockHeight++;// affter first block

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

        environmentProvider.commit(ctx.envContext);
        ctx.envContext.blockHeight += 10; // wait 10 blocks

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

        environmentProvider.commit(ctx.envContext); // waited more than 100 blocks
        ctx.envContext.blockHeight += 100;

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

        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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

    test('contract call other contracs', async () => {
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        const saveValueContract = BywiseHelper.getBWSAddressContract();
        const otherContract = BywiseHelper.getBWSAddressContract();
        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            {
                contractAddress: saveValueContract, code: `
                import BywiseUtils, { StorageValue } from 'bywise-utils.js';
                class StorageContract {
                    value = new StorageValue('');
                    setValue(newValue) {
                        this.value.set(newValue);
                    }
                    getValue() { // @view
                        return this.value.get();
                    }
                }
                BywiseUtils.exportContract(new StorageContract());`
            }
        );
        tx.isValid();
        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            saveValueContract,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "getValue", inputs: [] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("");

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            {
                contractAddress: otherContract, code: `
                import BywiseUtils, { StorageValue } from 'bywise-utils.js';
                class OtherContract {
                    setNewValue(contractAddress, value) {
                        const SC = BywiseUtils.getContract(contractAddress, ['setValue', 'getValue']);
                        SC.setValue(value);
                        return SC.getValue();
                    }
                }
                BywiseUtils.exportContract(new OtherContract());`
            }
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            otherContract,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "setNewValue", inputs: [saveValueContract, "Banana"] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("Banana");

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            saveValueContract,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "getValue", inputs: [] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("Banana");

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('contract events', async () => {
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            {
                contractAddress: contractAddress, code: `
                import BywiseUtils from 'bywise-utils';
                class TestContract {
                    setValue(newValue) {
                        const sender = BywiseUtils.getTxSender();
                        BywiseUtils.emit("setValue", {
                            sender: sender,
                            new_value: newValue
                        });
                    }
                }
                BywiseUtils.exportContract(new TestContract());`
            }
        );
        tx.isValid();
        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "setValue", inputs: ["Banana"] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.events).toEqual([{
            entries: [
                {
                    key: "sender",
                    value: wallet.address,
                },
                {
                    key: "new_value",
                    value: "Banana",
                },
            ],
            eventName: "setValue",
            contractAddress: contractAddress,
            hash: tx.hash,
        }]);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('cost - hardwork', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeTestContract }
        );
        tx.isValid();

        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "hardwork", inputs: ['100'] }]
        );
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual(495000);
        expect(output.cost).toEqual(3);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "hardwork", inputs: ['1000'] }]
        );
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual(499500000);
        expect(output.cost).toEqual(201);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('cost - multiple calls', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeTestContract }
        );
        tx.isValid();

        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [
            { method: 'setValue', inputs: [`1`] },
        ];
        tx.to.push(contractAddress);
        tx.amount.push('0');
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual('1');
        expect(output.cost).toEqual(8);

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [];
        for (let i = 0; i < 10; i++) {
            tx.data.push({ method: 'setValue', inputs: [`1`] });
            tx.to.push(contractAddress);
            tx.amount.push('0');
        }
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual('1');
        expect(output.cost).toEqual(80);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('cost - call other contracs', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();
        const contractAddress2 = BywiseHelper.getBWSAddressContract();

        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeTestContract }
        );
        tx.isValid();
        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress: contractAddress2, code: ERCCodeTestContract }
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [
            { method: 'increment', inputs: [contractAddress2] },
        ];
        tx.to.push(contractAddress);
        tx.amount.push('0');
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual('1');
        expect(output.cost).toEqual(85);

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [
            { method: 'incrementMultipleTimes', inputs: [contractAddress2, '10'] },
        ];
        tx.to.push(contractAddress);
        tx.amount.push('0');
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual('11');
        expect(output.cost).toEqual(589);

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [];
        for (let i = 0; i < 10; i++) {
            tx.data.push({ method: 'increment', inputs: [contractAddress2] });
            tx.to.push(contractAddress);
            tx.amount.push('0');
        }
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual('21');
        expect(output.cost).toEqual(850);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('cost - gas limit', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();

        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeTestContract }
        );
        tx.isValid();
        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [
            { method: 'hardwork', inputs: ['100000'] },
        ];
        tx.to.push(contractAddress);
        tx.amount.push('0');
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual('interrupted');
        expect(output.cost).toEqual(1026);

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [
            { method: 'hardwork', inputs: ['100'] },
        ];
        tx.to.push(contractAddress);
        tx.amount.push('0');
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));

        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual(495000);
        expect(output.cost).toEqual(3);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('set fee by cost', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeTestContract }
        );
        tx.isValid();
        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

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
                    "feeCoefCost",
                    "0.1"
                ]
            }
        );
        await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(ctx.output.error).toEqual(undefined);
        expect(ctx.output.feeUsed).toEqual("0");

        environmentProvider.commit(ctx.envContext); // waited more than 100 blocks
        ctx.envContext.blockHeight += 100;

        tx = new Tx();
        tx.chain = chain;
        tx.version = '2';
        tx.type = TxType.TX_CONTRACT_EXE;
        tx.from.push(wallet.address);
        tx.foreignKeys = [];
        tx.fee = '1';
        tx.data = [
            { method: 'hardwork', inputs: ['100'] },
        ];
        tx.to.push(contractAddress);
        tx.amount.push('0');
        tx.created = Math.floor(new Date().getTime() / 1000);
        tx.hash = tx.toHash();
        tx.sign.push(await wallet.signHash(tx.hash));
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual(495000);
        expect(output.cost).toEqual(3);
        expect(output.fee).toEqual("1");
        expect(output.feeUsed).toEqual("0.3");

        let balance = await walletProvider.getWalletBalance(ctx.envContext, wallet.address);
        expect(balance.balance.toString()).toEqual('99.7');

        await transactionsProvider.disposeContext(ctx);
    }, 30000);
});

describe('stress testing', () => {
    test('simple transactions', async () => {
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

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

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [wallet.address] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("5000000000000000000000");

        let uptime = new Date().getTime();

        for (let i = 0; i < 100; i++) {
            tx = new Tx();
            tx.chain = chain;
            tx.version = "2";
            tx.from = [wallet.address];
            tx.to = [contractAddress];
            tx.amount = ['0'];
            tx.type = TxType.TX_CONTRACT_EXE;
            tx.data = [{ method: 'transfer', inputs: [BywiseHelper.ZERO_ADDRESS, `1000000000000000000`] }];
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

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [wallet.address] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("4900000000000000000000");

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [BywiseHelper.ZERO_ADDRESS] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("100000000000000000000");

        await transactionsProvider.disposeContext(ctx);
    }, 30000);

    test('contract transactions - BigInt', async () => {
        const blockTree = await blocksProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const ctx = transactionsProvider.createContext(blockTree, CompiledContext.MAIN_CONTEXT_HASH, currentMinnedBlock.height + 1);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        let tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeV2 }
        );
        let output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [wallet.address] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("5000000000000000000000");

        let uptime = new Date().getTime();

        for (let i = 0; i < 100; i++) {
            tx = new Tx();
            tx.chain = chain;
            tx.version = "2";
            tx.from = [wallet.address];
            tx.to = [contractAddress];
            tx.amount = ['0'];
            tx.type = TxType.TX_CONTRACT_EXE;
            tx.data = [{ method: 'transfer', inputs: [BywiseHelper.ZERO_ADDRESS, `1000000000000000000`] }];
            tx.foreignKeys = [];
            tx.created = helper.getNow();
            tx.fee = '0';
            tx.hash = tx.toHash();
            tx.sign = [''];

            output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
            expect(output.error).toEqual(undefined);
        }

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [wallet.address] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("4900000000000000000000");

        tx = await transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [BywiseHelper.ZERO_ADDRESS] }]
        );
        tx.isValid();
        output = await transactionsProvider.simulateTransaction(tx, { from: wallet.address }, ctx);
        expect(output.error).toEqual(undefined);
        expect(output.output).toEqual("100000000000000000000");

        uptime = (new Date().getTime() - uptime) / 1000;
        expect(uptime).toBeLessThan(3);

        await transactionsProvider.disposeContext(ctx);
    }, 30000);
});