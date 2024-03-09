import { Wallet } from '@bywise/web3';
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
    blockTree.addHash(BlockTree.ZERO_HASH, 'block1');
    blockTree.addHash('block1', 'block2');
    blockTree.addHash('block2', 'block3');
    // soft fork
    blockTree.addHash('block3', 'block4.1');
    blockTree.addHash('block3', 'block4.2');
    blockTree.addHash('block4.1', 'block5.1');
    blockTree.addHash('block4.2', 'block5.2');
    blockTree.addHash('block5.1', 'block6.1');
    blockTree.addHash('block5.2', 'block6.2');
})

afterAll(async () => {
    await bywise.stop();
}, 30000)

describe('local operations', () => {

    test('set and get', async () => {
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block1', 'variable2', 'value2');

        let loadVar0 = await environmentProvider.get(blockTree, 'block1', 'variable0');
        let loadVar1 = await environmentProvider.get(blockTree, 'block1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block1', 'variable2');

        expect(loadVar0).toStrictEqual('');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
    });

    test('has and set', async () => {
        let has1 = await environmentProvider.has(blockTree, 'block1', 'variable1');
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        let has2 = await environmentProvider.has(blockTree, 'block1', 'variable1');

        expect(has1).toEqual(false);
        expect(has2).toEqual(true);
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        let has1 = await environmentProvider.has(blockTree, 'block1', 'variable1');
        await environmentProvider.delete(blockTree, 'block1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block1', 'variable1');
        let loadVar = await environmentProvider.get(blockTree, 'block1', 'variable1');

        expect(has1).toEqual(true);
        expect(has2).toEqual(false);
        expect(loadVar).toStrictEqual('');
    });

    test('delete simulation', async () => {
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block1', 'variable2', 'value2');

        await environmentProvider.deleteSimulation(blockTree, 'block1');

        blockTree.addHash(BlockTree.ZERO_HASH, 'block1');

        let loadVar1 = await environmentProvider.get(blockTree, 'block1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block1', 'variable2');

        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');
    });
})

describe('distinct blocks operations', () => {

    test('set and get', async () => {
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        let loadVar = await environmentProvider.get(blockTree, 'block2', 'variable1');

        expect(loadVar).toStrictEqual('value1');
    });

    test('set and get overwrite blocks', async () => {
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block2', 'variable1', 'value2');
        await environmentProvider.set(blockTree, 'block3', 'variable1', 'value3');

        let loadVar1 = await environmentProvider.get(blockTree, 'block1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block2', 'variable1');
        let loadVar3 = await environmentProvider.get(blockTree, 'block3', 'variable1');

        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
        expect(loadVar3).toStrictEqual('value3');
    });

    test('has and set', async () => {
        await environmentProvider.set(blockTree, 'block2', 'variable1', 'value1');
        let has1 = await environmentProvider.has(blockTree, 'block1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block2', 'variable1');

        expect(has1).toEqual(false);
        expect(has2).toEqual(true);
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        await environmentProvider.delete(blockTree, 'block2', 'variable1');

        let has1 = await environmentProvider.has(blockTree, 'block1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block2', 'variable1');

        let loadVar1 = await environmentProvider.get(blockTree, 'block1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block2', 'variable1');

        expect(has1).toEqual(true);
        expect(has2).toEqual(false);
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('');
    });
})

