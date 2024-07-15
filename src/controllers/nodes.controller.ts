import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Web3, BywiseNode } from '@bywise/web3';
import { ApiService, NodesProvider } from '../services';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { RequestKeys, RoutingKeys } from '../datasource/message-queue';
import { RequestProcess } from '../types';

export default async function nodesController(app: express.Express, apiProvider: ApiService): Promise<void> {
    const router = express.Router();

    const nodeProvider = new NodesProvider(apiProvider.applicationContext);

    let reqProcess: RequestProcess = async (req, context) => {
        const connectedNodes = await apiProvider.applicationContext.mq.request(RequestKeys.get_connected_nodes);
        return {
            id: req.id,
            body: await nodeProvider.getInfoNode(connectedNodes),
            status: 200
        }
    }
    metadataDocument.addPath({
        path: "/api/v2/nodes/info",
        type: 'get',
        controller: 'NodesController',
        description: 'Get node info',
        security: false,
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.NodeInfoDTO
            }
        }],
        reqProcess: reqProcess
    })
    router.get('/info', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    reqProcess = async (req, context) => {
        const connectedNodes = await apiProvider.applicationContext.mq.request(RequestKeys.get_connected_nodes);
        return {
            id: req.id,
            body: await nodeProvider.getInfoNode(connectedNodes),
            status: 200
        }
    }
    metadataDocument.addPath({
        path: "/api/v2/nodes/try-token",
        type: 'get',
        controller: 'NodesController',
        description: 'Test node token',
        securityType: ['node'],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.NodeInfoDTO
            }
        }],
        reqProcess: reqProcess
    })
    router.get('/try-token', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    reqProcess = async (req, context) => {
        const node = new BywiseNode(req.body);
        if (node.token) {
            let remoteInfo = await Web3.tryToken(node);
            if (remoteInfo.error) {
                return {
                    id: req.id,
                    body: { error: `could not connect to node - ${remoteInfo.error}` },
                    status: 400
                };
            }
            apiProvider.applicationContext.mq.send(RoutingKeys.new_node, node);
        }
        return {
            id: req.id,
            body: await nodeProvider.createMyNode(),
            status: 200
        };
    }
    metadataDocument.addPath({
        path: "/api/v2/nodes/handshake",
        type: 'post',
        controller: 'NodesController',
        description: 'Configure connection',
        security: false,
        body: {
            $ref: SCHEMA_TYPES.NodeDTO
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.NodeDTO
            }
        }],
        reqProcess: reqProcess
    })
    router.post('/handshake', async (req: any, res: express.Response) => {
        const response = await reqProcess(req, req.context);
        return res.status(response.status).send(response.body);
    });

    app.use('/api/v2/nodes', router);
}