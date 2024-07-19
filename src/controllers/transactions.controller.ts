import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Slice, Tx } from '@bywise/web3';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { RequestProcess, TransactionsToExecute } from '../types';
import { RequestKeys } from '../datasource/message-queue';
import { ApiService } from '../services';
import helper from '../utils/helper';

export default async function transactionsController(app: express.Express, apiProvider: ApiService): Promise<void> {
    const router = express.Router();
    const TransactionRepository = apiProvider.applicationContext.database.TransactionRepository;

    const reqProcessCount: RequestProcess = async (req, context) => {
        const chain = req.query.chain as string;
        const searchBy = req.query.searchBy as string;
        const value = req.query.value as string;

        if (!value && !searchBy && !chain) {
            return {
                id: req.id,
                body: { count: await TransactionRepository.count() },
                status: 200
            }
        }
        if (!chain) {
            return {
                id: req.id,
                body: { error: `missing chain` },
                status: 400
            }
        }
        if (!apiProvider.chains.includes(chain)) {
            return {
                id: req.id,
                body: { error: `Node does not work with this chain` },
                status: 400
            }
        }
        if (!value && !searchBy) {
            return {
                id: req.id,
                body: { count: await TransactionRepository.countByChain(chain) },
                status: 200
            }
        }
        if (!searchBy) {
            return {
                id: req.id,
                body: { error: `missing searchBy` },
                status: 400
            }
        }
        if (!value) {
            return {
                id: req.id,
                body: { error: `missing value` },
                status: 400
            }
        }
        let count;
        if (searchBy === 'from') {
            count = await TransactionRepository.countByChainAndFrom(chain, value);
        } else if (searchBy === 'to') {
            count = await TransactionRepository.countByChainAndTo(chain, value);
        } else if (searchBy === 'key') {
            count = await TransactionRepository.countByChainAndKey(chain, value);
        } else if (searchBy === 'address') {
            count = await TransactionRepository.countByChainAndAddress(chain, value);
        } else {
            return {
                id: req.id,
                body: { error: `invalid searchBy ${searchBy}` },
                status: 400
            }
        }
        return {
            id: req.id,
            body: { count: count },
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/transactions/count",
        type: 'get',
        controller: 'TransactionsController',
        description: 'Count transactions',
        securityType: ['node'],
        parameters: [
            { name: 'chain', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'searchBy', in: 'query', pattern: /^address|from|to|key$/ },
            { name: 'value', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
                properties: [
                    { name: 'count', type: 'number' },
                ]
            }
        }],
        reqProcess: reqProcessCount,
    })
    router.get('/transactions/count', async (req: any, res: express.Response) => {
        const response = await reqProcessCount(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessLast: RequestProcess = async (req, context) => {
        let offset = 0;
        let limit = 100;
        let order: 'asc' | 'desc' = req.query.order === 'asc' ? 'asc' : 'desc';
        if (typeof req.query.offset === 'string') {
            offset = parseInt(req.query.offset);
        }
        if (typeof req.query.limit === 'string') {
            limit = parseInt(req.query.limit);
        }
        if (limit > 200) {
            return {
                id: req.id,
                body: { error: "invalid limit" },
                status: 400
            }
        }

        const chain = req.params.chain as string;
        const searchBy = req.query.searchBy as string;
        const value = req.query.value as string;
        let txs: Tx[] = [];

        if (!apiProvider.chains.includes(chain)) {
            return {
                id: req.id,
                body: { error: `Node does not work with this chain` },
                status: 400
            }
        }

        if (!value && !searchBy) {
            txs = await TransactionRepository.findByChain(chain, limit, offset, order);
        } else if (!searchBy) {
            return {
                id: req.id,
                body: { error: `missing searchBy` },
                status: 400
            }
        } else if (!value) {
            return {
                id: req.id,
                body: { error: `missing value` },
                status: 400
            }
        } else if (searchBy === 'from') {
            txs = await TransactionRepository.findByChainAndFrom(chain, value, limit, offset, order);
        } else if (searchBy === 'to') {
            txs = await TransactionRepository.findByChainAndTo(chain, value, limit, offset, order);
        } else if (searchBy === 'key') {
            txs = await TransactionRepository.findByChainAndKey(chain, value, limit, offset, order);
        } else if (searchBy === 'address') {
            txs = await TransactionRepository.findByChainAndAddress(chain, value, limit, offset, order);
        } else {
            return {
                id: req.id,
                body: { error: `invalid searchBy ${searchBy}` },
                status: 400
            }
        }
        return {
            id: req.id,
            body: txs,
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/transactions/last/{chain}",
        type: 'get',
        controller: 'TransactionsController',
        description: 'Get transactions list',
        securityType: ['node'],
        parameters: [
            { name: 'chain', in: 'path', required: true, pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'searchBy', in: 'query', pattern: /^address|from|to|key$/ },
            { name: 'value', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'limit', in: 'query', pattern: /^[0-9]+$/ },
            { name: 'offset', in: 'query', pattern: /^[0-9]+$/ },
            { name: 'order', in: 'query', pattern: /^asc|desc$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'array',
                items: {
                    $ref: SCHEMA_TYPES.TransactionWithStatusDTO
                }
            }
        }],
        reqProcess: reqProcessLast,
    })
    router.get('/transactions/last/:chain', async (req: any, res: express.Response) => {
        const response = await reqProcessLast(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessHash: RequestProcess = async (req, context) => {
        const hash = req.params.hash;
        const tx = await TransactionRepository.findTxByHash(hash);
        if (!tx) {
            return {
                id: req.id,
                body: { error: "Transaction not found" },
                status: 404
            }
        }
        return {
            id: req.id,
            body: tx,
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/transactions/hash/{hash}",
        type: 'get',
        controller: 'TransactionsController',
        description: 'Get transaction by hash',
        securityType: ['node'],
        parameters: [
            { name: 'hash', in: 'path', required: true, pattern: /^[a-f0-9]{64}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionWithStatusDTO
            }
        }],
        reqProcess: reqProcessHash,
    })
    router.get('/transactions/hash/:hash', async (req: any, res: express.Response) => {
        const response = await reqProcessHash(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessFee: RequestProcess = async (req, context) => {
        const tx = new Tx(req.body);
        try {
            if (!apiProvider.chains.includes(tx.chain)) {
                return {
                    id: req.id,
                    body: { error: `Node does not work with this chain` },
                    status: 400
                }
            }
            const tte: TransactionsToExecute = await apiProvider.applicationContext.mq.request(RequestKeys.simulate_tx, { tx: tx, simulateMode: true });
            if (!tte) {
                return {
                    id: req.id,
                    body: { error: `failed VM` },
                    status: 400
                }
            }
            return {
                id: req.id,
                body: tte.outputs[0],
                status: 200
            }
        } catch (err: any) {
            return {
                id: req.id,
                body: { error: err.message },
                status: 400
            }
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/transactions/fee",
        type: 'post',
        controller: 'TransactionsController',
        description: 'Calculate transaction fee',
        securityType: ['node'],
        body: {
            type: 'object',
            properties: [
                { name: 'chain', type: 'string', required: true },
                { name: 'from', type: 'array', required: true, items: { type: 'string' } },
                { name: 'to', type: 'array', required: true, items: { type: 'string' } },
                { name: 'amount', type: 'array', required: true, items: { type: 'string' } },
                { name: 'tag', type: 'string' },
                { name: 'type', type: 'string', required: true },
                { name: 'foreignKeys', type: 'array', required: true, items: { type: 'string' } },
                { name: 'data', type: 'object' },
            ]
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionOutputDTO
            }
        }],
        reqProcess: reqProcessFee,
    })
    router.post('/transactions/fee', async (req: any, res: express.Response) => {
        const response = await reqProcessFee(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessTransactions: RequestProcess = async (req, context) => {
        const tx = req.body;
        try {
            if (!apiProvider.chains.includes(tx.chain)) {
                return {
                    id: req.id,
                    body: { error: `Node does not work with this chain` },
                    status: 400
                }
            }
            TransactionRepository.addMempool(tx);
            return {
                id: req.id,
                body: { message: 'OK' },
                status: 200
            }
        } catch (err: any) {
            return {
                id: req.id,
                body: { error: err.message },
                status: 400
            }
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/transactions",
        type: 'post',
        controller: 'TransactionsController',
        description: 'Insert new transactions',
        securityType: ['node'],
        body: {
            $ref: SCHEMA_TYPES.TxDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionDTO
            }
        }],
        reqProcess: reqProcessTransactions,
    })
    router.post('/transactions', async (req: any, res: express.Response) => {
        const response = await reqProcessTransactions(req, req.context);
        return res.status(response.status).send(response.body);
    });
    
    const reqProcessValidator: RequestProcess = async (req, context) => {
        const tx = req.body;
        try {
            if (!apiProvider.chains.includes(tx.chain)) {
                return {
                    id: req.id,
                    body: { error: `Node does not work with this chain` },
                    status: 400
                }
            }
            TransactionRepository.addMempool(tx);
            return {
                id: req.id,
                body: { message: 'OK' },
                status: 200
            }
        } catch (err: any) {
            return {
                id: req.id,
                body: { error: err.message },
                status: 400
            }
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/transactions/validator",
        type: 'post',
        controller: 'TransactionsController',
        description: 'Insert new transactions',
        securityType: ['node'],
        body: {
            $ref: SCHEMA_TYPES.TxDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionDTO
            }
        }],
        reqProcess: reqProcessValidator,
    })
    router.post('/transactions/validator', async (req: any, res: express.Response) => {
        const response = await reqProcessValidator(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessPub: RequestProcess = async (req, context) => {
        const body: { token: string, chain: string, to: string[], amount: string[], type: string, foreignKeys: string[], data: any } = req.body;
        try {
            if (body.token !== process.env.TOKEN) {
                return {
                    id: req.id,
                    body: { error: `Forbidden - invalid token` },
                    status: 400
                }
            }
            if (!apiProvider.chains.includes(body.chain)) {
                return {
                    id: req.id,
                    body: { error: `Node does not work with this chain` },
                    status: 400
                }
            }
            const mainWallet = await apiProvider.applicationContext.mainWallet;
            const tx = new Tx();
            tx.version = '3';
            tx.chain = body.chain;
            tx.from = [mainWallet.address];
            tx.to = body.to;
            tx.amount = body.amount;
            tx.fee = '0';
            tx.type = body.type;
            tx.data = body.data;
            tx.foreignKeys = body.foreignKeys;
            tx.created = Math.floor(Date.now() / 1000);

            let tte: TransactionsToExecute = await apiProvider.applicationContext.mq.request(RequestKeys.simulate_tx, { tx: tx, simulateMode: true });
            if (!tte) throw new Error(`failed VM`);
            tx.output = tte.outputs[0];

            tx.fee = tx.output.feeUsed;
            tx.hash = tx.toHash();
            tx.sign = [await mainWallet.signHash(tx.hash)];

            if (tx.output.error) {
                throw new Error(tx.output.error);
            }
            TransactionRepository.addMempool(tx);
            return {
                id: req.id,
                body: { ...tx },
                status: 200
            }
        } catch (err: any) {
            return {
                id: req.id,
                body: { error: err.message },
                status: 400
            }
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/transactions/publish",
        type: 'post',
        controller: 'TransactionsController',
        description: 'Calculate transaction fee',
        security: false,
        body: {
            type: 'object',
            properties: [
                { name: 'token', type: 'string', required: true },
                { name: 'chain', type: 'string', required: true },
                { name: 'to', type: 'array', required: true, items: { type: 'string' } },
                { name: 'amount', type: 'array', required: true, items: { type: 'string' } },
                { name: 'type', type: 'string', required: true },
                { name: 'foreignKeys', type: 'array', required: true, items: { type: 'string' } },
                { name: 'data', type: 'object' },
            ]
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionDTO
            }
        }],
        reqProcess: reqProcessPub,
    })
    router.post('/transactions/publish', async (req: any, res: express.Response) => {
        const response = await reqProcessPub(req, req.context);
        return res.status(response.status).send(response.body);
    });

    app.use('/api/v2', router);
}