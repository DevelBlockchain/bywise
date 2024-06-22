import request from 'supertest';
import Bywise from '../bywise';
import helper from '../utils/helper';
import { Wallet } from '@bywise/web3';
import AuthProvider from '../services/auth.service';

const port0 = Math.floor(Math.random() * 7000 + 3000);

var bywise: Bywise;

beforeAll(async () => {
    const wallet = new Wallet();
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
        startServices: ['api'],
    });
}, 30000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
})

afterAll(async () => {
    await bywise.stop();
}, 30000)

describe('Tests before signup', () => {

    test('No token provided', async () => {
        const res = await request(bywise.api.server)
            .get('/api/v2/auth/me');
        expect(res.status).toEqual(401);
        const expected = {
            error: "No token provided",
        };
        expect(res.body).toEqual(expected);
    });

    test('Token error', async () => {
        const res = await request(bywise.api.server)
            .get('/api/v2/auth/me')
            .set('authorization', helper.getRandomString());
        expect(res.status).toEqual(401);
        const expected = {
            error: "Token error",
        };
        expect(res.body).toEqual(expected);
    });

    test('Token malformatted', async () => {
        const res = await request(bywise.api.server)
            .get('/api/v2/auth/me')
            .set('authorization', `${helper.getRandomString()} ${helper.getRandomString()}`);
        expect(res.status).toEqual(401);
        const expected = {
            error: "Token malformatted",
        };
        expect(res.body).toEqual(expected);
    });

    test('Token invalid', async () => {
        const res = await request(bywise.api.server)
            .get('/api/v2/auth/me')
            .set('authorization', `Bearer ${helper.getRandomString()}`);
        expect(res.status).toEqual(401);
        const expected = {
            error: "Token expired",
        };
        expect(res.body).toEqual(expected);
    });
    
    test('Token valid', async () => {
        const authProvider = new AuthProvider(bywise.applicationContext);

        const res = await request(bywise.api.server)
            .get('/api/v2/auth/me')
            .set('authorization', `Bearer ${await authProvider.createNodeToken(60)}`);
        expect(res.status).toEqual(200);
    });
})
