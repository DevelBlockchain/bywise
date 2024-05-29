import { BywiseStartNodeConfig, ChainConfig } from './types';
import dotenv from 'dotenv';
dotenv.config();
import path from 'path';
import helper from './utils/helper';
import fs from "fs";
import { Worker } from 'worker_threads';
import Bywise from './bywise';
import { Wallet } from '@bywise/web3';

const workers: Worker[] = [];

const newBywiseWorker = async (isMultiThread: boolean, bywiseStartNodeConfig: BywiseStartNodeConfig) => {
    if (isMultiThread) {
        const worker = new Worker(path.join(__dirname, 'worker.js'), {
            workerData: {
                bywiseStartNodeConfig: bywiseStartNodeConfig,
                path: path.join(__dirname, 'worker.ts')
            }
        });
        worker.on('error', (result) => {
            console.log(result)
        });
        workers.push(worker);
        worker.addListener('message', (msg) => {
            workers.forEach(w => {
                w.postMessage(msg);
            })
        })
        await helper.sleep(1000);
    } else {
        await Bywise.newBywiseInstance(bywiseStartNodeConfig);
    }
}

var lastParam = '';
const getCmd = (arg: string, param?: RegExp) => {
    const args = process.argv;
    for (let i = 0; i < args.length; i++) {
        if (arg === args[i]) {
            if (param === undefined) {
                return true;
            } else if (args[i + 1] === undefined) {
                throw new Error(`command ${arg} need parameter`)
            } else if (param.test(args[i + 1])) {
                lastParam = args[i + 1];
                return true;
            } else {
                throw new Error(`Invalid parameter ${arg} "${args[i + 1]}"`)
            }
        }
    }
    return false;
}

