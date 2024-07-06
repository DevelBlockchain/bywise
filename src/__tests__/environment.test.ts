import { Block, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { EnvironmentProvider } from '../services';
import { BlockTree, CompiledContext } from '../types';
import helper from '../utils/helper';
import { RuntimeContext } from '../vm/RuntimeContext';

const chain = "local"
const wallet = new Wallet();
var bywise: Bywise;
var environmentProvider: EnvironmentProvider;
var blockTree: BlockTree;
const port0 = Math.floor(Math.random() * 7000 + 3000);

beforeAll(async () => {
    bywise = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: new Wallet().seed,
        startServices: [],
    });
    environmentProvider = new EnvironmentProvider(bywise.applicationContext);
}, 2000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
    blockTree = new BlockTree(chain);

    blockTree.addBlock({ lastHash: BlockTree.ZERO_HASH, hash: 'block_0', height: 0 });
    blockTree.addBlock({ lastHash: 'block_0', hash: 'block_1', height: 1 });
    blockTree.addBlock({ lastHash: 'block_1', hash: 'block_2', height: 2 });
    blockTree.addBlock({ lastHash: 'block_2', hash: 'block_3', height: 3 });
    blockTree.addBlock({ lastHash: 'block_3', hash: 'block_4', height: 4 });
    blockTree.addBlock({ lastHash: 'block_4', hash: 'block_5', height: 5 });
    // add soft fork
    blockTree.addBlock({ lastHash: 'block_1', hash: 'block_2.1', height: 2 });
    blockTree.addBlock({ lastHash: 'block_2.1', hash: 'block_3.1', height: 3 });
    blockTree.addBlock({ lastHash: 'block_3.1', hash: 'block_4.1', height: 4 });
    // set minned block tree
    const block_0 = new Block();
    block_0.hash = 'block_0';
    block_0.lastHash = BlockTree.ZERO_HASH;
    block_0.height = 0;
    blockTree.setMinnedBlock(block_0);

    const block_1 = new Block();
    block_1.hash = 'block_1';
    block_1.lastHash = 'block_0';
    block_1.height = 1;
    blockTree.setMinnedBlock(block_1);

    const block_2 = new Block();
    block_2.hash = 'block_2';
    block_2.lastHash = 'block_1';
    block_2.height = 2;
    blockTree.setMinnedBlock(block_2);

    const block_3 = new Block();
    block_3.hash = 'block_3';
    block_3.lastHash = 'block_2';
    block_3.height = 3;
    blockTree.setMinnedBlock(block_3);

    const block_4 = new Block();
    block_4.hash = 'block_4';
    block_4.lastHash = 'block_3';
    block_4.height = 4;
    blockTree.setMinnedBlock(block_4);

    const block_5 = new Block();
    block_5.hash = 'block_5';
    block_5.lastHash = 'block_4';
    block_5.height = 5;
    blockTree.setMinnedBlock(block_5);
}, 2000)

afterAll(async () => {
    await bywise.stop();
}, 2000)

describe('local operations', () => {

    test('set and get', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        await envContext.set('variable1', 'value1');
        await envContext.set('variable2', 'value2');

        let loadVar0 = await envContext.get('variable0');
        let loadVar1 = await envContext.get('variable1');
        let loadVar2 = await envContext.get('variable2');

        expect(loadVar0).toStrictEqual('');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
    });

    test('set and overwrite', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        let value = await envContext.get('variable1');
        expect(value).toStrictEqual('');

        await envContext.set('variable1', 'value1');
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('value1');

        await envContext.set('variable1', 'value2');
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('value2');
    });

    test('has and set', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        let has1 = await envContext.has('variable1');
        await envContext.set('variable1', 'value1');
        let has2 = await envContext.has('variable1');

        expect(has1).toEqual(false);
        expect(has2).toEqual(true);
    });

    test('set, delete, has, get', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        let has = await envContext.has('variable1');
        let value = await envContext.get('variable1');
        expect(has).toEqual(false);
        expect(value).toStrictEqual('');

        await envContext.set('variable1', 'value1');

        has = await envContext.has('variable1');
        value = await envContext.get('variable1');
        expect(has).toEqual(true);
        expect(value).toStrictEqual('value1');

        await envContext.delete('variable1');

        has = await envContext.has('variable1');
        value = await envContext.get('variable1');

        expect(has).toEqual(false);
        expect(value).toStrictEqual('');
    });

    test('delete commit', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        await envContext.set('variable1', 'value1');
        await envContext.set('variable2', 'value2');

        let loadVar1 = await envContext.get('variable1');
        let loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        envContext.deleteCommit();

        loadVar1 = await envContext.get('variable1');
        loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');
    });

    test('commit', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        await envContext.set('variable1', 'value1');
        await envContext.set('variable2', 'value2');

        // check stage values
        let loadVar1 = await envContext.get('variable1');
        let loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        envContext.commit();
        // check affter commit
        loadVar1 = await envContext.get('variable1');
        loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        // set new values
        await envContext.set('variable1', 'value3');
        await envContext.set('variable2', 'value4');
        // check new values
        loadVar1 = await envContext.get('variable1');
        loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value3');
        expect(loadVar2).toStrictEqual('value4');

        envContext.deleteCommit();

        // check stage values
        loadVar1 = await envContext.get('variable1');
        loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
    });
})

