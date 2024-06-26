import express from 'express';
import { RequestKeys } from '../datasource/message-queue';
import metadataDocument from '../metadata/metadataDocument';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiContext } from '../types';

export default async function walletsController(app: express.Express, apiContext: ApiContext): Promise<void> {
    const router = express.Router();

    metadataDocument.addPath({
        path: "/api/v2/wallets/{address}/{chain}",
        type: 'get',
        controller: 'WalletsController',
        description: 'Get address info by chain',
        securityType: ['node'],
        parameters: [
            { name: 'address', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'chain', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionDTO
            }
        }]
    })
    router.get('/wallets/:address/:chain', async (req: express.Request, res: express.Response) => {
        const chain = req.params.chain;
        if (!apiContext.chains.includes(chain)) return res.status(400).send({ error: "Node does not work with this chain" });
        
        const info = await apiContext.applicationContext.mq.request(RequestKeys.get_info_wallet, {chain: req.params.chain, address: req.params.address});

        return res.send(info);
    });

    app.use('/api/v2', router);
}