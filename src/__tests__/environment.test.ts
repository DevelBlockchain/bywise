import { Block, Wallet } from '@bywise/web3';
import Bywise from '../bywise';
import { EnvironmentProvider } from '../services';
import { CompiledContext, ZERO_HASH } from '../types';
import helper from '../utils/helper';
import { RuntimeContext } from '../vm/RuntimeContext';

const chain = "local"
const wallet = new Wallet();
var bywise: Bywise;
var environmentProvider: EnvironmentProvider;
const port0 = 7000;

beforeAll(async () => {
    bywise = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: helper.getRandomString(),
        ssl: null,
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [],
        mainWalletSeed: new Wallet().seed,
        startServices: ['vm'],
        vmSize: 1,
        vmIndex: 0
    });
    environmentProvider = new EnvironmentProvider(bywise.applicationContext);
}, 2000)

beforeEach(async () => {
    await bywise.applicationContext.database.drop();
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
        let loadVar1 = await envContext.get('variable1');
        let loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('');
        expect(loadVar2).toStrictEqual('');

        let slowLoadVar1 = await environmentProvider.get(env, 'variable1');
        let slowLoadVar2 = await environmentProvider.get(env, 'variable2');
        expect(slowLoadVar1).toStrictEqual(null);
        expect(slowLoadVar2).toStrictEqual(null);

        envContext = new RuntimeContext(environmentProvider, env);
        await envContext.set('variable1', 'value1');
        await envContext.set('variable2', 'value2');
        const changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
                keys: [],
                values: [],
            }
        }
        envContext.setChanges(changes);
        await environmentProvider.push(changes.envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, 'block_1');

        envContext = new RuntimeContext(environmentProvider, env);
        loadVar1 = await envContext.get('variable1');
        loadVar2 = await envContext.get('variable2');
        expect(loadVar1).toStrictEqual('value1');
        expect(loadVar2).toStrictEqual('value2');

        slowLoadVar1 = await environmentProvider.get(env, 'variable1');
        slowLoadVar2 = await environmentProvider.get(env, 'variable2');
        expect(slowLoadVar1?.value).toStrictEqual('value1');
        expect(slowLoadVar2?.value).toStrictEqual('value2');
    });

    test('two contexts same time', async () => {
        const env = {
            chain: chain,
            blockHeight: 5,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }
        const envContext = new RuntimeContext(environmentProvider, env);
        const envContextOther = new RuntimeContext(environmentProvider, env);

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
        const env = {
            chain: chain,
            blockHeight: 5,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }
        const envContext1 = new RuntimeContext(environmentProvider, env);
        const envContext2 = new RuntimeContext(environmentProvider, env);
        const envContext3 = new RuntimeContext(environmentProvider, env);

        await envContext1.set('variable1', 'value1');

        let value = await envContext2.get('variable1');
        expect(value).toStrictEqual(''); // before push

        const changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
                keys: [],
                values: [],
            }
        }
        envContext1.setChanges(changes);
        await environmentProvider.push(changes.envs, chain, CompiledContext.MAIN_CONTEXT_HASH, ZERO_HASH, 'block_1');

        value = await envContext2.get('variable1');
        expect(value).toStrictEqual(''); // before push - get from cache
        value = await envContext3.get('variable1');
        expect(value).toStrictEqual('value1'); // before push - get from database
    });
})

