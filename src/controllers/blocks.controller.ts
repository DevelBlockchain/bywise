import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Block, Slice } from '@bywise/web3';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiContext, BlockchainStatus } from '../types';

export default async function blocksController(app: express.Express, apiContext: ApiContext): Promise<void> {
    const router = express.Router();
    const BlockRepository = apiContext.applicationContext.database.BlockRepository;

    metadataDocument.addPath({
        path: "/api/v2/blocks/count/{chain}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Count blocks',
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
    router.get('/blocks/count/:chain', async (req: express.Request, res: express.Response) => {
        let status: BlockchainStatus = BlockchainStatus.TX_MINED;
        if (req.query.status === 'mempool') {
            status = BlockchainStatus.TX_MEMPOOL;
        } else if (req.query.status === 'failed') {
            status = BlockchainStatus.TX_FAILED;
        }
        const count = await BlockRepository.countBlocksByStatus(status, req.params.chain);
        return res.send({ count });
    });

    metadataDocument.addPath({
        path: "/api/v2/blocks/last/{chain}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get blocks list',
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
                    $ref: SCHEMA_TYPES.BlockWithStatusDTO
                }
            }
        }]
    })
    router.get('/blocks/last/:chain', async (req: express.Request, res: express.Response) => {
        let offset = 0;
        let limit = 100;
        let order: 'asc' | 'desc' = req.query.order === 'asc' ? 'asc' : 'desc';
        let status: BlockchainStatus = BlockchainStatus.TX_MINED;
        if (req.query.status === 'mempool') {
            status = BlockchainStatus.TX_MEMPOOL;
        } else if (req.query.status === 'failed') {
            status = BlockchainStatus.TX_FAILED;
        }
        if (typeof req.query.offset === 'string') {
            offset = parseInt(req.query.offset);
        }
        if (typeof req.query.limit === 'string') {
            limit = parseInt(req.query.limit);
        }
        if (limit > 200) return res.status(400).send({ error: "invalid limit" });

        const blocks = await BlockRepository.findBlocksLastsByStatus(status, req.params.chain, limit, offset, order);

        return res.send(blocks.map(block => ({ ...(new Block(block.block)), status: block.status })));
    });

    metadataDocument.addPath({
        path: "/api/v2/blocks/height/{chain}/{height}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get blocks list',
        security: false,
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'height', in: 'path', pattern: /^[0-9]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'array',
                items: {
                    $ref: SCHEMA_TYPES.BlockDTO
                }
            }
        }]
    })
    router.get('/blocks/height/:chain/:height', async (req: express.Request, res: express.Response) => {
        const blocks = await BlockRepository.findByChainAndHeight(req.params.chain, parseInt(req.params.height));
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if(block.status === BlockchainStatus.TX_MINED) {
                return res.send(new Block(block.block));
            }
        }
        return res.status(400).send({ error: "not found" });
    });

    metadataDocument.addPath({
        path: "/api/v2/blocks/hash/{hash}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get block by hash',
        security: false,
        parameters: [
            { name: 'hash', in: 'path', pattern: /^[a-f0-9]{64}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.BlockWithStatusDTO
            }
        }]
    })
    router.get('/blocks/hash/:hash', async (req: express.Request, res: express.Response) => {
        const block = await BlockRepository.findByHash(req.params.hash);
        if (!block) return res.status(404).send({ error: "Block not found" });
        return res.send({ ...new Block(block.block), status: block.status });
    });

    metadataDocument.addPath({
        path: "/api/v2/blocks/slices/{hash}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get slice by block hash',
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
                    $ref: SCHEMA_TYPES.SliceDTO
                }
            }
        }]
    })
    router.get('/blocks/slices/:hash', async (req: express.Request, res: express.Response) => {
        const block = await BlockRepository.findByHash(req.params.hash);
        if (!block) return res.status(404).send({ error: "Block not found" });
        const bslices = await apiContext.slicesProvider.getSlices(block.block.slices);
        const slices: Slice[] = [];
        for (let i = 0; i < bslices.length; i++) {
            const bslice = bslices[i];
            slices.push(new Slice(bslice.slice));
        }
        return res.send(slices);
    });

    metadataDocument.addPath({
        path: "/api/v2/blocks/pack/{chain}/{height}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get mined block with all slices and transactions by height',
        security: false,
        parameters: [
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'height', in: 'path', pattern: /^[0-9]{1,10}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
                properties: [
                    { name: 'block', type: 'object', $ref: SCHEMA_TYPES.BlockDTO },
                    {
                        name: 'slices', type: 'array', items: {
                            $ref: SCHEMA_TYPES.SliceDTO
                        }
                    },
                    {
                        name: 'txs', type: 'array', items: {
                            $ref: SCHEMA_TYPES.TransactionDTO
                        }
                    },
                ]
            }
        }]
    })
    router.get('/blocks/pack/:chain/:height', async (req: express.Request, res: express.Response) => {
        const blockPack = await apiContext.blockProvider.getBlockPack(req.params.chain, parseInt(req.params.height));
        if (blockPack) {
            res.send(blockPack);
        } else {
            return res.status(400).send({ error: `Block Pack not found` });
        }
    });

    metadataDocument.addPath({
        path: "/api/v2/blocks",
        type: 'post',
        controller: 'BlocksController',
        description: 'Insert new block',
        security: false,
        body: {
            $ref: SCHEMA_TYPES.BlockDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.SuccessResponse
            }
        }]
    })
    router.post('/blocks', async (req: express.Request, res: express.Response) => {
        const block = new Block(req.body);
        try {
            if (!apiContext.chains.includes(block.chain)) {
                return res.status(400).send({ error: `Node does not work with this chain` });
            }
            await apiContext.blockProvider.saveNewBlock(block);
            return res.send({ message: 'OK' });
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

    app.use('/api/v2', router);
}