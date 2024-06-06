import { Block, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { EnvironmentProvider } from '../services/environment.service';
import { BlockTree } from '../types/environment.types';
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
        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block_1', 'variable2', 'value2');

        let loadVar0 = await environmentProvider.get(blockTree, 'block_1', 'variable0');
        let loadVar1 = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block_1', 'variable2');

        expect(loadVar0).toStrictEqual('');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
    });

    test('set and overwrite', async () => {
        let value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('');

        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');

        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value2');
        value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value2');
    });

    test('has and set', async () => {
        let has1 = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        let has2 = await environmentProvider.has(blockTree, 'block_1', 'variable1');

        expect(has1).toEqual(false);
        expect(has2).toEqual(true);
    });

    test('set, delete, has, get', async () => {
        let has = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        let value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(has).toEqual(false);
        expect(value).toStrictEqual('');

        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');

        has = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(has).toEqual(true);
        expect(value).toStrictEqual('value1');

        await environmentProvider.delete(blockTree, 'block_1', 'variable1');

        has = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        value = await environmentProvider.get(blockTree, 'block_1', 'variable1');

        expect(has).toEqual(false);
        expect(value).toStrictEqual('');
    });

    test('delete values', async () => {
        await environmentProvider.set(blockTree, 'block_5', 'variable1', 'before1');
        await environmentProvider.set(blockTree, 'block_5', 'variable2', 'before2');
        blockTree.addBlock({ lastHash: 'block_5', hash: 'simulation', height: 6 });

        await environmentProvider.set(blockTree, 'simulation', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'simulation', 'variable2', 'value2');
        let loadVar1 = await environmentProvider.get(blockTree, 'simulation', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'simulation', 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        await environmentProvider.delete(blockTree, 'simulation', 'variable1');
        await environmentProvider.delete(blockTree, 'simulation', 'variable2');

        loadVar1 = await environmentProvider.get(blockTree, 'simulation', 'variable1');
        loadVar2 = await environmentProvider.get(blockTree, 'simulation', 'variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');
    });

    test('delete simulation', async () => {
        await environmentProvider.set(blockTree, 'block_5', 'variable1', 'before1');
        await environmentProvider.set(blockTree, 'block_5', 'variable2', 'before2');
        blockTree.addBlock({ lastHash: 'block_5', hash: 'simulation', height: 6 });

        await environmentProvider.set(blockTree, 'simulation', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'simulation', 'variable2', 'value2');
        let loadVar1 = await environmentProvider.get(blockTree, 'simulation', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'simulation', 'variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        await environmentProvider.deleteSimulation(blockTree, 'simulation');

        await expect(async () => {
            await environmentProvider.get(blockTree, 'simulation', 'variable1');
        }).rejects.toThrow('contextHash not found simulation');

        await expect(async () => {
            await environmentProvider.get(blockTree, 'simulation', 'variable2');
        }).rejects.toThrow('contextHash not found simulation');
    });
})

describe('distinct blocks operations', () => {

    test('set and get', async () => {
        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        let loadVar = await environmentProvider.get(blockTree, 'block_2', 'variable1');

        expect(loadVar).toStrictEqual('value1');
    });

    test('set and get overwrite blocks', async () => {
        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block_2', 'variable1', 'value2');
        await environmentProvider.set(blockTree, 'block_3', 'variable1', 'value3');

        let loadVar1 = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block_2', 'variable1');
        let loadVar3 = await environmentProvider.get(blockTree, 'block_3', 'variable1');

        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
        expect(loadVar3).toStrictEqual('value3');
    });

    test('has and set', async () => {
        await environmentProvider.set(blockTree, 'block_2', 'variable1', 'value1');
        let has1 = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block_2', 'variable1');

        expect(has1).toEqual(false);
        expect(has2).toEqual(true);
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        await environmentProvider.delete(blockTree, 'block_2', 'variable1');

        let has1 = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block_2', 'variable1');

        let loadVar1 = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block_2', 'variable1');

        expect(has1).toEqual(true);
        expect(has2).toEqual(false);
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('');
    });
})

