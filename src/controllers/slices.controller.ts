import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Slice } from '@bywise/web3';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { BlockchainStatus, RequestProcess } from '../types';
import { Slices } from '../models';
import { RequestKeys } from '../datasource/message-queue';
import { ApiService } from '../services';

export default async function slicesController(app: express.Express, apiProvider: ApiService): Promise<void> {
    const router = express.Router();
    const SliceRepository = apiProvider.applicationContext.database.SliceRepository;
    
    let reqProcess: RequestProcess = async (req, context) => {
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
        
        let count = await SliceRepository.count(chain, status);
        if (status === BlockchainStatus.TX_MINED) {
            const confimedSlices: Slices[] = await apiProvider.applicationContext.mq.request(RequestKeys.get_confirmed_slices, { chain: chain });
            count += confimedSlices.length;
        }
        return {
            id: req.id,
            body: { count },
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/slices/count/{chain}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Count slices',
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
        reqProcess: reqProcess,
    })
    router.get('/slices/count/:chain', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    reqProcess = async (req, context) => {
        let offset = 0;
        let limit = 100;
        let status: BlockchainStatus = BlockchainStatus.TX_MINED;
        let order: 'asc' | 'desc' = req.query.order === 'asc' ? 'asc' : 'desc';
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
        const slices: Slice[] = [];
        if (status === BlockchainStatus.TX_MINED) {
            const confimedSlices: Slices[] = await apiProvider.applicationContext.mq.request(RequestKeys.get_confirmed_slices, { chain: chain });
            confimedSlices.forEach(sliceInfo => slices.push(sliceInfo.slice));
        }
        const findSlices = await SliceRepository.find(req.params.chain, status, limit, offset, order);
        findSlices.forEach(sliceInfo => slices.push(sliceInfo.slice));
        return {
            id: req.id,
            body: slices,
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/slices/last/{chain}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Get slices list',
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
                    $ref: SCHEMA_TYPES.SliceDTO
                }
            }
        }],
        reqProcess: reqProcess,
    })
    router.get('/slices/last/:chain', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    reqProcess = async (req, context) => {
        const sliceInfo = await SliceRepository.findByHash(req.params.hash);
        if (!sliceInfo) {
            return {
                id: req.id,
                body: { error: "Slice not found" },
                status: 404
            }
        }
        return {
            id: req.id,
            body: sliceInfo.slice,
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/slices/hash/{hash}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Get slice by hash',
        securityType: ['node'],
        parameters: [
            { name: 'hash', in: 'path', required: true, pattern: /^[a-f0-9]{64}$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.SliceDTO
            }
        }],
        reqProcess: reqProcess,
    })
    router.get('/slices/hash/:hash', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    reqProcess = async (req, context) => {
        const sliceInfo = await SliceRepository.findByHash(req.params.hash);
        if (!sliceInfo) {
            return {
                id: req.id,
                body: { error: "Slice not found" },
                status: 404
            }
        }
        const txs = await apiProvider.transactionsProvider.getTransactions(sliceInfo.slice.transactions);
        return {
            id: req.id,
            body: txs,
            status: 200
        }
    };
    metadataDocument.addPath({
        path: "/api/v2/slices/transactions/{hash}",
        type: 'get',
        controller: 'SlicesController',
        description: 'Get slice by hash',
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
                    $ref: SCHEMA_TYPES.TransactionDTO
                }
            }
        }],
        reqProcess: reqProcess,
    })
    router.get('/slices/transactions/:hash', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    reqProcess = async (req, context) => {
        const slice = new Slice(req.body);
        try {
            if (!apiProvider.chains.includes(slice.chain)) {
                return {
                    id: req.id,
                    body: { error: "Node does not work with this chain" },
                    status: 400
                }
            }
            await apiProvider.slicesProvider.saveNewSlice(slice);
            return {
                id: req.id,
                body: {
                    message: 'OK'
                },
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
        path: "/api/v2/slices",
        type: 'post',
        controller: 'SlicesController',
        description: 'Insert new slice',
        securityType: ['node'],
        body: {
            $ref: SCHEMA_TYPES.SliceDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.SuccessResponse
            }
        }],
        reqProcess: reqProcess,
    })
    router.post('/slices', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    app.use('/api/v2', router);
}