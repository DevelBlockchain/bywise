import express from 'express';
import { RequestKeys } from '../datasource/message-queue';
import metadataDocument from '../metadata/metadataDocument';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiService } from '../services';
import { RequestProcess } from '../types';

export default async function walletsController(app: express.Express, apiProvider: ApiService): Promise<void> {
    const router = express.Router();

    const reqProcessWallets: RequestProcess = async (req) => {
        const chain = req.params.chain;
        if (!apiProvider.chains.includes(chain)) return {
            id: req.id,
            body: { error: `Node does not work with this chain - "${chain}"` },
            status: 400
        };

        const info = await apiProvider.applicationContext.mq.request(RequestKeys.get_info_wallet, { chain: req.params.chain, address: req.params.address });

        return {
            id: req.id,
            body: info,
            status: 200
        }
    }
    metadataDocument.addPath({
        path: "/api/v2/wallets/{address}/{chain}",
        type: 'get',
        controller: 'WalletsController',
        description: 'Get address info by chain',
        securityType: ['node'],
        parameters: [
            { name: 'address', in: 'path', required: true, pattern: /^[a-zA-Z0-9_]+$/ },
            { name: 'chain', in: 'path', required: true, pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionDTO
            }
        }],
        reqProcess: reqProcessWallets
    });
    router.get('/wallets/:address/:chain', async (req: any, res: express.Response) => {
        const response = await reqProcessWallets(req, req.context);
        return res.status(response.status).send(response.body);
    });

    app.use('/api/v2', router);
}