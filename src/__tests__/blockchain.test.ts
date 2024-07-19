import fs from 'fs';
import helper from '../utils/helper';
import { TxType, BlockPack, Wallet, Web3, Tx } from '@bywise/web3';
import { ChainConfig } from '../types';
import Bywise from '../bywise';

var bywise: Bywise;
var b0: BlockPack;
var web3: Web3;
const wallet = new Wallet();
const chain = 'local';
const port0 = 11000;

const ERCCode = fs.readFileSync('./assets/ERC20_v2.js', 'utf8');

beforeAll(async () => {
    b0 = await helper.createNewBlockZero(chain, wallet, [
        ChainConfig.addAdmin(wallet.address),
        ChainConfig.addValidator(wallet.address),
        ChainConfig.addBalance(wallet.address, "1000000000000"),
        ChainConfig.setBlockTime(`30`),
        ChainConfig.setConfigFee('feeCostType', `1`),
        ChainConfig.setConfigFee('feeBasic', '1'),
        ChainConfig.setConfigFee('feeCoefAmount', '1'),
        ChainConfig.setConfigFee('feeCoefSize', '1'),
        ChainConfig.setConfigFee('feeCoefCost', '1'),
    ]);
    bywise = await Bywise.newBywiseInstance({
        name: `test${port0}`,
        port: port0,
        keyJWT: helper.getRandomString(),
        ssl: null,
        isLog: process.env.BYWISE_TEST !== '1',
        isReset: true,
        myHost: `http://localhost:${port0}`,
        initialNodes: [],
        zeroBlocks: [JSON.stringify(b0)],
        mainWalletSeed: wallet.seed,
        startServices: ['vm', 'network', 'api', 'core'],
        vmSize: 1,
        vmIndex: 0
    });
    await helper.sleep(10000);
    web3 = new Web3({
        initialNodes: [`http://localhost:${port0}`]
    });
}, 15000)

beforeEach(async () => {
    await web3.network.connect();
    expect(web3.network.connectedNodes.length).toEqual(1);
}, 2000);

afterAll(async () => {
    await web3.network.disconnect();
    await bywise.stop();
}, 2000)

