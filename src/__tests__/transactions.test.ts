import fs from 'fs';
import { BlockPack, BywiseHelper, EnvironmentChanges, Tx, TxType, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { ConfigProvider, EnvironmentProvider } from '../services';
import helper from '../utils/helper';
import { CompiledContext, ChainConfig, EnvironmentContext, TransactionsToExecute, ZERO_HASH } from '../types';
import { RuntimeContext } from '../vm/RuntimeContext';

var bywise: Bywise;
var environmentProvider: EnvironmentProvider;
var b0: BlockPack;

const chain = 'local';
var fromSlice = '';
const port0 = Math.floor(Math.random() * 7000 + 3000);
const wallet = new Wallet();
var DEAFAUT_MAIN_ENV: EnvironmentContext = {
    chain,
    fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
    blockHeight: 1,
    changes: {
        keys: [],
        values: [],
    }
}

const ERCCodeV2 = fs.readFileSync('./assets/ERC20_v2.js', 'utf8');
const ERCCodeCustom = fs.readFileSync('./assets/ERC20_custom.js', 'utf8');
const ERCCodeTestContract = fs.readFileSync('./assets/test_contract.js', 'utf8');

beforeAll(async () => {
    const nodeWallet = new Wallet();
    b0 = await helper.createNewBlockZero(chain, nodeWallet, [
        ChainConfig.setBlockTime(`30`),
        ChainConfig.setConfigFee('feeCostType', `1`),
        ChainConfig.addAdmin(wallet.address),
        ChainConfig.addAdmin(nodeWallet.address),
        ChainConfig.addValidator(nodeWallet.address),
        ChainConfig.addBalance(nodeWallet.address, ConfigProvider.MIN_BWS_VALUE),
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
        vmSize: 1,
        vmIndex: 0
    });

    environmentProvider = new EnvironmentProvider(bywise.applicationContext);
}, 5000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
    await bywise.blockProvider.setNewZeroBlock(b0);
    await environmentProvider.compile(chain, fromSlice, CompiledContext.MAIN_CONTEXT_HASH);
    DEAFAUT_MAIN_ENV = {
        chain,
        fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
        blockHeight: 1,
        changes: {
            keys: [],
            values: [],
        }
    }
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

        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: ''
        });
    }, 1000);

    test('add balance', async () => {
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

        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['15'],
            envs: { keys: [], values: [] },
            output: ''
        });
    }), 1000;

    test('sub balance', async () => {
        const tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
        tx1.isValid();

        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-7'],
            envs: { keys: [], values: [] },
            output: ''
        });
    }), 1000;

    test('add and sub balance', async () => {
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

        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['15'],
            envs: { keys: [], values: [] },
            output: ''
        });
        expect(tte.outputs[1]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-7'],
            envs: { keys: [], values: [] },
            output: ''
        });

        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        const envOut: EnvironmentChanges = ctx.getEnvOut();
        expect(envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
            ], values: [
                `8`,
            ]
        });
    }), 1000;

    test('add and sub balance - Insuficient Funds', async () => {
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
                    "7"
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
                    "15"
                ]
            }
        );
        tx2.isValid();

        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['7'],
            envs: { keys: [], values: [] },
            output: ''
        });
        expect(tte.outputs[1]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-15'],
            envs: { keys: [], values: [] },
            output: ''
        });

        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        let error = await bywise.transactionsProvider.executeTransaction(ctx, tte.txs[0], tte.outputs[0]);
        expect(error).toEqual(null);
        error = await bywise.transactionsProvider.executeTransaction(ctx, tte.txs[1], tte.outputs[1]);
        expect(error).toEqual("low balance");
        const envOut: EnvironmentChanges = ctx.getEnvOut();
        expect(envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
            ], values: [
                `7`,
            ]
        });
    }), 1000;

    test('make transfer', async () => {
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

        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['100'],
            envs: { keys: [], values: [] },
            output: ''
        });
        expect(tte.outputs[1]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '70',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet2.address],
            walletAmount: ['70'],
            envs: { keys: [], values: [] },
            output: ''
        });

        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        const envOut: EnvironmentChanges = ctx.getEnvOut();
        expect(envOut).toEqual({
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

        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(2);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['50'],
            envs: { keys: [], values: [] },
            output: ''
        });
        expect(tte.outputs[1]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '70',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet2.address],
            walletAmount: ['70'],
            envs: { keys: [], values: [] },
            output: ''
        });

        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        let error = await bywise.transactionsProvider.executeTransaction(ctx, tte.txs[0], tte.outputs[0]);
        expect(error).toEqual(null);
        error = await bywise.transactionsProvider.executeTransaction(ctx, tte.txs[1], tte.outputs[1]);
        expect(error).toEqual("Insuficient funds");
        const envOut: EnvironmentChanges = ctx.getEnvOut();
        expect(envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
            ], values: [
                `50`,
            ]
        });
    }), 1000;
});

