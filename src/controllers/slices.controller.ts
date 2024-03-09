import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Slice, Tx } from '@bywise/web3';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiContext, BlockchainStatus } from '../types';

export default async function slicesController(app: express.Express, apiContext: ApiContext): Promise<void> {
    const router = express.Router();
    const SliceRepository = apiContext.applicationContext.database.SliceRepository;

    metadataDocument.addPath({
        path: "/api/v2/slices/count/{chain}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Count slices',
        security: false,
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'status', in: 'query', pattern: /^mined|mempool|invalidated$/ },
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
    router.get('/slices/count/:chain', async (req: express.Request, res: express.Response) => {
        let status: BlockchainStatus = BlockchainStatus.TX_MINED;
        if(req.query.status === 'mempool') {
            status = BlockchainStatus.TX_MEMPOOL;
        } else if(req.query.status === 'failed') {
            status = BlockchainStatus.TX_FAILED;
        }

        const count = await SliceRepository.count(req.params.chain, status);
        return res.send({ count });
    });

    metadataDocument.addPath({
        path: "/api/v2/slices/last/{chain}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Get slices list',
        security: false,
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'limit', in: 'query', pattern: /^[0-9]+$/ },
            { name: 'offset', in: 'query', pattern: /^[0-9]+$/ },
            { name: 'order', in: 'query', pattern: /^asc|desc$/ },
            { name: 'status', in: 'query', pattern: /^mined|mempool|invalidated$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'array',
                items: {
                    $ref: SCHEMA_TYPES.SliceDTO
                }
            }
        }]
    })
    router.get('/slices/last/:chain', async (req: express.Request, res: express.Response) => {
        let offset = 0;
        let limit = 100;
        let status: BlockchainStatus = BlockchainStatus.TX_MINED;
        let order: 'asc' | 'desc' = req.query.order === 'asc' ? 'asc' : 'desc';
        if(req.query.status === 'mempool') {
            status = BlockchainStatus.TX_MEMPOOL;
        } else if(req.query.status === 'failed') {
            status = BlockchainStatus.TX_FAILED;
        }
        if (typeof req.query.offset === 'string') {
            offset = parseInt(req.query.offset);
        }
        if (typeof req.query.limit === 'string') {
            limit = parseInt(req.query.limit);
        }
        if (limit > 200) return res.status(400).send({ error: "invalid limit" });

        const slices = await SliceRepository.find(req.params.chain, status, limit, offset, order);
        return res.send(slices.map(slice => slice.slice));
    });

    metadataDocument.addPath({
        path: "/api/v2/slices/hash/{hash}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Get slice by hash',
        security: false,
        parameters: [
            { name: 'hash', in: 'path', pattern: /^[a-f0-9]{64}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.SliceDTO
            }
        }]
    })
    router.get('/slices/hash/:hash', async (req: express.Request, res: express.Response) => {
        const slice = await SliceRepository.findByHash(req.params.hash);
        if (!slice) return res.status(404).send({ error: "Slice not found" });
        return res.send(slice.slice);
    });

    metadataDocument.addPath({
        path: "/api/v2/slices/transactions/{hash}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Get slice by hash',
        security: false,
        parameters: [
            { name: 'hash', in: 'path', pattern: /^[a-f0-9]{64}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'array',
                items: {
                    $ref: SCHEMA_TYPES.TransactionDTO
                }
            }
        }]
    })
    router.get('/slices/transactions/:hash', async (req: express.Request, res: express.Response) => {
        const bslice = await SliceRepository.findByHash(req.params.hash);
        if (!bslice) return res.status(404).send({ error: "Slice not found" });
        const btxs = await apiContext.transactionsProvider.getTransactions(bslice.slice.transactions);
        const txs: Tx[] = [];
        for (let i = 0; i < btxs.length; i++) {
            const btx = btxs[i];
            txs.push(new Tx(btx.tx));
        }
        return res.send(txs);
    });

    metadataDocument.addPath({
        path: "/api/v2/slices",
        type: 'post',
        controller: 'SlicesController',
        description: 'Insert new slice',
        security: false,
        body: {
            $ref: SCHEMA_TYPES.SliceDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.SuccessResponse
            }
        }]
    })
    router.post('/slices', async (req: express.Request, res: express.Response) => {
        const slice = new Slice(req.body);
        try {
            if (!apiContext.chains.includes(slice.chain)) {
                return res.status(400).send({ error: `Node does not work with this chain` });
            }
            await apiContext.slicesProvider.saveNewSlice(slice);
            return res.send({ message: 'OK' });
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

    app.use('/api/v2', router);
}