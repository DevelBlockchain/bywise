import { Wallet, BlockPack, Slice } from '@bywise/web3';
import Bywise from '../bywise';
import { ChainData, MinnerProvider } from '../services/minner.service';
import helper from '../utils/helper';
import { BlocksProvider, SlicesProvider } from '../services';

const hash = '0000000000000000000000ff0000000000000000ff0000000000000000000000';
const addrA = 'BWS1MU0000000000000000000000ff0000000000000000a25';
const addrB = 'BWS1MU00ff000000000000000000000000000000000000d40';
const wallet = new Wallet();
var bywise: Bywise;
var b0: BlockPack;
var minnerProvider: MinnerProvider;
var slicesProvider: SlicesProvider;
var blocksProvider: BlocksProvider;
const port0 = Math.floor(Math.random() * 7000 + 3000);

beforeAll(async () => {
    b0 = await helper.createNewBlockZero('local', wallet);
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
        startServices: [],
    });
    minnerProvider = new MinnerProvider(bywise.applicationContext);
    slicesProvider = new SlicesProvider(bywise.applicationContext);
    blocksProvider = new BlocksProvider(bywise.applicationContext);
}, 30000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
})

afterAll(async () => {
    await bywise.stop();
}, 30000)

const toHex = (value: number) => {
    const hexValue = (value).toString(16);
    return `0000000000000000000000000000000000000${hexValue}`;
}

describe('consensus algorithm', () => {
    test('calc module', async () => {
        const hash = toHex(1000);
        expect(minnerProvider.calcModule(hash, toHex(1100)).toFixed()).toEqual('100');
        expect(minnerProvider.calcModule(hash, toHex(1200)).toFixed()).toEqual('200');
        expect(minnerProvider.calcModule(hash, toHex(900)).toFixed()).toEqual('100');
        expect(minnerProvider.calcModule(hash, toHex(800)).toFixed()).toEqual('200');
    });

    test('compare module', async () => {
        const hash = toHex(1000);
        const modA = minnerProvider.calcModule(hash, toHex(1100))
        const modB = minnerProvider.calcModule(hash, toHex(1200))

        expect(minnerProvider.compare(modA, modB)).toEqual('a');
        expect(minnerProvider.compare(modA, modA)).toEqual('a');
        expect(minnerProvider.compare(modB, modA)).toEqual('b');
    });

    test('compare two address', async () => {
        expect(minnerProvider.compareAddress(hash, addrA, addrB)).toEqual('a');
        expect(minnerProvider.compareAddress(hash, addrA, addrA)).toEqual('a');
        expect(minnerProvider.compareAddress(hash, addrB, addrA)).toEqual('b');
    });

    test('compare address with invalid address', async () => {
        const invalidAddress = 'BWS1MU00ff00000000000000000ff00000000000000000d40'
        await expect(async () => {
            minnerProvider.compareAddress(hash, addrA, invalidAddress);
        }).rejects.toThrow();
    });

    test('compare address with invalid hash', async () => {
        const invalidHash = '0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
        await expect(async () => {
            minnerProvider.compareAddress(invalidHash, addrA, addrB);
        }).rejects.toThrow();
    });

    test('calc chains module', async () => {
        const chainA: ChainData[] = [];
        chainA.push({ hash, address: addrA });
        chainA.push({ hash, address: addrA });
        chainA.push({ hash, address: addrB });

        const chainB: ChainData[] = [];
        chainB.push({ hash, address: addrA });
        chainB.push({ hash, address: addrB });
        chainB.push({ hash, address: addrB });

        expect(minnerProvider.moduleChain(chainA).toString(16)).toEqual('ff000000000000fefffe020000000000000000');
        expect(minnerProvider.moduleChain(chainB).toString(16)).toEqual('1fdffffffffffff00ffff010000000000000000');
    });

    test('compare chains', async () => {
        const chainA: ChainData[] = [];
        chainA.push({ hash, address: addrA });
        chainA.push({ hash, address: addrA });
        chainA.push({ hash, address: addrB });

        const chainB: ChainData[] = [];
        chainB.push({ hash, address: addrA });
        chainB.push({ hash, address: addrB });
        chainB.push({ hash, address: addrB });

        expect(minnerProvider.compareChain(chainA, chainB)).toEqual('a');
        expect(minnerProvider.compareChain(chainA, chainA)).toEqual('a');
        expect(minnerProvider.compareChain(chainB, chainA)).toEqual('b');
    });

    test('compare chains with different length', async () => {
        const chainA: ChainData[] = [];
        chainA.push({ hash, address: addrA });
        chainA.push({ hash, address: addrA });

        const chainB: ChainData[] = [];
        chainB.push({ hash, address: addrA });

        await expect(async () => {
            minnerProvider.compareChain(chainA, chainB);
        }).rejects.toThrow();
    });
})

