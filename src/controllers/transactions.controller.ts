import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Tx } from '@bywise/web3';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiContext, BlockchainStatus, TransactionOutputDTO, TransactionsDTO } from '../types';
import { Transaction } from '../models';
import { RequestKeys } from '../datasource/message-queue';

export default async function transactionsController(app: express.Express, apiContext: ApiContext): Promise<void> {
    const router = express.Router();
    const TransactionRepository = apiContext.applicationContext.database.TransactionRepository;

    metadataDocument.addPath({
        path: "/api/v2/transactions/count",
        type: 'get',
        controller: 'TransactionsController',
        description: 'Count transactions',
        security: false,
        parameters: [
            { name: 'chain', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'searchBy', in: 'query', pattern: /^address|from|to|key|status$/ },
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
        }]
    })
    router.get('/transactions/count', async (req: express.Request, res: express.Response) => {
        const chain = req.query.chain as string;
        const searchBy = req.query.searchBy as string;
        const value = req.query.value as string;

        if (!value && !searchBy && !chain) {
            return res.send({ count: await TransactionRepository.count() });
        }
        if (!chain) {
            return res.status(400).send({ error: `missing chain` });
        }
        if (!value && !searchBy) {
            return res.send({ count: await TransactionRepository.countByChain(chain) });
        }
        if (!searchBy) {
            return res.status(400).send({ error: `missing searchBy` });
        }
        if (!value) {
            return res.status(400).send({ error: `missing value` });
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
        } else if (searchBy === 'status') {
            let status: BlockchainStatus | undefined;
            if (value === 'mempool') {
                status = BlockchainStatus.TX_MEMPOOL;
            } else if (value === 'failed') {
                status = BlockchainStatus.TX_FAILED;
            } else if (value === 'confirmed') {
                status = BlockchainStatus.TX_CONFIRMED;
            } else if (value === 'mined') {
                status = BlockchainStatus.TX_MINED;
            }
            if (!status) {
                return res.status(400).send({ error: `invalid status ${value}` });
            }
            count = await TransactionRepository.countByChainAndStatus(chain, status);
        } else {
            return res.status(400).send({ error: `invalid searchBy ${searchBy}` });
        }
        return res.send({ count: count });
    });

    metadataDocument.addPath({
        path: "/api/v2/transactions/last/{chain}",
        type: 'get',
        controller: 'TransactionsController',
        description: 'Get transactions list',
        security: false,
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'searchBy', in: 'query', pattern: /^address|from|to|key|status$/ },
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
        }]
    })
    router.get('/transactions/last/:chain', async (req: express.Request, res: express.Response) => {
        let offset = 0;
        let limit = 100;
        let order: 'asc' | 'desc' = req.query.order === 'asc' ? 'asc' : 'desc';
        if (typeof req.query.offset === 'string') {
            offset = parseInt(req.query.offset);
        }
        if (typeof req.query.limit === 'string') {
            limit = parseInt(req.query.limit);
        }
        if (limit > 200) return res.status(400).send({ error: "invalid limit" });

        const chain = req.params.chain as string;
        const searchBy = req.query.searchBy as string;
        const value = req.query.value as string;
        let txs: Transaction[] = [];

        if (!value && !searchBy) {
            txs = await TransactionRepository.findByChain(chain, limit, offset, order);
        } else if (!searchBy) {
            return res.status(400).send({ error: `missing searchBy` });
        } else if (!value) {
            return res.status(400).send({ error: `missing value` });
        } else if (searchBy === 'from') {
            txs = await TransactionRepository.findByChainAndFrom(chain, value, limit, offset, order);
        } else if (searchBy === 'to') {
            txs = await TransactionRepository.findByChainAndTo(chain, value, limit, offset, order);
        } else if (searchBy === 'key') {
            txs = await TransactionRepository.findByChainAndKey(chain, value, limit, offset, order);
        } else if (searchBy === 'address') {
            txs = await TransactionRepository.findByChainAndAddress(chain, value, limit, offset, order);
        } else if (searchBy === 'status') {
            let status: BlockchainStatus | undefined;
            if (value === 'mempool') {
                status = BlockchainStatus.TX_MEMPOOL;
            } else if (value === 'failed') {
                status = BlockchainStatus.TX_FAILED;
            } else if (value === 'confirmed') {
                status = BlockchainStatus.TX_CONFIRMED;
            } else if (value === 'mined') {
                status = BlockchainStatus.TX_MINED;
            }
            if (!status) {
                return res.status(400).send({ error: `invalid status ${value}` });
            }
            txs = await TransactionRepository.findByChainAndStatus(chain, status, limit, offset, order);
        } else {
            return res.status(400).send({ error: `invalid searchBy ${searchBy}` });
        }
        return res.send(txs.map(tx => ({ ...(new Tx(tx.tx)), status: tx.status, output: tx.output })));
    });

    metadataDocument.addPath({
        path: "/api/v2/transactions/hash/{hash}",
        type: 'get',
        controller: 'TransactionsController',
        description: 'Get transaction by hash',
        security: false,
        parameters: [
            { name: 'hash', in: 'path', pattern: /^[a-f0-9]{64}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionWithStatusDTO
            }
        }]
    })
    router.get('/transactions/hash/:hash', async (req: express.Request, res: express.Response) => {
        const hash = req.params.hash;
        const btx = await TransactionRepository.findByHash(hash);
        if (!btx) return res.status(404).send({ error: "Transaction not found" });
        const blockTree = apiContext.blockTree.get(btx.tx.chain);
        if (blockTree) {
            apiContext.transactionsProvider.populateTxInfo(blockTree, hash);
        }
        let tx: any = btx.tx;
        return res.send({ ...new Tx(tx), status: btx.status, output: btx.output });
    });

    metadataDocument.addPath({
        path: "/api/v2/transactions/fee",
        type: 'post',
        controller: 'TransactionsController',
        description: 'Calculate transaction fee',
        security: false,
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
        }]
    })
    router.post('/transactions/fee', async (req: express.Request, res: express.Response) => {
        const tx = new Tx(req.body);
        try {
            const blockTree = apiContext.blockTree.get(tx.chain)
            if (!blockTree) return res.status(400).send({ error: `Node does not work with this chain` });
            tx.fee = '0';
            const output = await apiContext.applicationContext.mq.request(RequestKeys.simulate_tx, { tx: tx, simulateWallet: true });

            return res.send(output);
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

    metadataDocument.addPath({
        path: "/api/v2/transactions",
        type: 'post',
        controller: 'TransactionsController',
        description: 'Insert new transactions',
        security: false,
        body: {
            $ref: SCHEMA_TYPES.TxDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionDTO
            }
        }]
    })
    router.post('/transactions', async (req: express.Request, res: express.Response) => {
        const tx = new Tx(req.body);
        try {
            if (!apiContext.chains.includes(tx.chain)) {
                return res.status(400).send({ error: `Node does not work with this chain` });
            }

            const output: TransactionOutputDTO = await apiContext.applicationContext.mq.request(RequestKeys.simulate_tx, { tx: tx, simulateWallet: false });
            if (output.error) {
                throw new Error(output.error);
            }

            const btx = await apiContext.transactionsProvider.saveNewTransaction(tx);
            return res.send(new TransactionsDTO(btx));
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

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
        }]
    })
    router.post('/transactions/publish', async (req: express.Request, res: express.Response) => {
        const body: { token: string, chain: string, to: string[], amount: string[], type: string, foreignKeys: string[], data: any } = req.body;
        try {
            if (body.token !== process.env.TOKEN) return res.status(400).send({ error: `Forbidden - invalid token` });

            const blockTree = apiContext.blockTree.get(body.chain)
            if (!blockTree) return res.status(400).send({ error: `Node does not work with this chain` });

            const mainWallet = await apiContext.walletProvider.getMainWallet();
            const tx = new Tx();
            tx.version = '2';
            tx.chain = body.chain;
            tx.from = [mainWallet.address];
            tx.to = body.to;
            tx.amount = body.amount;
            tx.fee = '0';
            tx.type = body.type;
            tx.data = body.data;
            tx.foreignKeys = body.foreignKeys;
            tx.created = Math.floor(Date.now() / 1000);

            let output: TransactionOutputDTO = await apiContext.applicationContext.mq.request(RequestKeys.simulate_tx, { tx: tx, simulateWallet: true });

            tx.fee = output.feeUsed;
            tx.hash = tx.toHash();
            tx.sign = [await mainWallet.signHash(tx.hash)];
            tx.isValid();

            output = await apiContext.applicationContext.mq.request(RequestKeys.simulate_tx, { tx: tx, simulateWallet: false });

            if (output.error) {
                throw new Error(output.error);
            }

            const txInfo = await apiContext.transactionsProvider.saveNewTransaction(tx);

            return res.send({ ...txInfo.tx, status: txInfo.status, output });
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

    app.use('/api/v2', router);
}