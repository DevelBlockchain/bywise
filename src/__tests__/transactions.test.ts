import fs from 'fs';
import { BlockPack, BywiseHelper, Tx, TxType, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { ConfigProvider, EnvironmentProvider } from '../services';
import helper from '../utils/helper';
import { CompiledContext, ChainConfig, EnvironmentContext, BlockchainStatus } from '../types';

var bywise: Bywise;
var environmentProvider: EnvironmentProvider;
var b0: BlockPack;

const chain = 'local';
var fromSlice = '';
const port0 = Math.floor(Math.random() * 7000 + 3000);
const wallet = new Wallet();

const DEAFAUT_MAIN_ENV: EnvironmentContext = {
    chain,
    fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
    blockHeight: 1,
    changes: {
        keys: [],
        values: [],
    }
}

const ERCCode = fs.readFileSync('./assets/ERC20.js', 'utf8');
const ERCCodeV2 = fs.readFileSync('./assets/ERC20_v2.js', 'utf8');
const ERCCodeTestContract = fs.readFileSync('./assets/test_contract.js', 'utf8');

const convertoToTxInfo = (txs: Tx[]) => txs.map(tx => ({
    tx: tx,
    isExecuted: false,
    slicesHash: '',
    blockHash: '',
    create: Date.now(),
    status: BlockchainStatus.TX_MEMPOOL
}))

beforeAll(async () => {
    const nodeWallet = new Wallet();
    b0 = await helper.createNewBlockZero(chain, nodeWallet, [
        ChainConfig.setConfig('blockTime', `30`),
        ChainConfig.setConfig('feeCostType', `1`),
        ChainConfig.addAdmin(wallet.address),
        ChainConfig.addAdmin(nodeWallet.address),
        ChainConfig.addValidator(nodeWallet.address),
        ChainConfig.setBalance(nodeWallet.address, ConfigProvider.MIN_BWS_VALUE),
    ]);
    fromSlice = b0.slices[0].hash;
    bywise = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: wallet.seed,
        startServices: ['vm'],
    });

    environmentProvider = new EnvironmentProvider(bywise.applicationContext);
}, 5000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
    await bywise.blockProvider.setNewZeroBlock(b0);
}, 2000)

afterAll(async () => {
    await bywise.stop();
}, 2000)