describe('get slices', () => {
    test('consecutive slices', async () => {
        let blockTree = await blocksProvider.setNewZeroBlock(b0);

        let bestSlices = blockTree.getBestSlice(wallet.address, 1);
        expect(bestSlices.length).toEqual(0);

        const slices: Slice[] = [];
        for (let i = 0; i <= 5; i++) {
            const slice = new Slice();
            slice.height = i;
            slice.transactionsCount = 1;
            slice.blockHeight = 1;
            slice.transactions = [helper.getRandomHash()];
            slice.transactionsData = [];
            slice.version = '2';
            slice.chain = 'local';
            slice.from = wallet.address;
            slice.created = Math.floor(Date.now() / 1000);
            slice.end = i == 5;
            slice.hash = slice.toHash();
            slice.sign = await wallet.signHash(slice.hash);
            const bslice = await slicesProvider.saveNewSlice(slice);
            bslice.isComplete = true;
            bslice.isExecuted = true;
            await slicesProvider.updateSlice(bslice);
            slices.push(slice);
        }

        blockTree = await blocksProvider.getBlockTree('local');
        bestSlices = blockTree.getBestSlice(wallet.address, 1);

        expect(bestSlices.length).toEqual(slices.length);

        for (let i = 0; i < slices.length; i++) {
            const slice = slices[i];
            const bestSlice = bestSlices[i];
            expect(bestSlice.hash).toEqual(slice.hash);
        }
    });

    test('consecutive slices - missing one', async () => {
        let blockTree = await blocksProvider.setNewZeroBlock(b0);

        let bestSlices = blockTree.getBestSlice(wallet.address, 1);
        expect(bestSlices.length).toEqual(0);

        const slices: Slice[] = [];
        for (let i = 0; i <= 5; i++) {
            const slice = new Slice();
            slice.height = i;
            slice.transactionsCount = 1;
            slice.blockHeight = 1;
            slice.transactions = [helper.getRandomHash()];
            slice.transactionsData = [];
            slice.version = '2';
            slice.chain = 'local';
            slice.from = wallet.address;
            slice.created = Math.floor(Date.now() / 1000);
            slice.end = i == 5;
            slice.hash = slice.toHash();
            slice.sign = await wallet.signHash(slice.hash);
            if (i !== 3) {
                const bslice = await slicesProvider.saveNewSlice(slice);
                bslice.isComplete = true;
                bslice.isExecuted = true;
                await slicesProvider.updateSlice(bslice);
            }
            slices.push(slice);
        }

        blockTree = await blocksProvider.getBlockTree('local');
        bestSlices = blockTree.getBestSlice(wallet.address, 1);

        expect(bestSlices.length).toEqual(3);

        for (let i = 0; i < 3; i++) {
            const slice = slices[i];
            const bestSlice = bestSlices[i];
            expect(bestSlice.hash).toEqual(slice.hash);
        }
    });

    test('consecutive slices - with update', async () => {
        let blockTree = await blocksProvider.setNewZeroBlock(b0);

        // create first slices
        for (let i = 0; i <= 5; i++) {
            const slice = new Slice();
            slice.height = i;
            slice.transactionsCount = 1;
            slice.blockHeight = 1;
            slice.transactions = [helper.getRandomHash()];
            slice.transactionsData = [];
            slice.version = '2';
            slice.chain = 'local';
            slice.from = wallet.address;
            slice.created = Math.floor(Date.now() / 1000);
            slice.end = false;
            slice.hash = slice.toHash();
            slice.sign = await wallet.signHash(slice.hash);
            const bslice = await slicesProvider.saveNewSlice(slice);
            bslice.isComplete = true;
            bslice.isExecuted = true;
            await slicesProvider.updateSlice(bslice);
        }

        // update slices with more transactions
        const slices: Slice[] = [];
        for (let i = 0; i <= 5; i++) {
            const slice = new Slice();
            slice.height = i;
            slice.transactionsCount = 2;
            slice.blockHeight = 1;
            slice.transactions = [helper.getRandomHash(), helper.getRandomHash()];
            slice.transactionsData = [];
            slice.version = '2';
            slice.chain = 'local';
            slice.from = wallet.address;
            slice.created = Math.floor(Date.now() / 1000);
            slice.end = i == 5;
            slice.hash = slice.toHash();
            slice.sign = await wallet.signHash(slice.hash);
            const bslice = await slicesProvider.saveNewSlice(slice);
            bslice.isComplete = true;
            bslice.isExecuted = true;
            await slicesProvider.updateSlice(bslice);
            slices.push(slice);
        }

        blockTree = await blocksProvider.getBlockTree('local');
        const bestSlices = blockTree.getBestSlice(wallet.address, 1);

        expect(bestSlices.length).toEqual(slices.length);

        for (let i = 0; i < slices.length; i++) {
            const slice = slices[i];
            const bestSlice = bestSlices[i];
            expect(bestSlice.hash).toEqual(slice.hash);
        }
    });
})

describe('get blocktree', () => {
    test('check build blocktree', async () => {
        await expect(async () => {
            await blocksProvider.getBlockTree('local');
        }).rejects.toThrow('get first imutable block of local not found');

        let blockTree = await blocksProvider.setNewZeroBlock(b0);

        expect(blockTree.blockMap.size).toEqual(2);
        expect(blockTree.sliceMap.size).toEqual(1);
    });
})