describe('simple transactions', () => {

    test('send transaction', async () => {
        const node = web3.network.getRandomNode();
        const addr = wallet.getStealthAddress(0, 0);
        let tx = new Tx();
        tx.version = '3';
        tx.chain = chain;
        tx.from = [wallet.address];
        tx.to = [addr];
        tx.validator = [node.address];
        tx.amount = ['3'];
        tx.type = TxType.TX_NONE;
        tx.data = {};
        tx.foreignKeys = [];
        tx.created = Math.floor(Date.now() / 1000);
        
        const req = await web3.network.getAPI(node).getFeeTransaction(node, tx);
        expect(req.error).toEqual(undefined);
        tx.output = req.data;
        tx.fee = tx.output.feeUsed;
        tx.hash = tx.toHash();
        
        tx.sign = [await wallet.signHash(tx.hash)];

        //tx.isValid();
        console.log(tx);
        /*let error = await web3.transactions.sendTransaction(tx);
        expect(error).toEqual(undefined);

        await web3.transactions.waitConfirmation(tx.hash, 10000);

        let res = await web3.transactions.getTransactionByHash(tx.hash);
        expect(res !== undefined).toEqual(true);
        if (res !== undefined) {
            expect(res.status).not.toEqual('mempool');
            expect(res.status == 'confirmed' || res.status == 'mined').toEqual(true);
        }*/
    }, 15000);

    /*
    test('send add balance', async () => {
        const addr = new Wallet();

        let addressInfo = await web3.wallets.getWalletInfo(addr.address, chain);
        expect(addressInfo !== undefined).toEqual(true);
        if (addressInfo !== undefined) {
            expect(addressInfo.balance).toEqual('0');
        }

        const tx = await web3.transactions.buildConfig.addBalance(wallet, chain, addr.address, `1000`);
        let error = await web3.transactions.sendTransaction(tx);
        expect(error).toEqual(undefined);
        await web3.transactions.waitConfirmation(tx.hash, 10000);
        await helper.sleep(2000);

        addressInfo = await web3.wallets.getWalletInfo(addr.address, chain);
        expect(addressInfo !== undefined).toEqual(true);
        if (addressInfo !== undefined) {
            expect(addressInfo.balance).toEqual('1000');
        }
    }, 15000);

    test('make transfer', async () => {
        const addr1 = new Wallet();
        const addr2 = new Wallet();

        let tx = await web3.transactions.buildConfig.addBalance(wallet, chain, addr1.address, `1000`);
        let output = await web3.transactions.sendTransactionSync(tx);
        expect(output.error).toEqual(undefined);
        
        tx = await web3.transactions.buildSimpleTx(addr1, chain, addr2.address, `300`);
        output = await web3.transactions.sendTransactionSync(tx);
        expect(output.error).toEqual(undefined);

        let addressInfo = await web3.wallets.getWalletInfo(addr1.address, chain);
        expect(addressInfo !== undefined).toEqual(true);
        if (addressInfo !== undefined) {
            expect(addressInfo.balance).toEqual('700');
        }

        addressInfo = await web3.wallets.getWalletInfo(addr2.address, chain);
        expect(addressInfo !== undefined).toEqual(true);
        if (addressInfo !== undefined) {
            expect(addressInfo.balance).toEqual('300');
        }
    }, 30000);
    
    test('simulate ERC20', async () => {
        let env = JSON.parse(fs.readFileSync('./assets/enviroment.json', 'utf8'));

        const contractAddress = BywiseHelper.getBWSAddressContract();

        // deploy contract
        let simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            amount: 0,
            contractAddress,
            code: ERCCode,
            env: env
        })
        expect(simulate.stack).toEqual(undefined);
        expect(simulate.error).toEqual(undefined);
        env = simulate.env;

        // check name of contract
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'name',
            inputs: [],
            env: env
        });
        expect(simulate.error).toEqual(undefined);
        expect(simulate.output).toEqual('SimpleToken');

        // check total supply of contract
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'totalSupply',
            inputs: [],
            env: env
        });
        expect(simulate.error).toEqual(undefined);
        expect(simulate.output).toEqual('5000000000000000000000');

        // get balance of deploy address
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'balanceOf',
            inputs: [env.wallets[0]],
            env: env
        });
        expect(simulate.error).toEqual(undefined);
        expect(simulate.output).toEqual('5000000000000000000000');

        // get balance of contract address
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'balanceOf',
            inputs: [contractAddress],
            env: env
        });
        expect(simulate.error).toEqual(undefined);
        expect(simulate.output).toEqual('0');

        // make transfer to contract address
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'transfer',
            inputs: [contractAddress, '1000000000000000000000'],
            env: env
        });
        env = simulate.env;
        expect(simulate.error).toEqual(undefined);

        // get balance of contract address
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'balanceOf',
            inputs: [contractAddress],
            env: env
        });
        expect(simulate.error).toEqual(undefined);
        expect(simulate.output).toEqual('1000000000000000000000');

        // make transfer to contract address with invalid amount
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'transfer',
            inputs: [contractAddress, '-1000000'],
            env: env
        });
        expect(simulate.error).toEqual('invalid amount - -1000000');

        // get balance of contract address
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'balanceOf',
            inputs: [contractAddress],
            env: env
        });
        expect(simulate.error).toEqual(undefined);
        expect(simulate.output).toEqual('1000000000000000000000');

        // get balance of deploy address
        simulate = await web3.contracts.simulateContract({
            from: env.wallets[0],
            contractAddress: contractAddress,
            amount: 0,
            method: 'balanceOf',
            inputs: [env.wallets[0]],
            env: env
        });
        expect(simulate.error).toEqual(undefined);
        expect(simulate.output).toEqual('4000000000000000000000');
    }, 30000);
    
    test('deploy ERC20', async () => {
        const addr1 = (new Wallet()).address;

        const contractAddress = BywiseHelper.getBWSAddressContract();
        let tx = await web3.transactions.buildSimpleTx(
            wallet,
            chain,
            BywiseHelper.ZERO_ADDRESS,
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCode }
        );
        const output = await web3.transactions.sendTransactionSync(tx);
        expect(output.output.contractAddress).toEqual(contractAddress);

        // check name of contract
        let result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'name',
            []
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual('SimpleToken');

        // check total supply of contract
        result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'totalSupply',
            []
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual('5000000000000000000000');

        // get balance of deploy address
        result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'balanceOf',
            [wallet.address]
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual('5000000000000000000000');

        // get balance of deploy address
        result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'balanceOf',
            [contractAddress]
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual('0');

        // get balance of addr1
        result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'balanceOf',
            [addr1]
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual('0');

        // make transfer to addr1
        tx = await web3.transactions.buildSimpleTx(
            wallet,
            chain,
            contractAddress,
            '0',
            TxType.TX_CONTRACT_EXE,
            [{ method: 'transfer', inputs: [addr1, '10000000'] }]
        );
        await web3.transactions.sendTransactionSync(tx);

        // get balance of deploy address
        result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'balanceOf',
            [wallet.address]
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual('4999999999999990000000');

        // get balance of addr1
        result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'balanceOf',
            [addr1]
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual('10000000');
    }, 30000);
    
    test('vm-tests', async () => {
        const tests = fs.readdirSync('./assets/vm-tests');
        const env = JSON.parse(fs.readFileSync('./assets/enviroment.json', 'utf8'));
        const contractAddress = BywiseHelper.getBWSAddressContract();

        for (let i = 0; i < tests.length; i++) {
            const filename = tests[i];
            const code = fs.readFileSync('./assets/vm-tests/' + filename, 'utf8');

            const simulate = await web3.contracts.simulateContract({
                from: env.wallets[0],
                amount: 0,
                contractAddress,
                code: code,
                env: env
            })
            expect(simulate.stack).toEqual(undefined);
            expect(simulate.error).toEqual(undefined);

            const tx = new Tx();
            tx.version = '3';
            tx.chain = chain;
            tx.from = [wallet.address];
            tx.to = [BywiseHelper.ZERO_ADDRESS];
            tx.amount = ['0'];
            tx.foreignKeys = [];
            tx.type = TxType.TX_CONTRACT;
            tx.data = { contractAddress, code: code };
            const output = await web3.transactions.estimateFee(tx);
            expect(output.error).toEqual(undefined);
        }

    }, 30000);
    
    test('ERC20 many transactions', async () => {
        const addr1 = (new Wallet()).address;

        const contractAddress = BywiseHelper.getBWSAddressContract();
        let deployTx = await web3.transactions.buildSimpleTx(
            wallet,
            chain,
            BywiseHelper.ZERO_ADDRESS,
            '0',
            TxType.TX_CONTRACT,
            { contractAddress, code: ERCCode }
        );
        await web3.transactions.sendTransaction(deployTx);
        await web3.transactions.waitConfirmation(deployTx.hash, 10000);
        let res = await web3.transactions.getTransactionByHash(deployTx.hash);
        expect(res !== undefined).toEqual(true);
        if (res !== undefined) {
            expect(res.status).not.toEqual('mempool');
            expect(res.status == 'confirmed' || res.status == 'mined').toEqual(true);
            expect(res.output.output.contractAddress).toEqual(contractAddress);
        }

        let txs: Tx[] = []
        let total = 0;
        for (let i = 0; i < 30; i++) {
            const tx = await web3.transactions.buildSimpleTx(
                wallet,
                chain,
                contractAddress,
                '0',
                TxType.TX_CONTRACT_EXE,
                [{ method: 'transfer', inputs: [addr1, `${i}`] }]
            );
            total += i;
            await web3.transactions.sendTransaction(tx);
            txs.push(tx);
        }

        let hasMempool = true;
        while (hasMempool) {
            hasMempool = false;

            for (let i = 0; i < txs.length; i++) {
                const tx = txs[i];
                let req = await web3.transactions.getTransactionByHash(tx.hash);
                if (req && req.status == 'mempool') {
                    hasMempool = true;
                }
            }
            await helper.sleep(1000);
        }

        for (let i = 0; i < txs.length; i++) {
            const tx = txs[i];
            let req = await web3.transactions.getTransactionByHash(tx.hash);
            expect(req !== undefined).toEqual(true);
            if(req) {
                expect(req.status).not.toEqual('mempool');
                expect(req.output.error).toEqual(undefined);
            }
        }

        // get balance of addr1
        let result = await web3.contracts.readContract(
            chain,
            contractAddress,
            'balanceOf',
            [addr1]
        );
        expect(result.error).toEqual(undefined);
        expect(result.output).toEqual(`${total}`);
    }, 60000);
    */
});
