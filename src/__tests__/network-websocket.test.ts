import { BywiseNode, Wallet, Web3 } from '@bywise/web3';
import Bywise from '../bywise';
import { AuthProvider } from '../services';
import helper from '../utils/helper';

var node0: Bywise;
var node1: Bywise;
var node2: Bywise;
var authProvide: AuthProvider;
const keyJWT = helper.getRandomString();
const port0 = 9000;
const port1 = 9001;
const port2 = 9002;

beforeAll(async () => {
    node0 = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: keyJWT,
        ssl: null,
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `ws://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api', 'vm', 'network'],
        vmSize: 1,
        vmIndex: 0
    });
    authProvide = new AuthProvider(node0.applicationContext);

    node1 = await Bywise.newBywiseInstance({
        name: `test${port1}`,
        port: port1,
        keyJWT: keyJWT,
        ssl: null,
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `ws://localhost:${port1}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api', 'vm', 'network'],
        vmSize: 1,
        vmIndex: 0
    });
    node2 = await Bywise.newBywiseInstance({
        name: `test${port2}`,
        port: port2,
        keyJWT: helper.getRandomString(),
        ssl: null,
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `ws://localhost:${port2}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api', 'vm', 'network'],
        vmSize: 1,
        vmIndex: 0
    });
}, 2000)

beforeEach(async () => {
    await node0.core.network.stop();
    await node1.core.network.stop();
    await node2.core.network.stop();
}, 2000)

afterAll(async () => {
    await node0.stop();
    await node1.stop();
    await node2.stop();
}, 2000)

describe('node connect', () => {

    test('initial connected nodes', async () => {
        expect(node0.core.network.connectedNodesSize()).toEqual(0);
        expect(node1.core.network.connectedNodesSize()).toEqual(0);
        expect(node2.core.network.connectedNodesSize()).toEqual(0);
    });

    test('auto connect nodes', async () => {
        expect(node0.core.network.web3.network.isConnected).toEqual(false);

        await node0.core.network.start();

        expect(node0.core.network.connectedNodesSize()).toEqual(0);
        expect(node1.core.network.connectedNodesSize()).toEqual(0);
        expect(node2.core.network.connectedNodesSize()).toEqual(0);
        expect(node0.core.network.web3.network.isConnected).toEqual(true);
        expect(node1.core.network.web3.network.isConnected).toEqual(false);
        expect(node2.core.network.web3.network.isConnected).toEqual(false);

        await node1.core.network.start([`ws://localhost:${port0}`]);

        expect(node0.core.network.connectedNodesSize()).toEqual(1);
        expect(node1.core.network.connectedNodesSize()).toEqual(1);
        expect(node2.core.network.connectedNodesSize()).toEqual(0);
        expect(node0.core.network.web3.network.isConnected).toEqual(true);
        expect(node1.core.network.web3.network.isConnected).toEqual(true);
        expect(node2.core.network.web3.network.isConnected).toEqual(false);

        await node2.core.network.start([`ws://localhost:${port0}`]);

        expect(node0.core.network.connectedNodesSize()).toEqual(2);
        expect(node1.core.network.connectedNodesSize()).toEqual(1);
        expect(node2.core.network.connectedNodesSize()).toEqual(2);
        expect(node0.core.network.web3.network.isConnected).toEqual(true);
        expect(node1.core.network.web3.network.isConnected).toEqual(true);
        expect(node2.core.network.web3.network.isConnected).toEqual(true);

        await node1.core.network.web3.network.connect();

        expect(node0.core.network.connectedNodesSize()).toEqual(2);
        expect(node1.core.network.connectedNodesSize()).toEqual(2);
        expect(node2.core.network.connectedNodesSize()).toEqual(2);
        expect(node0.core.network.web3.network.isConnected).toEqual(true);
        expect(node1.core.network.web3.network.isConnected).toEqual(true);
        expect(node2.core.network.web3.network.isConnected).toEqual(true);
    });

    test('Web3.tryToken - invalid token', async () => {
        await node0.core.network.start();

        const bywiseNode0 = new BywiseNode({
            chains: ['local'],
            address: node0.applicationContext.mainWallet.address,
            host: `ws://localhost:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: 'asdfasdfasdfasdfasdf',
        });
        const req = await Web3.tryToken(bywiseNode0);

        expect(req.error).toEqual("Token expired");
    });

    test('Web3.tryToken - valid', async () => {
        await node0.core.network.start();

        const bywiseNode0 = new BywiseNode({
            chains: ['local'],
            address: node0.applicationContext.mainWallet.address,
            host: `ws://localhost:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: await authProvide.createNodeToken(60),
        });
        const req = await Web3.tryToken(bywiseNode0);

        expect(req.error).toEqual(undefined);
    });

    test('tryHandshake invalid token', async () => {
        await node0.core.network.start();

        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: node1.applicationContext.mainWallet.address,
            host: `ws://localhost:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: 'asdfasdfasdfasdfasdf',
        });
        const web3 = new Web3()
        const res = await web3.network.getAPI(bywiseNode).tryHandshake(`ws://localhost:${port1}`, bywiseNode);
        expect(res.error).toEqual("could not connect to node - Token expired");

        await helper.sleep(100);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('tryHandshake valid token', async () => {
        await node0.core.network.start();

        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: node1.applicationContext.mainWallet.address,
            host: `ws://127.0.0.1:${port1}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 60 * 1000) / 1000),
            token: await authProvide.createNodeToken(60),
        });

        const web3 = new Web3()
        const res = await web3.network.getAPI(bywiseNode).tryHandshake(bywiseNode.host, bywiseNode);
        expect(res.error).toEqual(undefined);

        await helper.sleep(100);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(1);
    });
})

describe('client network discovery', () => {

    beforeEach(async () => {
        await node0.core.network.start([`ws://localhost:${port1}`]);
        await node1.core.network.start([`ws://localhost:${port0}`]);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(1);
    })

    test('tryHandshake', async () => {
        const web3 = new Web3({
            initialNodes: [`ws://localhost:${port0}`]
        })
        const connected = await web3.network.connect();
        expect(connected).toEqual(true);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(1);
    });

    test('create client', async () => {
        const web3 = new Web3({
            initialNodes: [`ws://localhost:${port0}`]
        });
        expect(web3.network.connectedNodes.length).toEqual(0);
    });

    test('try connect client', async () => {
        const web3 = new Web3({
            initialNodes: [`ws://localhost:${port0}`]
        });
        await web3.network.connect();
        expect(web3.network.connectedNodes.length).toEqual(2);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(1);
    });
})