describe('soft fork operations', () => {

    test('set and get', async () => {
        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block_3', 'variable1', 'value3');
        await environmentProvider.set(blockTree, 'block_3.1', 'variable1', 'value3.1');

        let value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');
        value = await environmentProvider.get(blockTree, 'block_2', 'variable1');
        expect(value).toStrictEqual('value1');

        value = await environmentProvider.get(blockTree, 'block_3', 'variable1');
        expect(value).toStrictEqual('value3');
        value = await environmentProvider.get(blockTree, 'block_4', 'variable1');
        expect(value).toStrictEqual('value3');

        value = await environmentProvider.get(blockTree, 'block_3.1', 'variable1');
        expect(value).toStrictEqual('value3.1');
        value = await environmentProvider.get(blockTree, 'block_4.1', 'variable1');
        expect(value).toStrictEqual('value3.1');
    });

    test('has and set', async () => {
        await environmentProvider.set(blockTree, 'block_3.1', 'variable1', 'value3.1');
        let has1 = await environmentProvider.has(blockTree, 'block_4.1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block_4', 'variable1');

        expect(has1).toEqual(true);
        expect(has2).toEqual(false);
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block_3', 'variable1', 'value3');
        await environmentProvider.set(blockTree, 'block_3.1', 'variable1', 'value3.1');

        let has = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        let value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value1');

        has = await environmentProvider.has(blockTree, 'block_4.1', 'variable1');
        value = await environmentProvider.get(blockTree, 'block_4.1', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value3.1');

        has = await environmentProvider.has(blockTree, 'block_4', 'variable1');
        value = await environmentProvider.get(blockTree, 'block_4', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value3');

        await environmentProvider.delete(blockTree, 'block_3.1', 'variable1');

        has = await environmentProvider.has(blockTree, 'block_1', 'variable1');
        value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value1');

        has = await environmentProvider.has(blockTree, 'block_4.1', 'variable1');
        value = await environmentProvider.get(blockTree, 'block_4.1', 'variable1');
        expect(has).toStrictEqual(false);
        expect(value).toStrictEqual('');

        has = await environmentProvider.has(blockTree, 'block_4', 'variable1');
        value = await environmentProvider.get(blockTree, 'block_4', 'variable1');
        expect(has).toStrictEqual(true);
        expect(value).toStrictEqual('value3');
    });
})

describe('consolide tests', () => {

    test('set and get', async () => {
        blockTree.addBlock({ lastHash: 'block_5', hash: 'simulation', height: 6 });

        await environmentProvider.set(blockTree, 'simulation', 'variable1', 'value1');
        let value = await environmentProvider.get(blockTree, 'simulation', 'variable1');
        expect(value).toStrictEqual('value1');

        blockTree.addBlock({ lastHash: 'block_5', hash: 'block6', height: 6 });

        value = await environmentProvider.get(blockTree, 'block6', 'variable1');
        expect(value).toStrictEqual('');

        await environmentProvider.mergeContext(blockTree, 'simulation', 'block6');
        await environmentProvider.deleteSimulation(blockTree, 'simulation');

        value = await environmentProvider.get(blockTree, 'block6', 'variable1');
        expect(value).toStrictEqual('value1');
        await expect(async () => {
            await environmentProvider.get(blockTree, 'simulation', 'variable1');
        }).rejects.toThrow('contextHash not found simulation');
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

        await environmentProvider.set(blockTree, 'block_1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'slice_1', 'variable1', 'slice_value_1');
        await environmentProvider.set(blockTree, 'slice_1', 'variable2', 'slice_value_2');
        await environmentProvider.set(blockTree, 'slice_1', 'variable2', 'slice_value_2');
        await environmentProvider.delete(blockTree, 'slice_2', 'variable1');

        let value = await environmentProvider.get(blockTree, 'block_1', 'variable1');
        expect(value).toStrictEqual('value1');
        value = await environmentProvider.get(blockTree, 'slice_0', 'variable1');
        expect(value).toStrictEqual('value1');

        value = await environmentProvider.get(blockTree, 'slice_1', 'variable1');
        expect(value).toStrictEqual('slice_value_1');

        value = await environmentProvider.get(blockTree, 'slice_2', 'variable1');
        expect(value).toStrictEqual('');
    });
});