describe('basic tests', () => {

    test('create basic transation', async () => {
        const tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_NONE
        );
        tx.isValid();

        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: { keys: [], values: [] }
        });
    }, 1000);

    test('set balance', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
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

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [
                    `${wallet.address}-WB`,
                ], values: [
                    `100`,
                ]
            }
        });
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
            ], values: [
                `100`,
            ]
        });

        let walletBalanceEnv = await environmentProvider.get(DEAFAUT_MAIN_ENV, `${wallet.address}-WB`);
        expect(walletBalanceEnv).toEqual(null);

        await environmentProvider.push(tte.envOut, chain, CompiledContext.MAIN_CONTEXT_HASH);

        walletBalanceEnv = await environmentProvider.get(DEAFAUT_MAIN_ENV, `${wallet.address}-WB`);
        expect(walletBalanceEnv?.value).toEqual("100");
    }, 1000);

    test('add balance', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "15"
                ]
            }
        );
        tx1.isValid();

        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "20"
                ]
            }
        );
        tx2.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['15'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.outputs[1].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['20'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
            ], values: [
                `35`,
            ]
        });
    }), 1000;

    test('sub balance', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "15"
                ]
            }
        );
        tx1.isValid();

        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "7"
                ]
            }
        );
        tx2.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['15'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.outputs[1].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-7'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
            ], values: [
                `8`,
            ]
        });
    }), 1000;

    test('sub balance - Insuficient Funds', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "10"
                ]
            }
        );
        tx1.isValid();

        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "7"
                ]
            }
        );
        tx2.isValid();

        const tx3 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "5"
                ]
            }
        );
        tx3.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2, tx3]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual("Insuficient funds");
        expect(tte.txs.length).toEqual(3);
        expect(tte.outputs.length).toEqual(3);
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['10'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[1].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-7'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.outputs[1].error).toEqual(undefined);
        expect(tte.outputs[2].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-5'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.outputs[2].error).toEqual("Insuficient funds");
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
            ], values: [
                `3`,
            ]
        });
    }), 1000;

    test('make transfer', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "100"
                ]
            }
        );
        tx1.isValid();

        const wallet2 = new Wallet();
        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet2.address,
            '70',
            '0',
            TxType.TX_NONE
        );
        tx2.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].debit).toEqual('0');
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['100'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.outputs[1].debit).toEqual('70');
        expect(tte.outputs[1].changes).toEqual({
            get: [],
            walletAddress: [wallet2.address],
            walletAmount: ['70'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
                `${wallet2.address}-WB`,
            ], values: [
                `30`,
                `70`,
            ]
        });
    }), 1000;

    test('make transfer - Insuficient Funds', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "50"
                ]
            }
        );
        tx1.isValid();

        const wallet2 = new Wallet();
        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet2.address,
            '70',
            '0',
            TxType.TX_NONE
        );
        tx2.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual("Insuficient funds");
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[0].debit).toEqual('0');
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['50'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.outputs[1].error).toEqual("Insuficient funds");
        expect(tte.outputs[1].debit).toEqual('70');
        expect(tte.outputs[1].changes).toEqual({
            get: [],
            walletAddress: [wallet2.address],
            walletAmount: ['70'],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`
            ], values: [
                `50`
            ]
        });
    }), 1000;
});

describe('set configs', () => {
    test('set basic fee', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        let blockHeight = currentMinnedBlock.height + 1;

        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
        tx1.isValid();

        let tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '1',
            TxType.TX_COMMAND,
            {
                name: "setConfig",
                input: [
                    "feeBasic",
                    "0.1"
                ]
            }
        );
        tx2.isValid();

        let tx3 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '1',
            TxType.TX_NONE
        );
        tx3.isValid();

        let tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2, tx3]), fromSlice, { chain, fromContextHash: CompiledContext.MAIN_CONTEXT_HASH, blockHeight: blockHeight, changes: { keys: [], values: [] } });
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(3);
        expect(tte.outputs.length).toEqual(3);
        expect(tte.outputs[0].fee).toEqual("0");
        expect(tte.outputs[0].feeUsed).toEqual("0");
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [
                    `${wallet.address}-WB`,
                ], values: [
                    `100`,
                ]
            }
        });
        expect(tte.outputs[1].fee).toEqual("1");
        expect(tte.outputs[1].feeUsed).toEqual("0");
        expect(tte.outputs[1].changes).toEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [
                    `config-feeBasic`,
                ], values: [
                    `{\"lastValue\":\"0\",\"value\":\"0.1\",\"lastUpdate\":1,\"type\":\"number\"}`,
                ]
            }
        });
        expect(tte.outputs[2].fee).toEqual("1");
        expect(tte.outputs[2].feeUsed).toEqual("0");
        expect(tte.outputs[2].changes).toEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [], values: []
            }
        });
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
                `config-feeBasic`,
            ], values: [
                `100`,
                `{\"lastValue\":\"0\",\"value\":\"0.1\",\"lastUpdate\":1,\"type\":\"number\"}`,
            ]
        });

        await environmentProvider.push(tte.envOut, chain, CompiledContext.MAIN_CONTEXT_HASH);

        tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '1',
            TxType.TX_NONE
        );
        tx1.isValid();

        blockHeight++; // next block
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1]), fromSlice, { chain, fromContextHash: CompiledContext.MAIN_CONTEXT_HASH, blockHeight: blockHeight, changes: { keys: [], values: [] } });
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].debit).toEqual("0");
        expect(tte.outputs[0].fee).toEqual("1");
        expect(tte.outputs[0].feeUsed).toEqual("0");
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`
            ], values: [
                `100`
            ]
        });

        blockHeight += 10; // wait 10 blocks
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1]), fromSlice, { chain, fromContextHash: CompiledContext.MAIN_CONTEXT_HASH, blockHeight: blockHeight, changes: { keys: [], values: [] } });
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].debit).toEqual("0");
        expect(tte.outputs[0].fee).toEqual("1");
        expect(tte.outputs[0].feeUsed).toEqual("0");
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`
            ], values: [
                `100`
            ]
        });

        blockHeight += 100; // wait 100 blocks
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1]), fromSlice, { chain, fromContextHash: CompiledContext.MAIN_CONTEXT_HASH, blockHeight: blockHeight, changes: { keys: [], values: [] } });
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].debit).toEqual("0.1");
        expect(tte.outputs[0].fee).toEqual("1");
        expect(tte.outputs[0].feeUsed).toEqual("0.1");
        expect(tte.envOut).toEqual({
            keys: [
                `${wallet.address}-WB`
            ], values: [
                `99.9`
            ]
        });
    }, 1000);
});

