import { BywiseNode, Wallet, Web3 } from '@bywise/web3';
import request from 'supertest';
import Bywise from '../bywise';
import AuthProvider from '../services/auth.service';
import helper from '../utils/helper';

var node0: Bywise;
var node1: Bywise;
var node2: Bywise;
var authProvide: AuthProvider;
const keyJWT = helper.getRandomString();
const port0 = Math.floor(Math.random() * 7000 + 3000);
const port1 = Math.floor(Math.random() * 7000 + 3000);
const port2 = Math.floor(Math.random() * 7000 + 3000);

beforeAll(async () => {
    node0 = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: keyJWT,
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api'],
    });
    authProvide = new AuthProvider(node0.applicationContext);

    node1 = await Bywise.newBywiseInstance({
        name: `test${port1}`,
        port: port1,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port1}`,
        initialNodes: [`http://localhost:${port0}`],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api'],
    });
    node2 = await Bywise.newBywiseInstance({
        name: `test${port2}`,
        port: port2,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port2}`,
        initialNodes: [`http://localhost:${port0}`],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api'],
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

        await node1.core.network.start();

        expect(node0.core.network.connectedNodesSize()).toEqual(1);
        expect(node1.core.network.connectedNodesSize()).toEqual(1);
        expect(node2.core.network.connectedNodesSize()).toEqual(0);
        expect(node0.core.network.web3.network.isConnected).toEqual(true);
        expect(node1.core.network.web3.network.isConnected).toEqual(true);
        expect(node2.core.network.web3.network.isConnected).toEqual(false);

        await node2.core.network.start();

        expect(node0.core.network.connectedNodesSize()).toEqual(2);
        expect(node1.core.network.connectedNodesSize()).toEqual(2);
        expect(node2.core.network.connectedNodesSize()).toEqual(2);
        expect(node0.core.network.web3.network.isConnected).toEqual(true);
        expect(node1.core.network.web3.network.isConnected).toEqual(true);
        expect(node2.core.network.web3.network.isConnected).toEqual(true);
    });

    test('discovery nodes', async () => {
        expect(node0.core.network.connectedNodesSize()).toEqual(0);
        expect(node1.core.network.connectedNodesSize()).toEqual(0);
        expect(node2.core.network.connectedNodesSize()).toEqual(0);

        await node0.core.network.start([]);
        await node2.core.network.start([]);

        expect(node0.core.network.connectedNodesSize()).toEqual(0);
        expect(node1.core.network.connectedNodesSize()).toEqual(0);
        expect(node2.core.network.connectedNodesSize()).toEqual(0);

        await node1.core.network.start([`http://localhost:${port0}`, `http://localhost:${port2}`]);

        expect(node0.core.network.connectedNodesSize()).toEqual(1);
        expect(node1.core.network.connectedNodesSize()).toEqual(2);
        expect(node2.core.network.connectedNodesSize()).toEqual(1);

        await node0.core.network.web3.network.connect(); // node0 discovery node2

        expect(node0.core.network.connectedNodesSize()).toEqual(2);
        expect(node1.core.network.connectedNodesSize()).toEqual(2);
        expect(node2.core.network.connectedNodesSize()).toEqual(2);
    });

    test('tryHandshake invalid host', async () => {
        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: node1.applicationContext.mainWallet.address,
            host: `http://localhost:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: 'asdfasdfasdfasdfasdf',
        });
        const res = await request(node0.api.server)
            .post('/api/v2/nodes/handshake')
            .send(bywiseNode);
        expect(res.status).toEqual(400);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('tryHandshake invalid token', async () => {
        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: node1.applicationContext.mainWallet.address,
            host: `http://localhost:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: 'asdfasdfasdfasdfasdf',
        });
        const res = await request(node0.api.server)
            .post('/api/v2/nodes/handshake')
            .send(bywiseNode);
        expect(res.status).toEqual(400);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('tryHandshake valid token', async () => {
        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: node1.applicationContext.mainWallet.address,
            host: `http://127.0.0.1:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 60 * 1000) / 1000),
            token: await authProvide.createNodeToken(60),
        });
        const res = await request(node0.api.server)
            .post('/api/v2/nodes/handshake')
            .send(bywiseNode);
        expect(res.status).toEqual(200);

        await helper.sleep(1000);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(1);
    });
})

describe('client connect', () => {

    test('tryHandshake', async () => {
        const res = await request(node0.api.server)
            .post('/api/v2/nodes/handshake');
        expect(res.status).toEqual(200);
        expect(typeof res.body).toEqual('object');
        expect(typeof res.body.token).toEqual('string');

        await helper.sleep(1000);

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('tryToken valid token', async () => {
        let res = await request(node0.api.server)
            .post('/api/v2/nodes/handshake');

        let token = res.body.token;

        res = await request(node0.api.server)
            .get('/api/v2/nodes/try-token')
            .set('authorization', `Node ${token}`);
        expect(res.status).toEqual(200);
    });

    test('tryToken invalid token', async () => {
        let res = await request(node0.api.server)
            .get('/api/v2/nodes/try-token')
            .set('authorization', `Node ${helper.getRandomString()}`);
        expect(res.status).toEqual(401);
    });

    test('tryToken default token', async () => {
        let res = await request(node0.api.server)
            .get('/api/v2/nodes/try-token')
            .set('authorization', `Node ${keyJWT}`);
        expect(res.status).toEqual(200);
    });
})

describe('client network discovery', () => {

    beforeEach(async () => {
        await node0.core.network.start();

        const nodesSize = node0.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    })

    test('create client', async () => {
        const web3 = new Web3({
            initialNodes: [`http://localhost:${port0}`]
        });
        expect(web3.network.connectedNodes.length).toEqual(0);
    });

    test('try connect client', async () => {
        const web3 = new Web3({
            initialNodes: [`http://localhost:${port0}`]
        });
        await web3.network.connect();
        expect(web3.network.connectedNodes.length).toEqual(1);
    });
})