describe('set configs', () => {
    test('set basic fee', async () => {
        DEAFAUT_MAIN_ENV.blockHeight += 1;

        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "1"
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

        let tte = await bywise.transactionsProvider.simulateTransactions([tx1, tx2, tx3], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(3);
        expect(tte.outputs.length).toEqual(3);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['100'],
            envs: { keys: [], values: [] },
            output: ''
        });
        expect(tte.outputs[1]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
                keys: [
                    "config-feeBasic",
                ], values: [
                    "{\"lastValue\":\"0\",\"value\":\"1\",\"lastUpdate\":2,\"type\":\"number\"}",
                ]
            },
            output: ''
        });
        expect(tte.outputs[2]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: ''
        });

        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        const envOut: EnvironmentChanges = ctx.getEnvOut();
        expect(envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
                "config-feeBasic",
            ], values: [
                `100`,
                "{\"lastValue\":\"0\",\"value\":\"1\",\"lastUpdate\":2,\"type\":\"number\"}",
            ]
        });
        await environmentProvider.push(envOut, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '1',
            TxType.TX_NONE
        );
        tx1.isValid();

        DEAFAUT_MAIN_ENV.blockHeight += 1; // next block
        tte = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: ''
        });

        DEAFAUT_MAIN_ENV.blockHeight += 10; // wait 10 blocks
        tte = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: ''
        });

        DEAFAUT_MAIN_ENV.blockHeight += 100; // wait 100 blocks
        tte = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '1',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '1',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: ''
        });
    }, 1000);

    test('set basic fee - zero block', async () => {
        DEAFAUT_MAIN_ENV.blockHeight = 0;

        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "1"
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

        let tte = await bywise.transactionsProvider.simulateTransactions([tx1, tx2, tx3], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(3);
        expect(tte.outputs.length).toEqual(3);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['100'],
            envs: { keys: [], values: [] },
            output: ''
        });
        expect(tte.outputs[1]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 0,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
                keys: [
                    "config-feeBasic",
                ], values: [
                    "{\"lastValue\":\"0\",\"value\":\"1\",\"lastUpdate\":0,\"type\":\"number\"}",
                ]
            },
            output: ''
        });
        expect(tte.outputs[2]).toEqual({
            feeUsed: '0',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: ''
        });

        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        const envOut: EnvironmentChanges = ctx.getEnvOut();
        expect(envOut).toEqual({
            keys: [
                `${wallet.address}-WB`,
                "config-feeBasic",
            ], values: [
                `100`,
                "{\"lastValue\":\"0\",\"value\":\"1\",\"lastUpdate\":0,\"type\":\"number\"}",
            ]
        });
        await environmentProvider.push(envOut, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '1',
            TxType.TX_NONE
        );
        tx1.isValid();

        DEAFAUT_MAIN_ENV.blockHeight += 1; // next block
        tte = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '1',
            cost: 0,
            size: 2,
            ctx: fromSlice,
            debit: '1',
            logs: [],
            events: [],
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: ''
        });
    }, 1000);
});

