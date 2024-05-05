import { BywiseNode, Wallet, Web3 } from '@bywise/web3';
import request from 'supertest';
import Bywise from '../bywise';
import AuthProvider from '../services/auth.service';
import helper from '../utils/helper';

var bywise: Bywise;
var test1: Bywise;
var test2: Bywise;
var authProvide: AuthProvider;
const port0 = Math.floor(Math.random() * 7000 + 3000);
const port1 = Math.floor(Math.random() * 7000 + 3000);
const port2 = Math.floor(Math.random() * 7000 + 3000);

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
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api', 'network'],
    });
    authProvide = new AuthProvider(bywise.applicationContext);

    test1 = await Bywise.newBywiseInstance({
        name: `test${port1}`,
        port: port1,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port1}`,
        initialNodes: [ `http://localhost:${port2}` ],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api', 'network'],
    });
    test2 = await Bywise.newBywiseInstance({
        name: `test${port2}`,
        port: port2,
        keyJWT: helper.getRandomString(),
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port2}`,
        initialNodes: [ `http://localhost:${port0}`, `http://localhost:${port1}` ],
        zeroBlocks: [],
        mainWalletSeed: (new Wallet()).seed,
        startServices: ['api', 'network'],
    });
}, 60000)

beforeEach(async () => {
    await bywise.core.network.resetNetwork();
    await test1.core.network.resetNetwork();
    await test2.core.network.resetNetwork();
})

afterAll(async () => {
    await bywise.stop();
    await test1.stop();
    await test2.stop();
}, 30000)

describe('node connect', () => {

    test('initial connected nodes', async () => {
        const nodesSize = bywise.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('auto connect nodes', async () => {
        expect(bywise.core.network.web3.network.isConnected).toEqual(false);

        await bywise.core.network.start();
        await bywise.core.network.mainLoop();

        const nodesSize = bywise.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
        expect(bywise.core.network.web3.network.isConnected).toEqual(true);
    });

    test('tryHandshake invalid host', async () => {
        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: test1.applicationContext.mainWallet.address,
            host: `http://localhost:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: 'asdfasdfasdfasdfasdf',
        });
        const res = await request(bywise.api.server)
            .post('/api/v2/nodes/handshake')
            .send(bywiseNode);
        expect(res.status).toEqual(400);

        const nodesSize = bywise.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('tryHandshake invalid token', async () => {
        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: test1.applicationContext.mainWallet.address,
            host: `http://localhost:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: 'asdfasdfasdfasdfasdf',
        });
        const res = await request(bywise.api.server)
            .post('/api/v2/nodes/handshake')
            .send(bywiseNode);
        expect(res.status).toEqual(400);

        const nodesSize = bywise.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('tryHandshake valid token', async () => {
        const bywiseNode = new BywiseNode({
            chains: ['local'],
            address: test1.applicationContext.mainWallet.address,
            host: `http://127.0.0.1:${port0}`,
            version: '2',
            expire: Math.floor((new Date().getTime() + 10 * 60 * 1000) / 1000),
            token: await authProvide.createNodeToken(),
        });
        const res = await request(bywise.api.server)
            .post('/api/v2/nodes/handshake')
            .send(bywiseNode);
        expect(res.status).toEqual(200);

        await helper.sleep(1000);

        const nodesSize = bywise.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(1);
    });
})

describe('client connect', () => {

    test('tryHandshake', async () => {
        const res = await request(bywise.api.server)
            .post('/api/v2/nodes/handshake');
        expect(res.status).toEqual(200);
        expect(typeof res.body).toEqual('object');
        expect(typeof res.body.token).toEqual('string');

        await helper.sleep(1000);

        const nodesSize = bywise.core.network.connectedNodesSize();
        expect(nodesSize).toEqual(0);
    });

    test('tryToken valid token', async () => {
        let res = await request(bywise.api.server)
            .post('/api/v2/nodes/handshake');

        let token = res.body.token;

        res = await request(bywise.api.server)
            .get('/api/v2/nodes/try-token')
            .set('authorization', `Node ${token}`);
        expect(res.status).toEqual(200);
    });

    test('tryToken invalid token', async () => {
        let res = await request(bywise.api.server)
            .get('/api/v2/nodes/try-token')
            .set('authorization', `Node ${helper.getRandomString()}`);
        expect(res.status).toEqual(401);
    });
})

describe('client network discovery', () => {

    beforeEach(async () => {
        await bywise.core.network.mainLoop();

        const nodesSize = bywise.core.network.connectedNodesSize();
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
        await web3.network.tryConnection();
        expect(web3.network.connectedNodes.length).toEqual(1);
    });
})

describe('node network discovery', () => {

    test('network discovery', async () => {
        expect(bywise.core.network.connectedNodesSize()).toEqual(0);
        expect(test1.core.network.connectedNodesSize()).toEqual(0);
        expect(test2.core.network.connectedNodesSize()).toEqual(0);
        
        await test1.core.network.mainLoop(); // test1 connect with test2
        
        expect(bywise.core.network.connectedNodesSize()).toEqual(0);
        expect(test1.core.network.connectedNodesSize()).toEqual(1);
        expect(test2.core.network.connectedNodesSize()).toEqual(1);
        
        await test2.core.network.mainLoop(); // test2 connect with bywise
        
        expect(bywise.core.network.connectedNodesSize()).toEqual(1);
        expect(test1.core.network.connectedNodesSize()).toEqual(1);
        expect(test2.core.network.connectedNodesSize()).toEqual(2);
        
        await bywise.core.network.mainLoop(); // bywise connect with test2 -> test1
        
        expect(bywise.core.network.connectedNodesSize()).toEqual(2);
        expect(test1.core.network.connectedNodesSize()).toEqual(2);
        expect(test2.core.network.connectedNodesSize()).toEqual(2);
    }, 60000);
})