describe('distinct context operations', () => {

    test('distinct context', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        await envContext.set('variable1', 'value1');
        await envContext.set('variable2', 'value2');
        envContext.commit();

        const envContextOther = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let loadVar1 = await envContextOther.get('variable1');
        let loadVar2 = await envContextOther.get('variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');
    });

    test('push', async () => {
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let loadVar1 = await envContext.get('variable1');
        let loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');

        let slowLoadVar1 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        let slowLoadVar2 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable2');
        expect(slowLoadVar1).toStrictEqual('');
        expect(slowLoadVar2).toStrictEqual('');

        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await envContext.set('variable1', 'value1');
        await envContext.set('variable2', 'value2');
        const changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }
        envContext.setChanges(changes);
        await environmentProvider.push(changes.envOut, chain, 'block_1');

        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        loadVar1 = await envContext.get('variable1');
        loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');

        slowLoadVar1 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        slowLoadVar2 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable2');
        expect(slowLoadVar1).toStrictEqual('value1');
        expect(slowLoadVar2).toStrictEqual('value2');
    });

    test('two contexts same time', async () => {
        const envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 5,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        const envContextOther = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 5,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        await envContext.set('variable1', 'value1');
        await envContext.set('variable2', 'value2');

        let loadVar1 = await envContext.get('variable1');
        let loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
        loadVar1 = await envContextOther.get('variable1');
        loadVar2 = await envContextOther.get('variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');

        await envContextOther.set('variable1', 'val_2_other');
        await envContextOther.set('variable2', 'val_2_other');
        loadVar1 = await envContextOther.get('variable1');
        loadVar2 = await envContextOther.get('variable2');
        expect(loadVar1).toStrictEqual('val_2_other');
        expect(loadVar2).toStrictEqual('val_2_other');
        loadVar1 = await envContext.get('variable1');
        loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
    });

    test('test context cache', async () => {
        const envContext1 = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        const envContext2 = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        const envContext3 = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });

        await envContext1.set('variable1', 'value1');

        let value = await envContext2.get('variable1');
        expect(value).toStrictEqual(''); // before push

        const changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }
        envContext1.setChanges(changes);
        await environmentProvider.push(changes.envOut, chain, CompiledContext.MAIN_CONTEXT_HASH);

        value = await envContext2.get('variable1');
        expect(value).toStrictEqual(''); // before push - get from cache
        value = await envContext3.get('variable1');
        expect(value).toStrictEqual('value1'); // before push - get from database
    });
})

