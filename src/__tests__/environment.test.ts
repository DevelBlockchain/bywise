import { Block, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { EnvironmentProvider } from '../services/environment.service';
import { BlockTree, EnvironmentContext } from '../types/environment.types';
import helper from '../utils/helper';

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
}, 30000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
    blockTree = new BlockTree('local');

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
})

afterAll(async () => {
    await bywise.stop();
}, 30000)

describe('local operations', () => {

    test('set and get', async () => {
        const envContext = new EnvironmentContext(blockTree, 1, 'block_1');

        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.set(envContext, 'variable2', 'value2');

        let loadVar0 = await environmentProvider.get(envContext, 'variable0');
        let loadVar1 = await environmentProvider.get(envContext, 'variable1');
        let loadVar2 = await environmentProvider.get(envContext, 'variable2');

        expect(loadVar0).toStrictEqual('');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        await envContext.dispose();
    });

    test('set and overwrite', async () => {
        const envContext = new EnvironmentContext(blockTree, 1, 'block_1');

        let value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('');

        await environmentProvider.set(envContext, 'variable1', 'value1');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('value1');

        await environmentProvider.set(envContext, 'variable1', 'value2');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('value2');

        await envContext.dispose();
    });

    test('has and set', async () => {
        const envContext = new EnvironmentContext(blockTree, 1, 'block_1');

        let has1 = await environmentProvider.has(envContext, 'variable1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        let has2 = await environmentProvider.has(envContext, 'variable1');

        expect(has1).toEqual(false);
        expect(has2).toEqual(true);

        await envContext.dispose();
    });

    test('set, delete, has, get', async () => {
        const envContext = new EnvironmentContext(blockTree, 1, 'block_1');

        let has = await environmentProvider.has(envContext, 'variable1');
        let value = await environmentProvider.get(envContext, 'variable1');
        expect(has).toEqual(false);
        expect(value).toStrictEqual('');

        await environmentProvider.set(envContext, 'variable1', 'value1');

        has = await environmentProvider.has(envContext, 'variable1');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(has).toEqual(true);
        expect(value).toStrictEqual('value1');

        await environmentProvider.delete(envContext, 'variable1');

        has = await environmentProvider.has(envContext, 'variable1');
        value = await environmentProvider.get(envContext, 'variable1');

        expect(has).toEqual(false);
        expect(value).toStrictEqual('');

        await envContext.dispose();
    });

    test('delete commit', async () => {
        const envContext5 = new EnvironmentContext(blockTree, 5, 'block_5');

        await environmentProvider.set(envContext5, 'variable1', 'value1');
        await environmentProvider.set(envContext5, 'variable2', 'value2');

        let loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        let loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        await environmentProvider.deleteCommit(envContext5);

        loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');

        await envContext5.dispose();
    });

    test('commit', async () => {
        const envContext5 = new EnvironmentContext(blockTree, 5, 'block_5');

        await environmentProvider.set(envContext5, 'variable1', 'value1');
        await environmentProvider.set(envContext5, 'variable2', 'value2');

        // check stage values
        let loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        let loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        await environmentProvider.commit(envContext5);
        // check affter commit
        loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        // set new values
        await environmentProvider.set(envContext5, 'variable1', 'value3');
        await environmentProvider.set(envContext5, 'variable2', 'value4');
        // check new values
        loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('value3');
        expect(loadVar2).toStrictEqual('value4');

        await environmentProvider.deleteCommit(envContext5);

        // check stage values
        loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        await envContext5.dispose();
    });
})

describe('distinct context operations', () => {

    test('distinct context', async () => {
        const envContext = new EnvironmentContext(blockTree, 1, 'block_1');

        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.set(envContext, 'variable2', 'value2');
        await environmentProvider.commit(envContext);
        await envContext.dispose();

        const envContextOther = new EnvironmentContext(blockTree, 1, 'block_1');
        let loadVar1 = await environmentProvider.get(envContextOther, 'variable1');
        let loadVar2 = await environmentProvider.get(envContextOther, 'variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');
        await envContextOther.dispose();
    });

    test('push', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        let loadVar1 = await environmentProvider.get(envContext, 'variable1');
        let loadVar2 = await environmentProvider.get(envContext, 'variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');
        await envContext.dispose();

        let slowLoadVar1 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        let slowLoadVar2 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable2');
        expect(slowLoadVar1).toStrictEqual('');
        expect(slowLoadVar2).toStrictEqual('');

        envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.set(envContext, 'variable2', 'value2');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        loadVar1 = await environmentProvider.get(envContext, 'variable1');
        loadVar2 = await environmentProvider.get(envContext, 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
        await envContext.dispose();

        slowLoadVar1 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        slowLoadVar2 = await environmentProvider.getSlow(blockTree, 'block_1', 'variable2');
        expect(slowLoadVar1).toStrictEqual('value1');
        expect(slowLoadVar2).toStrictEqual('value2');
    });

    test('push before commit', async () => {
        let slowLoadValue = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(slowLoadValue).toStrictEqual('');

        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');

        slowLoadValue = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(slowLoadValue).toStrictEqual('');

        await expect(async () => {
            await environmentProvider.push(envContext, 'block_1');
        }).rejects.toThrow('Environment context not commited');

        slowLoadValue = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(slowLoadValue).toStrictEqual('');

        await environmentProvider.commit(envContext);

        slowLoadValue = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(slowLoadValue).toStrictEqual('');

        await environmentProvider.push(envContext, 'block_1');

        slowLoadValue = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(slowLoadValue).toStrictEqual('value1');

        await envContext.dispose();

        slowLoadValue = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(slowLoadValue).toStrictEqual('value1');
    });

    test('two contexts same time', async () => {
        const envContext5 = new EnvironmentContext(blockTree, 5, 'block_5');
        const envContext5Other = new EnvironmentContext(blockTree, 5, 'block_5');

        await environmentProvider.set(envContext5, 'variable1', 'value1');
        await environmentProvider.set(envContext5, 'variable2', 'value2');

        let loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        let loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
        loadVar1 = await environmentProvider.get(envContext5Other, 'variable1');
        loadVar2 = await environmentProvider.get(envContext5Other, 'variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');

        await environmentProvider.set(envContext5Other, 'variable1', 'val_2_other');
        await environmentProvider.set(envContext5Other, 'variable2', 'val_2_other');
        loadVar1 = await environmentProvider.get(envContext5Other, 'variable1');
        loadVar2 = await environmentProvider.get(envContext5Other, 'variable2');
        expect(loadVar1).toStrictEqual('val_2_other');
        expect(loadVar2).toStrictEqual('val_2_other');
        loadVar1 = await environmentProvider.get(envContext5, 'variable1');
        loadVar2 = await environmentProvider.get(envContext5, 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        await envContext5.dispose();
        await envContext5Other.dispose();
    });

    test('test context cache', async () => {
        let envContext1 = new EnvironmentContext(blockTree, 1, 'block_1');
        let envContext2 = new EnvironmentContext(blockTree, 1, 'block_1');
        let envContext3 = new EnvironmentContext(blockTree, 1, 'block_1');

        await environmentProvider.set(envContext1, 'variable1', 'value1');
        await environmentProvider.commit(envContext1);

        let value = await environmentProvider.get(envContext2, 'variable1');
        expect(value).toStrictEqual(''); // before push

        await environmentProvider.push(envContext1, 'block_1');

        value = await environmentProvider.get(envContext2, 'variable1');
        expect(value).toStrictEqual(''); // before push - get from cache
        value = await environmentProvider.get(envContext3, 'variable1');
        expect(value).toStrictEqual('value1'); // before push - get from database

        await envContext1.dispose();
        await envContext2.dispose();
        await envContext3.dispose();
    });
})

describe('distinct blocks operations', () => {

    test('set and get', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        let loadVar = await environmentProvider.get(envContext, 'variable1');
        await envContext.dispose();

        expect(loadVar).toStrictEqual('value1');
    });

    test('set and get overwrite blocks', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        await environmentProvider.set(envContext, 'variable1', 'value2');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_2');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 3, 'block_3');
        await environmentProvider.set(envContext, 'variable1', 'value3');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        let value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('value1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('value2');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 3, 'block_3');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('value3');
        await envContext.dispose();

        value = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');
    });

    test('set and get overwrite blocks - slow', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        await environmentProvider.set(envContext, 'variable1', 'value2');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_2');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 3, 'block_3');
        await environmentProvider.set(envContext, 'variable1', 'value3');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3');
        await envContext.dispose();

        let value = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');

        value = await environmentProvider.getSlow(blockTree, 'block_2', 'variable1');
        expect(value).toStrictEqual('value2');

        value = await environmentProvider.getSlow(blockTree, 'block_3', 'variable1');
        expect(value).toStrictEqual('value3');
    });

    test('has and set', async () => {
        let envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_2');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        let has1 = await environmentProvider.has(envContext, 'variable1');
        expect(has1).toEqual(false);
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        let has2 = await environmentProvider.has(envContext, 'variable1');
        expect(has2).toEqual(true);
        await envContext.dispose();
    });

    test('set, delete, has, get', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        await environmentProvider.delete(envContext, 'variable1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_2');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        let has = await environmentProvider.has(envContext, 'variable1');
        let value = await environmentProvider.get(envContext, 'variable1');
        expect(has).toEqual(true);
        expect(value).toStrictEqual('value1');
        await envContext.dispose();


        envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        has = await environmentProvider.has(envContext, 'variable1');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(has).toEqual(false);
        expect(value).toStrictEqual('');
        await envContext.dispose();
    });
})