describe('context changes', () => {
    test('get', async () => {
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
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
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
            envs: {
                keys: [],
                values: [],
            }
        });
    });

    test('set', async () => {
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
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
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
            envs: {
                keys: ['variable1'],
                values: ['value1'],
            }
        });
    });

    test('delete', async () => {
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
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
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
            envs: {
                keys: ['variable1'],
                values: [null],
            }
        });
    });

    test('wallet add', async () => {
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
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
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
            envs: {
                keys: [],
                values: [],
            }
        });
    });

    test('wallet sub', async () => {
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
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
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
            envs: {
                keys: [],
                values: [],
            }
        });
    });

    test('wallet add and sub', async () => {
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
        let changes = {
            get: [],
            walletAddress: [],
            walletAmount: [],
            envs: {
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
            envs: {
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
            envs: {
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
            envs: {
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
            envs: {
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

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1', ZERO_HASH, 'block_1');

        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual(undefined);

        await environmentProvider.compile(chain, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);

        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');
    });

    test('set and get overwrite blocks - from RuntimeContext', async () => {
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_1', ZERO_HASH, 'block_1');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_2', 'block_1', 'block_2');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value2']
        }, chain, 'block_3', 'block_2', 'block_3');

        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_4', 'block_3', 'block_4');

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
        await environmentProvider.compile(chain, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('');
        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.compile(chain, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('value1');
        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.compile(chain, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('value2');
        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.compile(chain, 'block_4', CompiledContext.MAIN_CONTEXT_HASH);
        loadStr = await envContext.get('variable1');
        expect(loadStr).toStrictEqual('value2');
    });

    test('set and get overwrite blocks - from environmentProvider.get', async () => {
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_1', ZERO_HASH, 'block_1');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_2', 'block_1', 'block_2');

        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value2']
        }, chain, 'block_3', 'block_2', 'block_3');

        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_4', 'block_3', 'block_4');

        const env = {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }

        await environmentProvider.compile(chain, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual(undefined);
        await environmentProvider.compile(chain, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');
        await environmentProvider.compile(chain, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value2');
        await environmentProvider.compile(chain, 'block_4', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value2');
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_1', ZERO_HASH, 'block_1');
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_2', 'block_1', 'block_2');
        await environmentProvider.push({
            keys: ['variable1'],
            values: [null]
        }, chain, 'block_3', 'block_2', 'block_3');
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_4', 'block_3', 'block_4');

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
        await environmentProvider.compile(chain, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let has = await envContext.has('variable1');
        expect(has).toStrictEqual(false);
        let value = await envContext.get('variable1');
        expect(value).toStrictEqual('');

        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.compile(chain, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        has = await envContext.has('variable1');
        expect(has).toStrictEqual(true);
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('value1');

        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.compile(chain, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        has = await envContext.has('variable1');
        expect(has).toStrictEqual(false);
        value = await envContext.get('variable1');
        expect(value).toStrictEqual('');

        envContext = new RuntimeContext(environmentProvider, env);
        await environmentProvider.compile(chain, 'block_4', CompiledContext.MAIN_CONTEXT_HASH);
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
        }, chain, 'block_1', ZERO_HASH, 'block_1');
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_2', 'block_1', 'block_2');
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3']
        }, chain, 'block_3', 'block_2', 'block_3');
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_4', 'block_3', 'block_4');
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3.1']
        }, chain, 'block_3.1', 'block_2', 'block_3.1');
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_4.1', 'block_3.1', 'block_4.1');

        const env = {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }

        await environmentProvider.compile(chain, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');

        await environmentProvider.compile(chain, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');
        
        await environmentProvider.compile(chain, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value3');
        
        await environmentProvider.compile(chain, 'block_4', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value3');
        
        await environmentProvider.compile(chain, 'block_3.1', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value3.1');
        
        await environmentProvider.compile(chain, 'block_4.1', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value3.1');
    });

    test('set, delete, has, get', async () => {
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value1']
        }, chain, 'block_1', ZERO_HASH, 'block_1');
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_2', 'block_1', 'block_2');
        await environmentProvider.push({
            keys: ['variable1'],
            values: ['value3']
        }, chain, 'block_3', 'block_2', 'block_3');
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_4', 'block_3', 'block_4');
        await environmentProvider.push({
            keys: ['variable1'],
            values: [null]
        }, chain, 'block_3.1', 'block_2', 'block_3.1');
        await environmentProvider.push({
            keys: [],
            values: []
        }, chain, 'block_4.1', 'block_3.1', 'block_4.1');

        const env = {
            chain: chain,
            blockHeight: 1,
            fromContextHash: CompiledContext.MAIN_CONTEXT_HASH,
            changes: {
                keys: [],
                values: [],
            }
        }

        await environmentProvider.compile(chain, 'block_1', CompiledContext.MAIN_CONTEXT_HASH);
        let loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');

        await environmentProvider.compile(chain, 'block_2', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value1');
        
        await environmentProvider.compile(chain, 'block_3', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value3');
        
        await environmentProvider.compile(chain, 'block_4', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual('value3');
        
        await environmentProvider.compile(chain, 'block_3.1', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual(null);
        
        await environmentProvider.compile(chain, 'block_4.1', CompiledContext.MAIN_CONTEXT_HASH);
        loadVar = await environmentProvider.get(env, 'variable1');
        expect(loadVar?.value).toStrictEqual(null);
    });
})