describe('context changes', () => {
    test('get', async () => {
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }

        await envContext.get('variable1');

        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: ['variable1'],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        });
    });

    test('set', async () => {
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }

        await envContext.set('variable1', 'value1');

        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: ['variable1'],
                values: ['value1'],
            }
        });
    });

    test('delete', async () => {
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }

        await envContext.delete('variable1');

        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: ['variable1'],
                values: [null],
            }
        });
    });

    test('wallet add', async () => {
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }

        await envContext.balanceAdd(wallet.address, '100');

        await expect(async () => {
            await envContext.balanceAdd("AAAAAAAAAAAAA", '100');
        }).rejects.toThrow(); // Invalid Address

        await expect(async () => {
            await envContext.balanceAdd(wallet.address, '-100');
        }).rejects.toThrow(); // Invalid Amount

        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['100'],
            envOut: {
                keys: [],
                values: [],
            }
        });
    });

    test('wallet sub', async () => {
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }

        await envContext.balanceSub(wallet.address, '100');

        await expect(async () => {
            await envContext.balanceSub("AAAAAAAAAAAAA", '100');
        }).rejects.toThrow(); // Invalid Address

        await expect(async () => {
            await envContext.balanceSub(wallet.address, '-100');
        }).rejects.toThrow(); // Invalid Amount

        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-100'],
            envOut: {
                keys: [],
                values: [],
            }
        });
    });

    test('wallet add and sub', async () => {
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        }

        await envContext.balanceAdd(wallet.address, '30');
        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['30'],
            envOut: {
                keys: [],
                values: [],
            }
        });

        await envContext.balanceSub(wallet.address, '45');
        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['-15'],
            envOut: {
                keys: [],
                values: [],
            }
        });

        await envContext.balanceAdd(wallet.address, '30');
        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [wallet.address],
            walletAmount: ['15'],
            envOut: {
                keys: [],
                values: [],
            }
        });

        await envContext.balanceSub(wallet.address, '15');
        envContext.setChanges(changes);
        expect(changes).toStrictEqual({
            get: [],
            walletAddress: [],
            walletAmount: [],
            envOut: {
                keys: [],
                values: [],
            }
        });
    });
})

describe('distinct blocks operations', () => {

    test('set and get', async () => {

        const env = {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }
        let loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual(undefined);
        let loadStr = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(loadStr).toStrictEqual('');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1');

        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual(undefined);
        loadStr = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(loadStr).toStrictEqual('value1');

        await environmentProvider.consolide(blockTree, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);

        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');
        loadStr = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(loadStr).toStrictEqual('value1');
    });

    test('set and get overwrite blocks - from RuntimeContext', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_2');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value2']
        }, chain, 'block_3');

        const env = {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }

        let envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.consolide(blockTree, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('');
        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.consolide(blockTree, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('value1');
        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.consolide(blockTree, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('value2');
        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.consolide(blockTree, 'block_4', CompiledContext.MAIN_CONTEXT_HASH);
        loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('value2');
    });

    test('set and get overwrite blocks - from environmentProvider.get', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_2');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value2']
        }, chain, 'block_3');

        const env = {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }

        await environmentProvider.consolide(blockTree, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual(undefined);
        await environmentProvider.consolide(blockTree, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');
        await environmentProvider.consolide(blockTree, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value2');
        await environmentProvider.consolide(blockTree, 'block_4', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value2');
    });

    test('set and get overwrite blocks - from environmentProvider.getSlow', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_2');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value2']
        }, chain, 'block_3');

        let loadStr = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(loadStr).toStrictEqual('');
        loadStr = await environmentProvider.getSlow(blockTree, 'block_2', 'variable1');
        expect(loadStr).toStrictEqual('value1');
        loadStr = await environmentProvider.getSlow(blockTree, 'block_3', 'variable1');
        expect(loadStr).toStrictEqual('value2');
        loadStr = await environmentProvider.getSlow(blockTree, 'block_4', 'variable1');
        expect(loadStr).toStrictEqual('value2');
    });

    test('has and set - from RuntimeContext', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value2']
        }, chain, 'block_2');

        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await environmentProvider.consolide(blockTree, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let has = await envContext.has('variable1');
        expect(has).toStrictEqual(false);

        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await environmentProvider.consolide(blockTree, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        has = await envContext.has('variable1');
        expect(has).toStrictEqual(true);

        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await environmentProvider.consolide(blockTree, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        has = await envContext.has('variable1');
        expect(has).toStrictEqual(true);
    });

    test('has and set - from environmentProvider.getSlow', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value2']
        }, chain, 'block_2');

        let has = await environmentProvider.hasSlow(blockTree, 'block_1', 'variable1');
        expect(has).toStrictEqual(false);
        has = await environmentProvider.hasSlow(blockTree, 'block_2', 'variable1');
        expect(has).toStrictEqual(true);
        has = await environmentProvider.hasSlow(blockTree, 'block_3', 'variable1');
        expect(has).toStrictEqual(true);
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1');
        await environmentProvider.push({
            keys: ['variable1'],
            values: [null]
        }, chain, 'block_2');

        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await environmentProvider.consolide(blockTree, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let has = await envContext.has('variable1');
        expect(has).toStrictEqual(true);
        let value = await envContext.get('variable1');
        expect(value).toStrictEqual('value1');

        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await environmentProvider.consolide(blockTree, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        has = await envContext.has('variable1');
        expect(has).toStrictEqual(false);
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('');

        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        await environmentProvider.consolide(blockTree, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        has = await envContext.has('variable1');
        expect(has).toStrictEqual(false);
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('');
    });
})