const main = async () => {
    try {
        if (getCmd('-help')) {
            console.log('commands: ');
            console.log('   -addr');
            console.log('   -cert');
            console.log('   -chain');
            console.log('   -deploy');
            console.log('   -delay-block');
            console.log('   -host');
            console.log('   -https');
            console.log('   -name');
            console.log('   -new-chain');
            console.log('   -new-wallet');
            console.log('   -nodes');
            console.log('   -port');
            console.log('   -pnodes');
            console.log('   -key');
            console.log('   -reset');
            console.log('   -start');
            return
        }
        let wallet = new Wallet().seed;
        let https = false;
        let key = '';
        let cert = '';
        if (process.env.SEED) {
            wallet = process.env.SEED;
        }
        if (process.env.KEY_PATH) {
            key = process.env.KEY_PATH;
        }
        if (process.env.CERT_PATH) {
            cert = process.env.CERT_PATH;
        }
        if (process.env.ENABLE_HTTPS) {
            https = process.env.ENABLE_HTTPS.toLowerCase().trim() === 'true';
        }
        if (getCmd('-key', /^.+$/)) {
            key = lastParam;
        }
        if (getCmd('-cert', /^.+$/)) {
            cert = lastParam;
        }
        if (getCmd('-new-wallet')) {
            const w = new Wallet()
            wallet = w.seed;
            console.log(`SEED: "${w.seed}"`)
            console.log(`ADDRESS: "${w.address}"`)
            if(process.env.SEED2) {
                wallet = process.env.SEED2
            }
        }
        const keyJWT = helper.getRandomString();
        let name = 'bywise-node';
        let port = 3000;
        let isLog = false;
        let initialNodes: string[] = [];
        let zeroBlocks: string[] = [];

        if (process.env.PORT) {
            port = parseInt(process.env.PORT);
        }
        if (getCmd('-name', /^[a-zA-Z0-9_]+$/)) {
            name = lastParam;
        }
        if (getCmd('-port', /^[0-9]+$/)) {
            port = parseInt(lastParam);
        }
        let host = `http://localhost:${port}`;
        if (process.env.HOST) {
            host = process.env.HOST;
        }
        if (getCmd('-host', /^.+$/)) {
            host = lastParam;
        }
        if (getCmd('-log')) {
            isLog = true;
        }
        if (process.env.NODES) {
            initialNodes = process.env.NODES.split(',');
        }
        if (getCmd('-nodes', /^.+$/)) {
            initialNodes = lastParam.split(',');
        }
        if (getCmd('-pnodes', /^[0-9\,]+$/)) {
            initialNodes = lastParam.split(',').map(p => `http://localhost:${p}`);
        }
        if (getCmd('-https')) {
            https = true;
            if (!fs.existsSync(key)) throw new Error('ssl key file not found')
            if (!fs.existsSync(cert)) throw new Error('ssl cert file not found')
            key = fs.readFileSync(key, 'utf8');
            cert = fs.readFileSync(cert, 'utf8');
        }
        if (getCmd('-reset')) {
            const b = await Bywise.newBywiseInstance({
                name: name,
                port: 0,
                keyJWT: '',
                isLog: isLog,
                isReset: true,
                myHost: '',
                initialNodes: [],
                zeroBlocks: [],
                mainWalletSeed: wallet,
                startServices: [],
            });
            await b.stop();
        }
        let delayBlock = '120'
        if (getCmd('-delay-block', /^[0-9]+$/)) {
            delayBlock = lastParam;
        }
        if (getCmd('-new-chain', /^[a-zA-Z0-9_]+$/)) {
            const deployWallet = new Wallet({ seed: wallet });
            const zeroBlock = await helper.createNewBlockZero(lastParam, deployWallet, [
                ChainConfig.addAdmin(deployWallet.address),
                ChainConfig.addValidator(deployWallet.address),
                ChainConfig.setBalance(deployWallet.address, '20000'),
                
                ChainConfig.setConfig('blockTime', delayBlock),
                ChainConfig.setConfig('feeBasic', '0.1'),
                ChainConfig.setConfig('feeCoefAmount', '0.1'),
                ChainConfig.setConfig('feeCoefSize', '0.001'),
                ChainConfig.setConfig('feeCoefCost', '0.001'),
            ]);
            fs.writeFileSync(`${lastParam}.json`, JSON.stringify(zeroBlock), 'utf8');
        }
        if (getCmd('-new-chain-local')) {
            const deployWallet = new Wallet({ seed: wallet });
            const zeroBlock = await helper.createNewBlockZero('local', deployWallet, [
                ChainConfig.addAdmin(deployWallet.address),
                ChainConfig.addValidator(deployWallet.address),
                ChainConfig.setBalance(deployWallet.address, '1000000'),
                ChainConfig.setConfig('blockTime', '30'),
                ChainConfig.setConfig('feeBasic', '1'),
                ChainConfig.setConfig('feeCoefAmount', '0'),
                ChainConfig.setConfig('feeCoefSize', '0'),
                ChainConfig.setConfig('feeCoefCost', '0'),
            ]);
            fs.writeFileSync(`local.json`, JSON.stringify(zeroBlock, null, 4), 'utf8');

        }
        if (getCmd('-chain', /^.+$/)) {
            if (fs.existsSync(lastParam)) {
                zeroBlocks = lastParam.split(',').map(file => fs.readFileSync(file, 'utf8'));
                const b = await Bywise.newBywiseInstance({
                    name: name,
                    port: 0,
                    keyJWT: '',
                    isLog: isLog,
                    myHost: '',
                    initialNodes: [],
                    zeroBlocks: zeroBlocks,
                    mainWalletSeed: wallet,
                    startServices: [],
                });
                await b.stop();
            } else {
                throw new Error(`file not found - ${lastParam}`)
            }
        }
        if (getCmd('-start')) {
            await newBywiseWorker(true, {
                name: name,
                port: port,
                keyJWT: keyJWT,
                isLog: isLog,
                myHost: host,
                initialNodes: initialNodes,
                zeroBlocks: [],
                mainWalletSeed: wallet,
                startServices: ['core'],
            });
            await newBywiseWorker(true, {
                name: name,
                port: port,
                keyJWT: keyJWT,
                https: https ? { cert, key } : undefined,
                isLog: isLog,
                myHost: host,
                initialNodes: initialNodes,
                zeroBlocks: [],
                mainWalletSeed: wallet,
                startServices: ['api'],
            });
        }
        if (getCmd('-start-debug')) {
            await Bywise.newBywiseInstance({
                name: name,
                port: port,
                keyJWT: keyJWT,
                isLog: isLog,
                myHost: host,
                initialNodes: initialNodes,
                zeroBlocks: [],
                mainWalletSeed: wallet,
                startServices: ['core', 'api'],
            });
        }
    } catch (err: any) {
        console.log(err.message)
    }
}
main();