describe('soft fork operations', () => {

    test('set and get', async () => {
        await environmentProvider.set(blockTree, 'block1', 'variable1', 'value1');
        await environmentProvider.set(blockTree, 'block4.1', 'variable1', 'value4.1');
        await environmentProvider.set(blockTree, 'block6.2', 'variable1', 'value6.2');

        let loadVar3 = await environmentProvider.get(blockTree, 'block3', 'variable1');
        let loadVar52 = await environmentProvider.get(blockTree, 'block5.2', 'variable1');
        let loadVar61 = await environmentProvider.get(blockTree, 'block6.1', 'variable1');
        let loadVar62 = await environmentProvider.get(blockTree, 'block6.2', 'variable1');

        expect(loadVar3).toStrictEqual('value1');
        expect(loadVar52).toStrictEqual('value1');
        expect(loadVar61).toStrictEqual('value4.1');
        expect(loadVar62).toStrictEqual('value6.2');
    });

    test('has and set', async () => {
        await environmentProvider.set(blockTree, 'block5.1', 'variable1', 'value5.1');
        let has1 = await environmentProvider.has(blockTree, 'block6.1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block6.2', 'variable1');

        expect(has1).toEqual(true);
        expect(has2).toEqual(false);
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.set(blockTree, 'block3', 'variable1', 'value3');
        await environmentProvider.delete(blockTree, 'block5.1', 'variable1');

        let has1 = await environmentProvider.has(blockTree, 'block6.1', 'variable1');
        let has2 = await environmentProvider.has(blockTree, 'block6.2', 'variable1');

        let loadVar1 = await environmentProvider.get(blockTree, 'block6.1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree, 'block6.2', 'variable1');

        expect(has1).toEqual(false);
        expect(has2).toEqual(true);
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('value3');
    });
})

describe('consolide tests', () => {

    test('distinct chains', async () => {

        const blockTree1 = new BlockTree('local1');
        blockTree1.addHash(BlockTree.ZERO_HASH, 'block1');

        const blockTree2 = new BlockTree('local2');
        blockTree1.addHash(BlockTree.ZERO_HASH, 'block1');

        await environmentProvider.set(blockTree1, 'block1', 'variable1', 'value1');
        await environmentProvider.set(blockTree2, 'block1', 'variable1', 'value2');

        let loadVar1 = await environmentProvider.get(blockTree1, 'block1', 'variable1');
        let loadVar2 = await environmentProvider.get(blockTree2, 'block1', 'variable1');

        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');
    });

    test('set and get', async () => {

        const blockTreeBefore = new BlockTree('local');
        blockTreeBefore.addHash(BlockTree.ZERO_HASH, 'block1');
        blockTreeBefore.addHash('block1', 'block2');
        blockTreeBefore.addHash('block2', 'block3');

        const blockTreeAffter = new BlockTree('local');
        blockTreeAffter.addHash(BlockTree.ZERO_HASH, 'block2');
        blockTreeAffter.addHash('block2', 'block3');

        await environmentProvider.set(blockTreeBefore, 'block1', 'variable1', 'value1');
        await environmentProvider.set(blockTreeBefore, 'block3', 'variable1', 'value3');

        let loadVar11 = await environmentProvider.get(blockTreeBefore, 'block1', 'variable1');
        let loadVar12 = await environmentProvider.get(blockTreeBefore, 'block2', 'variable1');
        let loadVar13 = await environmentProvider.get(blockTreeBefore, 'block3', 'variable1');

        // disregard block 1
        let loadVar22 = await environmentProvider.get(blockTreeAffter, 'block2', 'variable1');
        let loadVar23 = await environmentProvider.get(blockTreeAffter, 'block3', 'variable1');

        await environmentProvider.consolideBlock(blockTreeBefore, 'block1');

        let loadVar32 = await environmentProvider.get(blockTreeAffter, 'block2', 'variable1');
        let loadVar33 = await environmentProvider.get(blockTreeAffter, 'block3', 'variable1');

        await expect(async () => {
            await environmentProvider.has(blockTreeBefore, 'block1', 'variable1');
        }).rejects.toThrow();

        expect(loadVar11).toStrictEqual('value1');
        expect(loadVar12).toStrictEqual('value1');
        expect(loadVar13).toStrictEqual('value3');

        expect(loadVar22).toStrictEqual('');
        expect(loadVar23).toStrictEqual('value3');

        expect(loadVar32).toStrictEqual('value1');
        expect(loadVar33).toStrictEqual('value3');
    });
})