describe('soft fork operations', () => {

    test('set and get', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3']
        }, chain, 'block_3');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3.1']
        }, chain, 'block_3.1');

        let value = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');
        value = await environmentProvider.getSlow(blockTree, 'block_2', 'variable1');
        expect(value).toStrictEqual('value1');

        value = await environmentProvider.getSlow(blockTree, 'block_3', 'variable1');
        expect(value).toStrictEqual('value3');
        value = await environmentProvider.getSlow(blockTree, 'block_4', 'variable1');
        expect(value).toStrictEqual('value3');

        value = await environmentProvider.getSlow(blockTree, 'block_3.1', 'variable1');
        expect(value).toStrictEqual('value3.1');
        value = await environmentProvider.getSlow(blockTree, 'block_4.1', 'variable1');
        expect(value).toStrictEqual('value3.1');
    });

    test('has and set', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3.1']
        }, chain, 'block_3.1');

        let has1 = await environmentProvider.hasSlow(blockTree, 'block_4.1', 'variable1');
        let has2 = await environmentProvider.hasSlow(blockTree, 'block_4', 'variable1');

        expect(has1).toEqual(true);
        expect(has2).toEqual(false);
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3']
        }, chain, 'block_3');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3.1']
        }, chain, 'block_3.1');

        let has = await environmentProvider.hasSlow(blockTree, 'block_1', 'variable1');
        let value = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value1');

        has = await environmentProvider.hasSlow(blockTree, 'block_4.1', 'variable1');
        value = await environmentProvider.getSlow(blockTree, 'block_4.1', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value3.1');

        has = await environmentProvider.hasSlow(blockTree, 'block_4', 'variable1');
        value = await environmentProvider.getSlow(blockTree, 'block_4', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value3');

        await environmentProvider.push({
            keys: ['variable1'],
            values: [null]
        }, chain, 'block_3.1');

        has = await environmentProvider.hasSlow(blockTree, 'block_1', 'variable1');
        value = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value1');

        has = await environmentProvider.hasSlow(blockTree, 'block_4.1', 'variable1');
        value = await environmentProvider.getSlow(blockTree, 'block_4.1', 'variable1');
        expect(has).toStrictEqual(false);
        expect(value).toStrictEqual('');

        has = await environmentProvider.hasSlow(blockTree, 'block_4', 'variable1');
        value = await environmentProvider.getSlow(blockTree, 'block_4', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value3');
    });
})

describe('consolide tests', () => {
    test('consolide main_context', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1');

        let value = await environmentProvider.getSlow(blockTree, 'block_5', 'variable1');
        expect(value).toStrictEqual('value1');

        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let loadVar = await envContext.get('variable1');
        expect(loadVar).toStrictEqual('');

        await environmentProvider.consolide(blockTree, 'block_5', CompiledContext.MAIN_CONTEXT_HASH);

        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        loadVar = await envContext.get('variable1');
        expect(loadVar).toStrictEqual('value1');
    });

    test('consolide main_context - soft fork', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3']
        }, chain, 'block_3');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3.1']
        }, chain, 'block_3.1');
        
        await environmentProvider.consolide(blockTree, 'block_5', CompiledContext.MAIN_CONTEXT_HASH);
        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        let loadVar = await envContext.get('variable1');
        expect(loadVar).toStrictEqual('value3');

        await environmentProvider.consolide(blockTree, 'block_4.1', CompiledContext.MAIN_CONTEXT_HASH);
        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        loadVar = await envContext.get('variable1');
        expect(loadVar).toStrictEqual('value3.1');
    });
})