describe('contracts', () => {
    test('deploy token', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();

        let tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeV2 }
        );
        tx.isValid();
        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");

        const expectedABI = [
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
        ]
        expect(tte.error).toEqual(undefined);
        expect(tte.txs.length).toEqual(1);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 30,
            size: 4554,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [
                `${contractAddress}-WC`,
                `${contractAddress}-CI`,
                `${contractAddress}-MD-2`,
                `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
                `${contractAddress}-V-1`,
            ],
            walletAddress: [],
            walletAmount: [],
            envs: {
                keys: [
                    `${contractAddress}-CI`,
                    `${contractAddress}-V-1`,
                    `${contractAddress}-MD-2`,
                    `${contractAddress}-MD-3`,
                    `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
                    `${contractAddress}-WC`,
                ], values: [
                    '3',
                    '"5000000000000000000000"',
                    '"0"',
                    '""',
                    '"5000000000000000000000"',
                    JSON.stringify({
                        status: 'locked',
                        abi: expectedABI,
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
                    }),
                ]
            },
            output: {
                abi: expectedABI,
                contractAddress: contractAddress,
            }
        });

        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "name", inputs: [] }]
        );
        tx.isValid();
        tte = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 7,
            size: 31,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [],
            get: [`${contractAddress}-WC`],
            walletAddress: [],
            walletAmount: [],
            envs: { keys: [], values: [] },
            output: 'SimpleToken'
        });
    }, 3000);

    test('token make transfer', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();
        const stealthAddress = wallet.getStealthAddress(0, 0);

        let tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeV2 }
        );
        tx.isValid();
        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "transfer", inputs: [stealthAddress, '1000'] }]
        );
        tx.isValid();
        tte = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs[0]).toEqual({
            feeUsed: '0',
            cost: 13,
            size: 93,
            ctx: fromSlice,
            debit: '0',
            logs: [],
            events: [
                {
                    contractAddress: contractAddress,
                    eventName: 'transfer',
                    entries: [
                        { key: "from", value: wallet.address },
                        { key: "to", value: stealthAddress },
                        { key: "amount", value: "1000" },
                    ],
                    hash: tx.hash
                }
            ],
            get: [
                `${contractAddress}-WC`,
                `${contractAddress}-MD-2`,
                `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
                `${contractAddress}-MV-2-${helper.stringToHash(stealthAddress)}`,
            ],
            walletAddress: [],
            walletAmount: [],
            envs: {
                keys: [
                    `${contractAddress}-MV-2-${helper.stringToHash(wallet.address)}`,
                    `${contractAddress}-MV-2-${helper.stringToHash(stealthAddress)}`,
                ], values: [
                    '"4999999999999999999000"',
                    '"1000"'
                ]
            },
            output: 'true'
        });
    }, 3000);

    test('token make transfer - throw insuficient funds', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();
        const stealthAddress = wallet.getStealthAddress(0, 0);

        let tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeV2 }
        );
        tx.isValid();
        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);

        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "transfer", inputs: [stealthAddress, '10000000000000000000000000000'] }]
        );
        tx.isValid();
        tte = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual("insuficient funds");
    }, 3000);

    test('token make transfer - throw changed key', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();
        const stealthAddress0 = wallet.getStealthAddress(0, 0);
        const stealthAddress1 = wallet.getStealthAddress(0, 1);

        let tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeV2 }
        );
        tx.isValid();
        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);

        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "transfer", inputs: [stealthAddress0, '1000'] }]
        );
        tx1.isValid();

        let tx2 = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            contractAddress,
            '0',
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: "transfer", inputs: [stealthAddress1, '1000'] }]
        );
        tx2.isValid();
        tte = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);

        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        let error = await bywise.transactionsProvider.executeTransaction(ctx, tte.txs[0], tte.outputs[0]);
        expect(error).toEqual(null);
        error = await bywise.transactionsProvider.executeTransaction(ctx, tte.txs[1], tte.outputs[1]);
        expect(error).toEqual("changed key");
    }, 3000);

    test('contract call other contracs', async () => {
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

        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(2);
        expect(tte.error).toEqual(undefined);

        let ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        await environmentProvider.push(ctx.getEnvOut(), chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tte = await bywise.transactionsProvider.simulateTransactions([tx3, tx4], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(2);
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs[0].output).toEqual("");
        expect(tte.outputs[1].output).toEqual("Banana");

        ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        await environmentProvider.push(ctx.getEnvOut(), chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tte = await bywise.transactionsProvider.simulateTransactions([tx5], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(1);
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs[0].output).toEqual("Banana");
    }, 1000);

    test('contract events', async () => {
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

        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(1);

        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tte = await bywise.transactionsProvider.simulateTransactions([tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].events).toEqual([{
            contractAddress: contractAddress,
            eventName: 'setValue',
            entries: [
                { key: "sender", value: wallet.address },
                { key: "new_value", value: "Banana" },
            ],
            hash: tx2.hash
        }]);
    }, 3000);

    test('cost - hardwork', async () => {
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
        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(1);
        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

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
        tte = await bywise.transactionsProvider.simulateTransactions([tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[0].output).toEqual("495000");
        expect(tte.outputs[0].cost).toEqual(9);

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
        tte = await bywise.transactionsProvider.simulateTransactions([tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].error).toEqual(undefined);
        expect(tte.outputs[0].output).toEqual("499500000");
        expect(tte.outputs[0].cost).toEqual(207);

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
        tte = await bywise.transactionsProvider.simulateTransactions([tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(1);
        expect(tte.outputs[0].error).toEqual("interrupted");
        expect(tte.outputs[0].output).toEqual(undefined);
        expect(tte.outputs[0].cost).toEqual(1026);
    }, 3000);

    test('cost - multiple calls', async () => {
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
        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(1);
        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

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

        tte = await bywise.transactionsProvider.simulateTransactions([tx2, tx3, tx4], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(3);
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs[0].output).toEqual("1");
        expect(tte.outputs[0].cost).toEqual(9);
        expect(tte.outputs[1].output).toEqual("10");
        expect(tte.outputs[1].cost).toEqual(90);
        expect(tte.outputs[2].output).toEqual("1");
        expect(tte.outputs[2].cost).toEqual(9);
    }, 3000);

    test('cost - call other contracs', async () => {
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

        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(2);
        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);
        await environmentProvider.push(tte.outputs[1].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

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

        tte = await bywise.transactionsProvider.simulateTransactions([tx3, tx4, tx5, tx6], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.outputs.length).toEqual(4);
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs[0].output).toEqual("1");
        expect(tte.outputs[0].cost).toEqual(34);
        expect(tte.outputs[0].envs).toEqual({
            keys: [
                `${contractAddress2}-V-1`,
            ], values: [
                '"1"',
            ]
        });
        expect(tte.outputs[1].output).toEqual("1");
        expect(tte.outputs[1].cost).toEqual(34);
        expect(tte.outputs[1].envs).toEqual({
            keys: [
                `${contractAddress}-V-1`,
            ], values: [
                '"1"',
            ]
        });
        expect(tte.outputs[2].output).toEqual("10");
        expect(tte.outputs[2].cost).toEqual(340);
        expect(tte.outputs[2].envs).toEqual({
            keys: [
                `${contractAddress2}-V-1`,
            ], values: [
                '"10"',
            ]
        });
        expect(tte.outputs[3].output).toEqual("10");
        expect(tte.outputs[3].cost).toEqual(196);
        expect(tte.outputs[3].envs).toEqual({
            keys: [
                `${contractAddress2}-V-1`,
            ], values: [
                '"10"',
            ]
        });
    }, 3000);

    test('cost - set fee by cost', async () => {
        let tx1 = await bywise.transactionsProvider.createNewTransactionFromWallet(
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
                    "1"
                ]
            }
        );
        tx2.isValid();

        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx1, tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(2);
        expect(tte.outputs[0].feeUsed).toEqual("0");
        expect(tte.outputs[1].feeUsed).toEqual("0");

        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);
        await environmentProvider.push(tte.outputs[1].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

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


        tte = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs[0].fee).toEqual("30");
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[0].debit).toEqual("0");
        expect(tte.outputs[0].feeUsed).toEqual("0");

        DEAFAUT_MAIN_ENV.blockHeight = 100;
        tte = await bywise.transactionsProvider.simulateTransactions([tx1], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs[0].fee).toEqual("30");
        expect(tte.outputs[0].cost).toEqual(30);
        expect(tte.outputs[0].debit).toEqual("30");
        expect(tte.outputs[0].feeUsed).toEqual("30");

        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        tte = await bywise.transactionsProvider.simulateTransactions([tx2], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.txs[0].fee).toEqual("30");
        expect(tte.outputs[0].cost).toEqual(9);
        expect(tte.outputs[0].debit).toEqual("9");
        expect(tte.outputs[0].feeUsed).toEqual("9");
    }, 1000);
});

describe('stress testing', () => {
    test('simple transactions', async () => {
        const txs: Tx[] = [];
        for (let i = 0; i < 100; i++) {
            const stealthAddress0 = wallet.getStealthAddress(i, 0);
            const stealthAddress1 = wallet.getStealthAddress(i, 1);

            let tx = new Tx();
            tx.chain = chain;
            tx.version = "3";
            tx.from = [stealthAddress0];
            tx.to = [stealthAddress1];
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
        const tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions(txs, fromSlice, DEAFAUT_MAIN_ENV);
        uptime = (new Date().getTime() - uptime) / 1000;

        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(100);
        expect(uptime).toBeLessThan(1);

        uptime = new Date().getTime();
        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        await environmentProvider.push(ctx.getEnvOut(), chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);
        uptime = (new Date().getTime() - uptime) / 1000;
        expect(uptime).toBeLessThan(0.1);
    }, 10000);

    test('contract transactions', async () => {
        const contractAddress = BywiseHelper.getBWSAddressContract();

        let tx = await bywise.transactionsProvider.createNewTransactionFromWallet(
            wallet,
            chain,
            wallet.address,
            '0',
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCodeCustom }
        );
        let tte: TransactionsToExecute | null = await bywise.transactionsProvider.simulateTransactions([tx], fromSlice, DEAFAUT_MAIN_ENV);
        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        await environmentProvider.push(tte.outputs[0].envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);

        const txs: Tx[] = [];
        for (let i = 0; i < 100; i++) {
            const stealthAddress0 = wallet.getStealthAddress(i, 0);
            const stealthAddress1 = wallet.getStealthAddress(i, 1);

            tx = new Tx();
            tx.chain = chain;
            tx.version = "3";
            tx.from = [stealthAddress0];
            tx.to = [contractAddress];
            tx.amount = ['0'];
            tx.type = TxType.TX_CONTRACT_EXE;
            tx.data = [{ method: 'transfer', inputs: [stealthAddress1, `1`] }];
            tx.foreignKeys = [];
            tx.created = helper.getNow();
            tx.fee = '0';
            tx.hash = tx.toHash();
            tx.sign = [''];
            txs.push(tx);
        }

        let uptime = new Date().getTime();
        tte = await bywise.transactionsProvider.simulateTransactions(txs, fromSlice, DEAFAUT_MAIN_ENV);
        uptime = (new Date().getTime() - uptime) / 1000;

        if(!tte) throw new Error("Failed execute VM");
        expect(tte.error).toEqual(undefined);
        expect(tte.outputs.length).toEqual(txs.length);
        expect(uptime).toBeLessThan(3);

        uptime = new Date().getTime();
        const ctx = new RuntimeContext(environmentProvider, DEAFAUT_MAIN_ENV);
        for (let i = 0; i < tte.outputs.length; i++) {
            const tx = tte.txs[i];
            const output = tte.outputs[i];
            const error = await bywise.transactionsProvider.executeTransaction(ctx, tx, output);
            expect(error).toEqual(null);
        }
        await environmentProvider.push(ctx.getEnvOut(), chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, fromSlice);
        uptime = (new Date().getTime() - uptime) / 1000;
        expect(uptime).toBeLessThan(0.1);
    }, 10000);
});