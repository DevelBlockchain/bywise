import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { RequestKeys } from '../datasource/message-queue';
import { ApiService } from '../services';
import { Tx, TxType } from '@bywise/web3';
import { CompiledContext, TransactionsToExecute } from '../types';

export default async function contractsController(app: express.Express, apiProvider: ApiService): Promise<void> {
    const router = express.Router();
    const TransactionRepository = apiProvider.applicationContext.database.TransactionRepository;

    metadataDocument.addPath({
        path: "/api/v2/contracts/simulate",
        type: 'post',
        controller: 'ContractsController',
        description: 'Simulate enviroment',
        securityType: ['node'],
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
            const contractAddress = body.contractAddress;

            const tx = new Tx();
            tx.version = '3';
            tx.chain = 'local';
            tx.from = [body.from];
            tx.to = [contractAddress];
            tx.amount = [`${body.amount}`];
            tx.fee = '50';
            tx.created = Math.floor(Date.now() / 1000);
            if(body.code) {
                tx.type = TxType.TX_CONTRACT;
                tx.data = { contractAddress, code: body.code };
            } else {
                tx.type = TxType.TX_CONTRACT_EXE;
                tx.data = [{ method: body.method, inputs: body.inputs }];
            }
            tx.hash = tx.toHash();

            const env = {
                chain: tx.chain,
                fromContextHash: CompiledContext.SIMULATE_CONTEXT_HASH,
                blockHeight: runtimeContext.blockHeight,
                changes: runtimeContext.memory
            }
            const tte:TransactionsToExecute = await apiProvider.applicationContext.mq.request(RequestKeys.simulate_tx, { tx: tx, env });

            runtimeContext.memory = tte.envOut;
            if(body.code && !tte.error) {
                runtimeContext.contractAddress[contractAddress] = tte.outputs[0].output;
            }

            return res.send({
                env: runtimeContext,
                ...tte.outputs[0]
            });
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
        securityType: ['node'],
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
        if (!apiProvider.chains.includes(chain)) return res.status(400).send({ error: "Node does not work with this chain" });

        const bcc = await apiProvider.applicationContext.mq.request(RequestKeys.get_contract, { chain, address: address });
        if (bcc) {
            const txHash = (JSON.parse(bcc)).txHash;
            const tx = await TransactionRepository.findTxByHash(txHash);
            if (!tx) return res.status(404).send({ error: "Transaction not found" });
            return res.send(tx.output);
        }
    });

    metadataDocument.addPath({
        path: "/api/v2/contracts/events/{chain}/{contractAddress}/{eventName}",
        type: 'get',
        controller: 'ContractsController',
        description: 'Get contract events',
        securityType: ['node'],
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'contractAddress', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'eventName', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'key', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'value', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'page', in: 'query', pattern: /^[0-9]+$/ },
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
        const contractAddress = req.params.contractAddress;
        const eventName = req.params.eventName;
        const page = req.query.page ? parseInt(`${req.query.page}`) : 0;
        if (!apiProvider.chains.includes(chain)) return res.status(400).send({ error: "Node does not work with this chain" });

        try {
            if (req.query.key && req.query.value) {
                const key = `${req.query.key}`;
                const value = `${req.query.value}`;
                const output = await apiProvider.applicationContext.mq.request(RequestKeys.get_events_by_key, {
                    chain,
                    contractAddress,
                    eventName,
                    key,
                    value,
                    page,
                });
                return res.send(output);
            } else {
                const output = await apiProvider.applicationContext.mq.request(RequestKeys.get_events, {
                    chain,
                    contractAddress,
                    eventName,
                    page,
                });
                return res.send(output);
            }
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

    app.use('/api/v2', router);
}