import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { Web3, BywiseNode } from '@bywise/web3';
import { NodesProvider } from '../services';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiContext } from '../types';
import { RoutingKeys } from '../datasource/message-queue';

export default async function nodesController(app: express.Express, apiContext: ApiContext): Promise<void> {
    const router = express.Router();
    
    const nodeProvider = new NodesProvider(apiContext.applicationContext, apiContext.chainsProvider);

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
        }]
    })
    router.get('/info', async (req: express.Request, res: express.Response) => {
        return res.send(await nodeProvider.getInfoNode(apiContext.knowNodes));
    });

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
        }]
    })
    router.get('/try-token', async (req: express.Request, res: express.Response) => {
        return res.send(await nodeProvider.getInfoNode(apiContext.knowNodes));
    });

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
        }]
    })
    router.post('/handshake', async (req: express.Request, res: express.Response) => {
        const node = new BywiseNode(req.body);
        if (node.token) {
            let remoteInfo = await Web3.tryToken(node);
            if (remoteInfo.error) {
                return res.status(400).send({ error: `could not connect to node - ${remoteInfo.error}` });
            }
            apiContext.applicationContext.mq.send(RoutingKeys.new_node, node);
        }
        return res.send(await nodeProvider.createMyNode());
    });

    app.use('/api/v2/nodes', router);
}