describe('blocktree', () => {

    test('get blocklist by hash', async () => {
        let blocklist = blockTree.getBlockList('block_5');
        expect(blocklist).toStrictEqual([
            BlockTree.ZERO_HASH,
            'block_0',
            'block_1',
            'block_2',
            'block_3',
            'block_4',
            'block_5',
        ]);

        blocklist = blockTree.getBlockList('block_4.1');
        expect(blocklist).toStrictEqual([
            BlockTree.ZERO_HASH,
            'block_0',
            'block_1',
            'block_2.1',
            'block_3.1',
            'block_4.1',
        ]);
    });

    test('get slicelist by hash', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.2',
                from: 'from_1',
                transactionsCount: 10,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_2',
                from: 'from_1',
                transactionsCount: 1,
                height: 2,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_3',
                from: 'from_1',
                transactionsCount: 1,
                height: 3,
                blockHeight: 6,
                end: true
            }
        ];
        slices.forEach(s => blockTree.addSlice(s));

        let sliceList = blockTree.getSliceList('slice_0').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0',
        ]);

        sliceList = blockTree.getSliceList('slice_1').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1',
        ]);

        sliceList = blockTree.getSliceList('slice_1.1').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1'
        ]);

        sliceList = blockTree.getSliceList('slice_2').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1',
            'slice_2',
        ]);

        sliceList = blockTree.getSliceList('slice_3').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1',
            'slice_2',
            'slice_3',
        ]);
    });

    test('get slicelist by hash - reverse insert order', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.2',
                from: 'from_1',
                transactionsCount: 10,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_2',
                from: 'from_1',
                transactionsCount: 1,
                height: 2,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_3',
                from: 'from_1',
                transactionsCount: 1,
                height: 3,
                blockHeight: 6,
                end: true
            }
        ];
        // invert insert order
        slices.reverse().forEach(s => blockTree.addSlice(s));

        let sliceList = blockTree.getSliceList('slice_0').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0',
        ]);

        sliceList = blockTree.getSliceList('slice_1').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1',
        ]);

        sliceList = blockTree.getSliceList('slice_1.1').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1'
        ]);

        sliceList = blockTree.getSliceList('slice_2').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1',
            'slice_2',
        ]);

        sliceList = blockTree.getSliceList('slice_3').map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1',
            'slice_2',
            'slice_3',
        ]);
    });

    test('get slicelist by height', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.2',
                from: 'from_1',
                transactionsCount: 10,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_2',
                from: 'from_1',
                transactionsCount: 1,
                height: 2,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_3',
                from: 'from_1',
                transactionsCount: 1,
                height: 3,
                blockHeight: 6,
                end: true
            }
        ];
        slices.forEach(s => blockTree.addSlice(s));

        let sliceList = blockTree.getBestSlice('from_2', 6).map(s => s.hash);
        expect(sliceList).toStrictEqual([]);

        sliceList = blockTree.getBestSlice('from_1', 5).map(s => s.hash);
        expect(sliceList).toStrictEqual([]);

        sliceList = blockTree.getBestSlice('from_1', 6).map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1',
            'slice_2',
            'slice_3',
        ]);
    });

    test('get slicelist by height - reverse insert order', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.2',
                from: 'from_1',
                transactionsCount: 10,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_2',
                from: 'from_1',
                transactionsCount: 1,
                height: 2,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_3',
                from: 'from_1',
                transactionsCount: 1,
                height: 3,
                blockHeight: 6,
                end: true
            }
        ];
        slices.reverse().forEach(s => blockTree.addSlice(s));

        let sliceList = blockTree.getBestSlice('from_1', 6).map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1',
            'slice_2',
            'slice_3',
        ]);
    });

    test('get slicelist by height - not ended', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.2',
                from: 'from_1',
                transactionsCount: 10,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_2',
                from: 'from_1',
                transactionsCount: 1,
                height: 2,
                blockHeight: 6,
                end: false
            }
        ];
        slices.forEach(s => blockTree.addSlice(s));

        let sliceList = blockTree.getBestSlice('from_1', 6).map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1',
            'slice_2'
        ]);
    });

    test('get slicelist by height - wrong end', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.2',
                from: 'from_1',
                transactionsCount: 10,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 1,
                blockHeight: 6,
                end: true // end true
            }, {
                hash: 'slice_2',
                from: 'from_1',
                transactionsCount: 1,
                height: 2,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_3',
                from: 'from_1',
                transactionsCount: 1,
                height: 3,
                blockHeight: 6,
                end: true
            }
        ];
        slices.forEach(s => blockTree.addSlice(s));

        let sliceList = blockTree.getBestSlice('from_1', 6).map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1'
        ]);
    });

    test('get slicelist by height - missing one', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_0.2',
                from: 'from_1',
                transactionsCount: 10,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1.1',
                from: 'from_1',
                transactionsCount: 5,
                height: 1,
                blockHeight: 6,
                end: false
            }, { // missing slice 2
                hash: 'slice_3',
                from: 'from_1',
                transactionsCount: 1,
                height: 3,
                blockHeight: 6,
                end: true
            }
        ];
        slices.forEach(s => blockTree.addSlice(s));

        let sliceList = blockTree.getBestSlice('from_1', 6).map(s => s.hash);
        expect(sliceList).toStrictEqual([
            'slice_0.2',
            'slice_1.1'
        ]);
    });
});