describe('contracts', () => {
    test('deploy contract', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();

        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCode }
        );
        tx1.isValid();

        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        let tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "name", inputs: [] }]
        );
        tx2.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs[1].output).toEqual("SimpleToken");
    }, 3000);

    test('contract call other contracs', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const saveValueContract = BywiseHelper.getBWSAddressContract();
        const otherContract = BywiseHelper.getBWSAddressContract();
        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
        tx1.isValid();

        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
        tx2.isValid();

        const tx3 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            saveValueContract,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "getValue", inputs: [] }]
        );
        tx3.isValid();

        const tx4 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            otherContract,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "setNewValue", inputs: [saveValueContract, "Banana"] }]
        );
        tx4.isValid();

        const tx5 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            saveValueContract,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "getValue", inputs: [] }]
        );
        tx5.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2, tx3, tx4, tx5]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.outputs.length).toEqual(5);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[1].error).toEqual(undefined);
        expect(tte.outputs[2].error).toEqual(undefined);
        expect(tte.outputs[3].error).toEqual(undefined);
        expect(tte.outputs[4].error).toEqual(undefined);
        expect(tte.outputs[2].output).toEqual("");
        expect(tte.outputs[3].output).toEqual("Banana");
        expect(tte.outputs[4].output).toEqual("Banana");
    }, 1000);

    test('contract events', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
        tx1.isValid();

        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "setValue", inputs: ["Banana"] }]
        );
        tx2.isValid();

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[1].events).toEqual([{
            contractAddress: contractAddress,
            eventName: 'setValue',
            entries: [
                { "key": "sender", "value": wallet.address },
                { "key": "new_value", "value": "Banana" }
            ],
            hash: tx2.hash
        }]);
    }, 3000);

    test('cost - hardwork', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress: contractAddress, code: ERCCodeTestContract }
        );
        tx1.isValid();

        let tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "hardwork", inputs: ['100'] }]
        );
        tx2.isValid();
        let tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[1].error).toEqual(undefined);
        expect(tte.outputs[1].output).toEqual("495000");
        expect(tte.outputs[1].cost).toEqual(9);

        tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "hardwork", inputs: ['1000'] }]
        );
        tx2.isValid();
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[1].error).toEqual(undefined);
        expect(tte.outputs[1].output).toEqual("499500000");
        expect(tte.outputs[1].cost).toEqual(207);

        tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "infinty", inputs: [] }]
        );
        tx2.isValid();
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(typeof tte.outputs[1].error).toEqual("string");
        expect(tte.outputs[1].error).toEqual("interrupted");
        expect(tte.outputs[1].output).toEqual(undefined);
        expect(tte.outputs[1].cost).toEqual(1026);
    }, 3000);

    test('cost - multiple calls', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            {
                contractAddress: contractAddress, code: ERCCodeTestContract
            }
        );
        tx1.isValid();

        const tx2 = new Tx();
        tx2.chain = chain;
        tx2.version = '2';
        tx2.type = TxType.TX_CONTRACT_EXE;
        tx2.from.push(wallet.address);
        tx2.foreignKeys = [];
        tx2.fee = '1';
        tx2.data = [];
        tx2.data.push({ method: 'incrementValue', inputs: [`1`] });
        tx2.to.push(contractAddress);
        tx2.amount.push('0');
        tx2.created = Math.floor(new Date().getTime() / 1000);
        tx2.hash = tx2.toHash();
        tx2.sign.push(await wallet.signHash(tx2.hash));

        const tx3 = new Tx();
        tx3.chain = chain;
        tx3.version = '2';
        tx3.type = TxType.TX_CONTRACT_EXE;
        tx3.from.push(wallet.address);
        tx3.foreignKeys = [];
        tx3.fee = '1';
        tx3.data = [];
        for (let i = 0; i < 10; i++) {
            tx3.data.push({ method: 'incrementValue', inputs: [`1`] });
            tx3.to.push(contractAddress);
            tx3.amount.push('0');
        }
        tx3.created = Math.floor(new Date().getTime() / 1000);
        tx3.hash = tx3.toHash();
        tx3.sign.push(await wallet.signHash(tx3.hash));

        const tx4 = new Tx();
        tx4.chain = chain;
        tx4.version = '2';
        tx4.type = TxType.TX_CONTRACT_EXE;
        tx4.from.push(wallet.address);
        tx4.foreignKeys = [];
        tx4.fee = '1';
        tx4.data = [];
        tx4.data.push({ method: 'incrementValue', inputs: [`1`] });
        tx4.to.push(contractAddress);
        tx4.amount.push('0');
        tx4.created = Math.floor(new Date().getTime() / 1000);
        tx4.hash = tx2.toHash();
        tx4.sign.push(await wallet.signHash(tx2.hash));

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2, tx3, tx4]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.outputs.length).toEqual(4);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[1].error).toEqual(undefined);
        expect(tte.outputs[2].error).toEqual(undefined);
        expect(tte.outputs[3].error).toEqual(undefined);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[1].output).toEqual("1");
        expect(tte.outputs[1].cost).toEqual(9);
        expect(tte.outputs[2].output).toEqual("11");
        expect(tte.outputs[2].cost).toEqual(90);
        expect(tte.outputs[3].output).toEqual("12");
        expect(tte.outputs[3].cost).toEqual(9);
    }, 3000);

    test('cost - call other contracs', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        const contractAddress2 = BywiseHelper.getBWSAddressContract();
        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            {
                contractAddress: contractAddress, code: ERCCodeTestContract
            }
        );
        tx1.isValid();

        const tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            {
                contractAddress: contractAddress2, code: ERCCodeTestContract
            }
        );
        tx2.isValid();

        const tx3 = new Tx();
        tx3.chain = chain;
        tx3.version = '2';
        tx3.type = TxType.TX_CONTRACT_EXE;
        tx3.from.push(wallet.address);
        tx3.foreignKeys = [];
        tx3.fee = '1';
        tx3.data = [];
        tx3.data.push({ method: 'increment', inputs: [contractAddress2] }); // call other contract
        tx3.to.push(contractAddress);
        tx3.amount.push('0');
        tx3.created = Math.floor(new Date().getTime() / 1000);
        tx3.hash = tx2.toHash();
        tx3.sign.push(await wallet.signHash(tx2.hash));

        const tx4 = new Tx();
        tx4.chain = chain;
        tx4.version = '2';
        tx4.type = TxType.TX_CONTRACT_EXE;
        tx4.from.push(wallet.address);
        tx4.foreignKeys = [];
        tx4.fee = '1';
        tx4.data = [];
        tx4.data.push({ method: 'increment', inputs: [contractAddress] }); // call himself
        tx4.to.push(contractAddress);
        tx4.amount.push('0');
        tx4.created = Math.floor(new Date().getTime() / 1000);
        tx4.hash = tx2.toHash();
        tx4.sign.push(await wallet.signHash(tx2.hash));

        const tx5 = new Tx();
        tx5.chain = chain;
        tx5.version = '2';
        tx5.type = TxType.TX_CONTRACT_EXE;
        tx5.from.push(wallet.address);
        tx5.foreignKeys = [];
        tx5.fee = '1';
        tx5.data = [];
        for (let i = 0; i < 10; i++) {
            tx5.data.push({ method: 'increment', inputs: [contractAddress2] });
            tx5.to.push(contractAddress);
            tx5.amount.push('0');
        }
        tx5.created = Math.floor(new Date().getTime() / 1000);
        tx5.hash = tx3.toHash();
        tx5.sign.push(await wallet.signHash(tx3.hash));

        const tx6 = new Tx();
        tx6.chain = chain;
        tx6.version = '2';
        tx6.type = TxType.TX_CONTRACT_EXE;
        tx6.from.push(wallet.address);
        tx6.foreignKeys = [];
        tx6.fee = '1';
        tx6.data = [];
        tx6.data.push({ method: 'incrementMultipleTimes', inputs: [contractAddress2, '10'] });
        tx6.to.push(contractAddress);
        tx6.amount.push('0');
        tx6.created = Math.floor(new Date().getTime() / 1000);
        tx6.hash = tx2.toHash();
        tx6.sign.push(await wallet.signHash(tx2.hash));

        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2, tx3, tx4, tx5, tx6]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.outputs.length).toEqual(6);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[1].error).toEqual(undefined);
        expect(tte.outputs[2].error).toEqual(undefined);
        expect(tte.outputs[3].error).toEqual(undefined);
        expect(tte.outputs[4].error).toEqual(undefined);
        expect(tte.outputs[5].error).toEqual(undefined);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[1].cost).toEqual(30);
        expect(tte.outputs[2].output).toEqual("1");
        expect(tte.outputs[2].cost).toEqual(34);
        expect(tte.outputs[3].output).toEqual("1");
        expect(tte.outputs[3].cost).toEqual(34);
        expect(tte.outputs[4].output).toEqual("11");
        expect(tte.outputs[4].cost).toEqual(340);
        expect(tte.outputs[5].output).toEqual("21");
        expect(tte.outputs[5].cost).toEqual(196);
    }, 3000);

    test('cost - set fee by cost', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        let blockHeight = currentMinnedBlock.height + 1;

        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
        tx1.isValid();

        let tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '1',
            TxType.TX_COMMAND,
            {
                name: "setConfig",
                input: [
                    "feeCoefCost",
                    "0.1"
                ]
            }
        );
        tx2.isValid();

        let tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, {
            chain,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            blockHeight: blockHeight,
            changes: {
                keys: [],
                values: [],
            }
        });
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].fee).toEqual("0");
        expect(tte.outputs[0].feeUsed).toEqual("0");
        expect(tte.outputs[1].fee).toEqual("1");
        expect(tte.outputs[1].feeUsed).toEqual("0");

        await environmentProvider.push(tte.envOut, chain, CompiledContext.MAIN_CONTEXT_HASH);

        const contractAddress = BywiseHelper.getBWSAddressContract();
        tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '30',
            TxType.TX_CONTRACT,
            {
                contractAddress: contractAddress, code: ERCCodeTestContract
            }
        );
        tx1.isValid();

        tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '30',
            TxType.TX_CONTRACT_EXE,
            [{ method: "hardwork", inputs: ['100'] }]
        );
        tx2.isValid();

        blockHeight++; // next block
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, { chain, fromContextHash: CompiledContext.MAIN_CONTEXT_HASH, blockHeight: blockHeight, changes: { keys: [], values: [] } });
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[0].debit).toEqual("0");
        expect(tte.outputs[0].fee).toEqual("30");
        expect(tte.outputs[0].feeUsed).toEqual("0");
        expect(tte.outputs[1].cost).toEqual(9);
        expect(tte.outputs[1].debit).toEqual("0");
        expect(tte.outputs[1].fee).toEqual("30");
        expect(tte.outputs[1].feeUsed).toEqual("0");

        blockHeight += 10; // wait 10 blocks
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, { chain, fromContextHash: CompiledContext.MAIN_CONTEXT_HASH, blockHeight: blockHeight, changes: { keys: [], values: [] } });
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[0].debit).toEqual("0");
        expect(tte.outputs[0].fee).toEqual("30");
        expect(tte.outputs[0].feeUsed).toEqual("0");
        expect(tte.outputs[1].cost).toEqual(9);
        expect(tte.outputs[1].debit).toEqual("0");
        expect(tte.outputs[1].fee).toEqual("30");
        expect(tte.outputs[1].feeUsed).toEqual("0");

        blockHeight += 100; // wait 100 blocks
        tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2]), fromSlice, { chain, fromContextHash: CompiledContext.MAIN_CONTEXT_HASH, blockHeight: blockHeight, changes: { keys: [], values: [] } });
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[0].debit).toEqual("3");
        expect(tte.outputs[0].fee).toEqual("30");
        expect(tte.outputs[0].feeUsed).toEqual("3");
        expect(tte.outputs[1].cost).toEqual(9);
        expect(tte.outputs[1].debit).toEqual("0.9");
        expect(tte.outputs[1].fee).toEqual("30");
        expect(tte.outputs[1].feeUsed).toEqual("0.9");
    }, 1000);

    test('change state', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const stealthAddress = wallet.getStealthAddress(0, 0);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const contractAddress = BywiseHelper.getBWSAddressContract();
        await environmentProvider.consolide(blockTree, currentMinnedBlock.hash, CompiledContext.MAIN_CONTEXT_HASH);

        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
        tx1.isValid();

        let tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeV2 }
        );
        tx2.isValid();

        let tx3 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "transfer", inputs: [stealthAddress, '1000'] }]
        );
        tx3.isValid();

        let tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo([tx1, tx2, tx3]), fromSlice, DEAFAUT_MAIN_ENV);
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(3);
        expect(tte.outputs[0].changes).toEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [
                    `${wallet.address}-WB`,
                ], values: [
                    `100`,
                ]
            }
        });
        expect(tte.outputs[1].changes.get).toEqual([
            `${contractAddress}-WC`,
            `${contractAddress}-CI`,
            `${contractAddress}-MD-2`,
            `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
            `${contractAddress}-V-1`
        ]);
        expect(tte.outputs[1].changes.walletAddress).toEqual([]);
        expect(tte.outputs[1].changes.walletAmount).toEqual([]);
        expect(tte.outputs[1].changes.envOut.keys).toEqual([
            `${contractAddress}-CI`,
            `${contractAddress}-V-1`,
            `${contractAddress}-MD-2`,
            `${contractAddress}-MD-3`,
            `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
            `${contractAddress}-WC`
        ]);
        expect(tte.outputs[1].changes.envOut.values.length).toEqual(tte.outputs[1].changes.envOut.keys.length);
        expect(tte.outputs[1].changes.envOut.values[0]).toEqual('3');
        expect(tte.outputs[1].changes.envOut.values[1]).toEqual('"5000000000000000000000"');
        expect(tte.outputs[1].changes.envOut.values[2]).toEqual('"0"');
        expect(tte.outputs[1].changes.envOut.values[3]).toEqual('""');
        expect(tte.outputs[1].changes.envOut.values[4]).toEqual('"5000000000000000000000"');
        const wc = tte.outputs[1].changes.envOut.values[5];
        expect(wc ? true : false).toEqual(true);
        if (wc) {
            expect(JSON.parse(wc)).toEqual({
                status: 'locked',
                abi: [
                    {
                        name: 'name',
                        view: true,
                        payable: false,
                        parameters: [],
                        returns: ['string']
                    },
                    {
                        name: 'symbol',
                        view: true,
                        payable: false,
                        parameters: [],
                        returns: ['string']
                    },
                    {
                        name: 'totalSupply',
                        view: true,
                        payable: false,
                        parameters: [],
                        returns: ['string']
                    },
                    {
                        name: 'decimals',
                        view: true,
                        payable: false,
                        parameters: [],
                        returns: ['string']
                    },
                    {
                        name: 'balanceOf',
                        view: true,
                        payable: false,
                        parameters: [
                            { name: 'account', type: ['string'] }
                        ],
                        returns: ['string']
                    },
                    {
                        name: 'allowance',
                        view: true,
                        payable: false,
                        parameters: [
                            { name: 'owner', type: ['string'] },
                            { name: 'spender', type: ['string'] }
                        ],
                        returns: ['string']
                    },
                    {
                        name: 'transfer',
                        view: false,
                        payable: false,
                        parameters: [
                            { name: 'recipient', type: ['string'] },
                            { name: 'amount', type: ['string'] }
                        ],
                        returns: ['string']
                    },
                    {
                        name: 'transferFrom',
                        view: false,
                        payable: false,
                        parameters: [
                            { name: 'from', type: ['string'] },
                            { name: 'to', type: ['string'] },
                            { name: 'amount', type: ['string'] }
                        ],
                        returns: ['string']
                    },
                    {
                        name: 'approve',
                        view: false,
                        payable: false,
                        parameters: [
                            { name: 'spender', type: ['string'] },
                            { name: 'amount', type: ['string'] }
                        ],
                        returns: ['string']
                    }
                ],
                code: ERCCodeV2,
                calls: [
                    '1',
                    '"0"',
                    '',
                    '"0"',
                    wallet.address,
                    '3',
                    '2',
                    '1',
                ],
            });
        }
        expect(tte.outputs[2].changes).toEqual({
            get: [
                `${contractAddress}-WC`,
                `${contractAddress}-MD-2`,
                `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
                `${contractAddress}-MV-2-${helper.stringToHash(stealthAddress)}`
            ],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [
                    `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
                    `${contractAddress}-MV-2-${helper.stringToHash(stealthAddress)}`,
                ], values: [
                    '"4999999999999999999000"',
                    '"1000"',
                ]
            }
        });
    }, 3000);
});

