import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Block } from '@bywise/web3';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { BlockchainStatus, RequestProcess } from '../types';
import { ApiService } from '../services';

export default async function blocksController(app: express.Express, apiProvider: ApiService): Promise<void> {
    const router = express.Router();
    const BlockRepository = apiProvider.applicationContext.database.BlockRepository;

    const reqProcessCount: RequestProcess = async (req, context) => {
        let status: BlockchainStatus = BlockchainStatus.TX_MINED;
        if (req.query.status === 'mempool') {
            status = BlockchainStatus.TX_MEMPOOL;
        } else if (req.query.status === 'failed') {
            status = BlockchainStatus.TX_FAILED;
        }
        const chain = req.params.chain;
        if (!apiProvider.chains.includes(chain)) {
            return {
                id: req.id,
                body: { error: "Node does not work with this chain" },
                status: 400
            }
        }
        const count = await BlockRepository.countBlocksByStatus(chain, status);
        return {
            id: req.id,
            body: { count },
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/blocks/count/{chain}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Count blocks',
        securityType: ['node'],
        parameters: [
            { name: 'chain', in: 'path', required: true, pattern: /^[a-zA-Z0-9_]+$/ },
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
        }],
        reqProcess: reqProcessCount,
    })
    router.get('/blocks/count/:chain', async (req: any, res: express.Response) => {
        const response = await reqProcessCount(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessLast: RequestProcess = async (req, context) => {
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
        if (limit > 200) {
            return {
                id: req.id,
                body: { error: "invalid limit" },
                status: 400
            }
        }

        const chain = req.params.chain;
        if (!apiProvider.chains.includes(chain)) {
            return {
                id: req.id,
                body: { error: "Node does not work with this chain" },
                status: 400
            }
        }
        const blocks = await BlockRepository.findBlocksLastsByStatus(chain, status, limit, offset, order);
        return {
            id: req.id,
            body: blocks.map(block => ({ ...block.block, status: block.status })),
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/blocks/last/{chain}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get blocks list',
        securityType: ['node'],
        parameters: [
            { name: 'chain', in: 'path', required: true, pattern: /^[a-zA-Z0-9_]+$/ },
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
        }],
        reqProcess: reqProcessLast,
    })
    router.get('/blocks/last/:chain', async (req: any, res: express.Response) => {
        const response = await reqProcessLast(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessHeight: RequestProcess = async (req, context) => {
        const chain = req.params.chain;
        if (!apiProvider.chains.includes(chain)) {
            return {
                id: req.id,
                body: { error: "Node does not work with this chain" },
                status: 400
            }
        }

        const blocks = await BlockRepository.findByChainAndHeight(chain, parseInt(req.params.height));
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if (block.status === BlockchainStatus.TX_MINED) {
                return {
                    id: req.id,
                    body: block.block,
                    status: 200
                }
            }
        }
        return {
            id: req.id,
            body: { error: "not found" },
            status: 400
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/blocks/height/{chain}/{height}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get blocks list',
        securityType: ['node'],
        parameters: [
            { name: 'chain', in: 'path', required: true, pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'height', in: 'path', required: true, pattern: /^[0-9]+$/ },
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
        }],
        reqProcess: reqProcessHeight,
    })
    router.get('/blocks/height/:chain/:height', async (req: any, res: express.Response) => {
        const response = await reqProcessHeight(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessHash: RequestProcess = async (req, context) => {
        const block = await BlockRepository.findByHash(req.params.hash);
        if (!block) {
            return {
                id: req.id,
                body: { error: "Block not found" },
                status: 400
            }
        }
        return {
            id: req.id,
            body: { ...block.block, status: block.status },
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/blocks/hash/{hash}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get block by hash',
        securityType: ['node'],
        parameters: [
            { name: 'hash', in: 'path', required: true, pattern: /^[a-f0-9]{64}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.BlockWithStatusDTO
            }
        }],
        reqProcess: reqProcessHash,
    })
    router.get('/blocks/hash/:hash', async (req: any, res: express.Response) => {
        const response = await reqProcessHash(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessSlices: RequestProcess = async (req, context) => {
        const block = await BlockRepository.findByHash(req.params.hash);
        if (!block) {
            return {
                id: req.id,
                body: { error: "Block not found" },
                status: 400
            }
        }
        const slices = await apiProvider.slicesProvider.getSlices(block.block.slices);
        return {
            id: req.id,
            body: slices,
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/blocks/slices/{hash}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get slice by block hash',
        securityType: ['node'],
        parameters: [
            { name: 'hash', in: 'path', required: true, pattern: /^[a-f0-9]{64}$/ },
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
        }],
        reqProcess: reqProcessSlices,
    })
    router.get('/blocks/slices/:hash', async (req: any, res: express.Response) => {
        const response = await reqProcessSlices(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessPack: RequestProcess = async (req, context) => {
        const chain = req.params.chain;
        if (!apiProvider.chains.includes(chain)) {
            return {
                id: req.id,
                body: { error: "Node does not work with this chain" },
                status: 400
            }
        }
        const blockPack = await apiProvider.blockProvider.getBlockPack(chain, parseInt(req.params.height));
        if (blockPack) {
            return {
                id: req.id,
                body: blockPack,
                status: 200
            }
        } else {
            return {
                id: req.id,
                body: { error: "Block Pack not found" },
                status: 400
            }
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/blocks/pack/{chain}/{height}",
        type: 'get',
        controller: 'BlocksController',
        description: 'Get mined block with all slices and transactions by height',
        securityType: ['node'],
        parameters: [
            { name: 'chain', in: 'path', required: true, pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'height', in: 'path', required: true, pattern: /^[0-9]{1,10}$/ },
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
        }],
        reqProcess: reqProcessPack,
    })
    router.get('/blocks/pack/:chain/:height', async (req: any, res: express.Response) => {
        const response = await reqProcessPack(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessBlock: RequestProcess = async (req, context) => {
        const block = new Block(req.body);
        try {
            if (!apiProvider.chains.includes(block.chain)) {
                return {
                    id: req.id,
                    body: { error: "Node does not work with this chain" },
                    status: 400
                }
            }
            await apiProvider.blockProvider.saveNewBlock(block);
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
        path: "/api/v2/blocks",
        type: 'post',
        controller: 'BlocksController',
        description: 'Insert new block',
        securityType: ['node'],
        body: {
            $ref: SCHEMA_TYPES.BlockDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.SuccessResponse
            }
        }],
        reqProcess: reqProcessBlock,
    })
    router.post('/blocks', async (req: any, res: express.Response) => {
        const response = await reqProcessBlock(req, req.context);
        return res.status(response.status).send(response.body);
    });

    app.use('/api/v2', router);
}