describe('slice operations', () => {
    test('get slicelist by height', async () => {
        let slices = [
            {
                hash: 'slice_0',
                from: 'from_1',
                transactionsCount: 1,
                height: 0,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_1',
                from: 'from_1',
                transactionsCount: 1,
                height: 1,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_2',
                from: 'from_1',
                transactionsCount: 1,
                height: 2,
                blockHeight: 6,
                end: false
            }, {
                hash: 'slice_3',
                from: 'from_1',
                transactionsCount: 1,
                height: 3,
                blockHeight: 6,
                end: true
            }
        ];
        slices.forEach(s => blockTree.addSlice(s));

        await environmentProvider.push({
            keys: ['variable0', 'variable1'],
            values: ['value0', 'value1']
        }, chain, 'block_1');

        await environmentProvider.push({
            keys: ['variable1', 'variable2'],
            values: ['slice_value_1', 'slice_value_2']
        }, chain, 'slice_1');

        await environmentProvider.push({
            keys: ['variable1'],
            values: [null]
        }, chain, 'slice_2');

        let value = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');
        value = await environmentProvider.getSlow(blockTree, 'block_5', 'variable1');
        expect(value).toStrictEqual('value1');
        value = await environmentProvider.getSlow(blockTree, 'slice_0', 'variable1');
        expect(value).toStrictEqual('value1');

        value = await environmentProvider.getSlow(blockTree, 'slice_1', 'variable1');
        expect(value).toStrictEqual('slice_value_1');

        value = await environmentProvider.getSlow(blockTree, 'slice_2', 'variable1');
        expect(value).toStrictEqual('');
        value = await environmentProvider.getSlow(blockTree, 'slice_2', 'variable2');
        expect(value).toStrictEqual('slice_value_2');

        let envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 6,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        value = await envContext.get('variable0');
        expect(value).toStrictEqual('');
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('');
        value = await envContext.get('variable2');
        expect(value).toStrictEqual('');

        await environmentProvider.consolide(blockTree, 'block_5', CompiledContext.MAIN_CONTEXT_HASH);
        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 5,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        value = await envContext.get('variable0');
        expect(value).toStrictEqual('value0');
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('value1');
        value = await envContext.get('variable2');
        expect(value).toStrictEqual('');

        await environmentProvider.consolide(blockTree, 'slice_1', CompiledContext.MAIN_CONTEXT_HASH);
        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 6,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        value = await envContext.get('variable0');
        expect(value).toStrictEqual('value0');
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('slice_value_1');
        value = await envContext.get('variable2');
        expect(value).toStrictEqual('slice_value_2');

        await environmentProvider.consolide(blockTree, 'slice_2', CompiledContext.MAIN_CONTEXT_HASH);
        envContext = new RuntimeContext(environmentProvider, {
            chain: chain,
            blockHeight: 6,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        });
        value = await envContext.get('variable0');
        expect(value).toStrictEqual('value0');
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('');
        value = await envContext.get('variable2');
        expect(value).toStrictEqual('slice_value_2');
    });
});