describe('stress testing', () => {
    test('simple transactions', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;

        const txs: Tx[] = [];
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
            txs.push(tx);
        }

        let uptime = new Date().getTime();
        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo(txs), fromSlice, DEAFAUT_MAIN_ENV);
        uptime = (new Date().getTime() - uptime) / 1000;

        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(100);
        expect(uptime).toBeLessThan(1);
    }, 3000);

    test('contract transactions', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const contractAddress = BywiseHelper.getBWSAddressContract();

        const txs: Tx[] = [];
        let tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCode }
        );
        txs.push(tx);
        for (let i = 0; i < 100; i++) {
            tx = new Tx();
            tx.chain = chain;
            tx.version = "2";
            tx.from = [wallet.address];
            tx.to = [contractAddress];
            tx.amount = ['0'];
            tx.type = TxType.TX_CONTRACT_EXE;
            tx.data = [{ method: 'transfer', inputs: [BywiseHelper.ZERO_ADDRESS, `1`] }];
            tx.foreignKeys = [];
            tx.created = helper.getNow();
            tx.fee = '0';
            tx.hash = tx.toHash();
            tx.sign = [''];
            txs.push(tx);
        }
        tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [wallet.address] }]
        );
        txs.push(tx);

        let uptime = new Date().getTime();
        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo(txs), fromSlice, DEAFAUT_MAIN_ENV);
        uptime = (new Date().getTime() - uptime) / 1000;

        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(txs.length);
        expect(tte.outputs[txs.length - 1].output).toEqual("4999999999999999999900");
        expect(uptime).toBeLessThan(3);
    }, 5000);

    test('contract transactions - BigInt', async () => {
        const blockTree = await bywise.blockProvider.getBlockTree(chain);
        const currentMinnedBlock = blockTree.currentMinnedBlock;
        const contractAddress = BywiseHelper.getBWSAddressContract();

        const txs: Tx[] = [];
        let tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeV2 }
        );
        txs.push(tx);
        for (let i = 0; i < 100; i++) {
            tx = new Tx();
            tx.chain = chain;
            tx.version = "2";
            tx.from = [wallet.address];
            tx.to = [contractAddress];
            tx.amount = ['0'];
            tx.type = TxType.TX_CONTRACT_EXE;
            tx.data = [{ method: 'transfer', inputs: [BywiseHelper.ZERO_ADDRESS, `1`] }];
            tx.foreignKeys = [];
            tx.created = helper.getNow();
            tx.fee = '0';
            tx.hash = tx.toHash();
            tx.sign = [''];
            txs.push(tx);
        }
        tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "balanceOf", inputs: [wallet.address] }]
        );
        txs.push(tx);

        let uptime = new Date().getTime();
        const tte = await bywise.transactionsProvider.simulateTransactions(convertoToTxInfo(txs), fromSlice, DEAFAUT_MAIN_ENV);
        uptime = (new Date().getTime() - uptime) / 1000;

        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(txs.length);
        expect(tte.outputs[txs.length - 1].output).toEqual("4999999999999999999900");
        expect(uptime).toBeLessThan(2);
    }, 3000);
});