describe('soft fork operations', () => {

    test('set and get', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 3, 'block_3');
        await environmentProvider.set(envContext, 'variable1', 'value3');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 1, 'block_3.1');
        await environmentProvider.set(envContext, 'variable1', 'value3.1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3.1');
        await envContext.dispose();

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
        let envContext = new EnvironmentContext(blockTree, 3, 'block_3.1');
        await environmentProvider.set(envContext, 'variable1', 'value3.1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3.1');
        await envContext.dispose();

        let has1 = await environmentProvider.hasSlow(blockTree, 'block_4.1', 'variable1');
        let has2 = await environmentProvider.hasSlow(blockTree, 'block_4', 'variable1');

        expect(has1).toEqual(true);
        expect(has2).toEqual(false);
    });

    test('set, delete, has, get', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 3, 'block_3');
        await environmentProvider.set(envContext, 'variable1', 'value3');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 1, 'block_3.1');
        await environmentProvider.set(envContext, 'variable1', 'value3.1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3.1');
        await envContext.dispose();

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

        envContext = new EnvironmentContext(blockTree, 1, 'block_3.1');
        await environmentProvider.delete(envContext, 'variable1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_3.1');

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
    test('set and get from main_context', async () => {
        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');

        await environmentProvider.set(envContext, 'variable1', 'value2');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, EnvironmentContext.MAIN_CONTEXT_HASH); // save value2 on main_context
        await envContext.dispose();

        let value = await environmentProvider.getSlow(blockTree, 'block_5', 'variable1');
        expect(value).toStrictEqual('value1');

        envContext = new EnvironmentContext(blockTree, 5, 'block_5');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('value1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 5, EnvironmentContext.MAIN_CONTEXT_HASH);
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('value2');
        await envContext.dispose();
    });

    test('consolide main_context', async () => {
        let envContext = new EnvironmentContext(blockTree, 0, 'block_0');
        await environmentProvider.set(envContext, 'variable0', 'first_blockchain');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_0');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 2, 'block_2');
        await environmentProvider.set(envContext, 'variable1', 'middle_blockchain');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_2');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 5, 'block_5');
        await environmentProvider.set(envContext, 'variable2', 'last_block_blockchain');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_5');
        await envContext.dispose();

        let value = await environmentProvider.getSlow(blockTree, 'block_0', 'variable0');
        expect(value).toStrictEqual('first_blockchain');
        value = await environmentProvider.getSlow(blockTree, 'block_2', 'variable1');
        expect(value).toStrictEqual('middle_blockchain');
        value = await environmentProvider.getSlow(blockTree, 'block_5', 'variable2');
        expect(value).toStrictEqual('last_block_blockchain');

        envContext = new EnvironmentContext(blockTree, 5, 'block_5'); // enviroment from old block
        value = await environmentProvider.get(envContext, 'variable0');
        expect(value).toStrictEqual('first_blockchain');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('middle_blockchain');
        value = await environmentProvider.get(envContext, 'variable2');
        expect(value).toStrictEqual('last_block_blockchain'); // It will only be set in block 5
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 5, EnvironmentContext.MAIN_CONTEXT_HASH); // enviroment from main_context
        value = await environmentProvider.get(envContext, 'variable0');
        expect(value).toStrictEqual(''); // main_context is empty
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual(''); // main_context is empty
        value = await environmentProvider.get(envContext, 'variable2');
        expect(value).toStrictEqual(''); // main_context is empty
        await envContext.dispose();

        await environmentProvider.consolide(blockTree); // populate main_context

        envContext = new EnvironmentContext(blockTree, 5, EnvironmentContext.MAIN_CONTEXT_HASH); // enviroment from main_context
        value = await environmentProvider.get(envContext, 'variable0');
        expect(value).toStrictEqual('first_blockchain');
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('middle_blockchain');
        value = await environmentProvider.get(envContext, 'variable2');
        expect(value).toStrictEqual('last_block_blockchain');
        await envContext.dispose();
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

        let envContext = new EnvironmentContext(blockTree, 1, 'block_1');
        await environmentProvider.set(envContext, 'variable1', 'value1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'block_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 6, 'slice_1');
        await environmentProvider.set(envContext, 'variable1', 'slice_value_1');
        await environmentProvider.set(envContext, 'variable2', 'slice_value_2');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'slice_1');
        await envContext.dispose();

        envContext = new EnvironmentContext(blockTree, 6, 'slice_2');
        await environmentProvider.delete(envContext, 'variable1');
        await environmentProvider.commit(envContext);
        await environmentProvider.push(envContext, 'slice_2');
        await envContext.dispose();

        let value = await environmentProvider.getSlow(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');
        value = await environmentProvider.getSlow(blockTree, 'slice_0', 'variable1');
        expect(value).toStrictEqual('value1');

        value = await environmentProvider.getSlow(blockTree, 'slice_1', 'variable1');
        expect(value).toStrictEqual('slice_value_1');

        value = await environmentProvider.getSlow(blockTree, 'slice_2', 'variable1');
        expect(value).toStrictEqual('');
        value = await environmentProvider.getSlow(blockTree, 'slice_2', 'variable2');
        expect(value).toStrictEqual('slice_value_2');

        envContext = new EnvironmentContext(blockTree, 6, 'slice_2'); 
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('');
        value = await environmentProvider.get(envContext, 'variable2');
        expect(value).toStrictEqual('slice_value_2');
        await envContext.dispose();
        
        envContext = new EnvironmentContext(blockTree, 6, EnvironmentContext.MAIN_CONTEXT_HASH); 
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('');
        value = await environmentProvider.get(envContext, 'variable2');
        expect(value).toStrictEqual('');
        await envContext.dispose();

        await environmentProvider.consolide(blockTree); // populate main_context
        await environmentProvider.mergeContext(blockTree.chain, 'slice_0', EnvironmentContext.MAIN_CONTEXT_HASH);
        await environmentProvider.mergeContext(blockTree.chain, 'slice_1', EnvironmentContext.MAIN_CONTEXT_HASH);
        await environmentProvider.mergeContext(blockTree.chain, 'slice_2', EnvironmentContext.MAIN_CONTEXT_HASH);

        envContext = new EnvironmentContext(blockTree, 6, EnvironmentContext.MAIN_CONTEXT_HASH); 
        value = await environmentProvider.get(envContext, 'variable1');
        expect(value).toStrictEqual('');
        value = await environmentProvider.get(envContext, 'variable2');
        expect(value).toStrictEqual('slice_value_2');
        await envContext.dispose();
    });
});