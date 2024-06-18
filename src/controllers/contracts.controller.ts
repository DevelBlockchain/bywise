import express from 'express';
import BigNumber from "bignumber.js";
import metadataDocument from '../metadata/metadataDocument';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiContext } from '../types';
import { RequestKeys } from '../datasource/message-queue';
import BlockchainDebug from '../vm/BlockchainDebug';
import { GetContract } from '../vm/BlockchainInterface';
import { BywiseHelper, Tx, TxType } from '@bywise/web3';
import BywiseRuntime, { BywiseContractContext } from '../vm/BywiseRuntime';
import helper from '../utils/helper';

export default async function contractsController(app: express.Express, apiContext: ApiContext): Promise<void> {
    const router = express.Router();
    const TransactionRepository = apiContext.applicationContext.database.TransactionRepository;
    const EventsRepository = apiContext.applicationContext.database.EventsRepository;

    metadataDocument.addPath({
        path: "/api/v2/contracts/simulate",
        type: 'post',
        controller: 'ContractsController',
        description: 'Simulate enviroment',
        security: false,
        body: {
            type: 'object',
            properties: [
                { name: 'code', type: 'string' },
                { name: 'method', type: 'string' },
                { name: 'inputs', type: 'array', items: { type: 'string' } },
                { name: 'from', type: 'string', required: true },
                { name: 'contractAddress', type: 'string', required: true },
                { name: 'amount', type: 'number', required: true },
                { name: 'tag', type: 'string', required: false },
                { name: 'env', type: 'object', required: true },
            ]
        },
        responses: [{
            code: 200,
            description: 'Success',
        }]
    })
    router.post('/contracts/simulate', async (req: express.Request, res: express.Response) => {
        try {
            const body: { code?: string, method?: string, inputs?: string[], contractAddress: string, from: string, amount: number, tag: string, env: any } = req.body;
            const runtimeContext = body.env;

            const blockchainDebug = new BlockchainDebug(apiContext.applicationContext);
            blockchainDebug.loadData(runtimeContext);

            const getContract: GetContract = async (address: string, method: string, inputs: string[]): Promise<{ bcc: BywiseContractContext, code: string, view: boolean, payable: boolean }> => {
                if (!BywiseHelper.isValidAddress(address)) throw new Error(`Invalid address`);
                if (inputs === undefined) throw new Error(`inputs array not found`);
                if (!Array.isArray(inputs)) throw new Error(`Inputs need be an array`);
                const bcc: BywiseContractContext = runtimeContext.contractAddress[address];
                if (!bcc) throw new Error(`Contract not found`);
                let foundMethod = false;
                let view = false;
                let payable = false;
                for (let i = 0; i < bcc.abi.length; i++) {
                    const abiMethod = bcc.abi[i];
                    if (abiMethod.name === method) {
                        foundMethod = true;
                        view = abiMethod.view;
                        payable = abiMethod.payable;
                        if (inputs.length !== abiMethod.parameters.length) throw new Error(`expected ${abiMethod.parameters.length} inputs`);
                    }
                }
                if (!foundMethod) throw new Error(`Invalid method`);
                return {
                    payable,
                    view,
                    bcc,
                    code: `globalThis.contract.${method}(${inputs.map(i => `"${i}"`).join(',')});`
                }
            }

            if (runtimeContext.contractAddress[body.contractAddress]) {
                if (!body.method) throw new Error(`need method`);
                if (body.inputs === undefined) throw new Error(`need inputs`);

                const contract = await getContract(body.contractAddress, body.method, body.inputs);

                const ctx = helper.createSimulationContext('local');
                ctx.nonce = runtimeContext.nonce++;
                ctx.envContext.blockHeight = runtimeContext.blockHeight;
                ctx.tx = new Tx();
                ctx.tx.version = '2';
                ctx.tx.chain = 'local';
                ctx.tx.from = [body.from];
                ctx.tx.to = [body.contractAddress];
                ctx.tx.amount = [`${body.amount}`];
                ctx.tx.fee = '0.12';
                ctx.tx.type = TxType.TX_CONTRACT_EXE;
                ctx.tx.created = Math.floor(Date.now() / 1000);
                ctx.tx.hash = helper.getRandomHash();

                await blockchainDebug.internalTransfer(body.from, ctx.tx.to[0], ctx.tx.amount[0]);
                await blockchainDebug.payFee(body.from, ctx.tx.fee);

                const sendAmount = `${req.body.amount}`;

                if (!contract.payable && !(new BigNumber(sendAmount)).isEqualTo(new BigNumber('0'))) throw new Error(`Method not is payable`);
                
                const output = await BywiseRuntime.execInContract(blockchainDebug, getContract, ctx, req.body.contractAddress, contract.bcc, req.body.from, sendAmount, contract.code);

                runtimeContext.data = blockchainDebug.export();

                return res.send({
                    env: runtimeContext,
                    output: output,
                    logs: ctx.output.logs
                });
            } else {
                if (!body.code) throw new Error(`need code`);

                const contractAddress = body.contractAddress;
                const ctx = helper.createSimulationContext('local');
                ctx.nonce = runtimeContext.nonce++;
                ctx.envContext.blockHeight = runtimeContext.blockHeight;
                ctx.tx = new Tx();
                ctx.tx.version = '2';
                ctx.tx.chain = 'local';
                ctx.tx.from = [body.from];
                ctx.tx.to = [BywiseHelper.ZERO_ADDRESS];
                ctx.tx.amount = [`${body.amount}`];
                ctx.tx.fee = '0.12';
                ctx.tx.type = TxType.TX_CONTRACT;
                ctx.tx.created = Math.floor(Date.now() / 1000);
                ctx.tx.hash = helper.getRandomHash();

                await blockchainDebug.internalTransfer(body.from, contractAddress, ctx.tx.amount[0]);
                await blockchainDebug.payFee(body.from, ctx.tx.fee);

                if (!(new BigNumber(`${body.amount}`)).isEqualTo(new BigNumber('0'))) throw new Error(`Method not is payable`);

                const output = await BywiseRuntime.execContract(blockchainDebug, getContract, ctx, contractAddress, body.from, `${body.amount}`, body.code);

                runtimeContext.data = blockchainDebug.export();
                runtimeContext.contractAddress[contractAddress] = output;

                return res.send({
                    env: runtimeContext,
                    output: {
                        abi: output.abi,
                        contractAddress: contractAddress,
                    },
                    logs: ctx.output.logs
                });
            }
        } catch (err: any) {
            if (err.cause && err.cause.stack)
                err.cause.stack = err.cause.stack.replace(/eval\.js/g, 'contract.js').replace(/<eval>/g, '<contract>').replace(/<anonymous>/g, '<contract>')
            return res.send({
                error: err.message,
                stack: err.cause
            });
        }
    });

    metadataDocument.addPath({
        path: "/api/v2/contracts/abi/{chain}/{address}",
        type: 'get',
        controller: 'ContractsController',
        description: 'Get contract by address',
        security: false,
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'address', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionOutputDTO
            }
        }]
    })
    router.get('/contracts/abi/:chain/:address', async (req: express.Request, res: express.Response) => {
        const chain = req.params.chain;
        const address = req.params.address;
        const blockTree = apiContext.blockTree.get(chain);
        if (blockTree) {
            const bcc = await apiContext.applicationContext.mq.request(RequestKeys.get_contract, { chain, address: address });
            if (bcc) {
                const txHash = (JSON.parse(bcc)).txHash;
                const btx = await TransactionRepository.findByHash(txHash);
                if (!btx) return res.status(404).send({ error: "Transaction not found" });
                return res.send(btx.output);
            }
        }
        return res.status(404).send({ error: "Contract not found" });
    });

    metadataDocument.addPath({
        path: "/api/v2/contracts/events/{chain}/{address}/{event}",
        type: 'get',
        controller: 'ContractsController',
        description: 'Get contract events',
        security: false,
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'address', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'event', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'key', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'value', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionOutputDTO
            }
        }]
    })
    router.get('/contracts/events/:chain/:address/:event', async (req: express.Request, res: express.Response) => {
        const chain = req.params.chain;
        const address = req.params.address;
        const event = req.params.event;

        if (req.query.key) {
            const key = `${req.query.key}`;
            const value = `${req.query.value}`;
            const events = await EventsRepository.findByEventAndKey(chain, address, event, key, value, 100, 0);
            return res.send(events);
        } else {
            const events = await EventsRepository.findByEvent(chain, address, event, 100, 0);
            return res.send(events);
        }

    });

    app.use('/api/v2', router);
}