import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { BywiseHelper } from '@bywise/web3';
import SCHEMA_TYPES from '../metadata/metadataSchemas';
import { ApiContext, NewService, UpdateService } from '../types';

export default async function servicesController(app: express.Express, apiContext: ApiContext): Promise<void> {
    const router = express.Router();
    const ServiceRepository = apiContext.applicationContext.database.ServiceRepository;

    metadataDocument.addPath({
        path: "/api/v2/services/{address}",
        type: 'get',
        controller: 'ServicesController',
        description: 'Get services by address',
        security: false,
        parameters: [
            { name: 'address', in: 'path', pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                $ref: SCHEMA_TYPES.TransactionWithStatusDTO
            }
        }]
    })
    router.get('/services/:address', async (req: express.Request, res: express.Response) => {
        const address = req.params.address;
        const services = await ServiceRepository.findByAddress(address);
        return res.send(services.map(s => ({
            address: s.address,
            balance: s.balance,
            name: s.name,
            id: s.id,
        })));
    });

    metadataDocument.addPath({
        path: "/api/v2/services",
        type: 'post',
        controller: 'ServicesController',
        description: 'Register new services',
        security: false,
        body: {
            type: 'object',
            properties: [
                { name: 'key', type: 'string', pattern: /^[a-zA-Z0-9_]+$/, required: true },
                { name: 'address', type: 'string', pattern: /^[a-zA-Z0-9_]+$/, required: true },
                { name: 'name', type: 'string', pattern: /^[a-zA-Z0-9_]+$/, required: true },
                { name: 'code', type: 'string', required: true },
                { name: 'sign', type: 'string', pattern: /^[a-f0-9]+$/, required: true },
            ]
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
            }
        }]
    })
    router.post('/services', async (req: express.Request, res: express.Response) => {
        const service: NewService = req.body;
        try {
            let bytes = '';
            bytes += Buffer.from(service.key, 'utf-8').toString('hex');
            bytes += Buffer.from(service.address, 'utf-8').toString('hex');
            bytes += Buffer.from(service.name, 'utf-8').toString('hex');
            bytes += Buffer.from(service.code, 'utf-8').toString('hex');
            const hash = BywiseHelper.makeHash(bytes);
            if (!BywiseHelper.isValidSign(service.sign, service.address, hash)) throw new Error('invalid sign');

            return res.send(service);
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

    metadataDocument.addPath({
        path: "/api/v2/services",
        type: 'patch',
        controller: 'ServicesController',
        description: 'Register new services',
        security: false,
        body: {
            type: 'object',
            properties: [
                { name: 'id', type: 'string', pattern: /^[a-zA-Z0-9_]+$/, required: true },
                { name: 'address', type: 'string', pattern: /^[a-zA-Z0-9_]+$/, required: true },
                { name: 'code', type: 'string', required: true },
                { name: 'sign', type: 'string', pattern: /^[a-f0-9]+$/, required: true },
            ]
        },
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
            }
        }]
    })
    router.patch('/services', async (req: express.Request, res: express.Response) => {
        const service: UpdateService = req.body;
        try {
            let bytes = '';
            bytes += Buffer.from(service.id, 'utf-8').toString('hex');
            bytes += Buffer.from(service.address, 'utf-8').toString('hex');
            if (service.code) {
                bytes += Buffer.from(service.code, 'utf-8').toString('hex');
            }
            bytes += Buffer.from(service.operation, 'utf-8').toString('hex');
            const hash = BywiseHelper.makeHash(bytes);
            if (!BywiseHelper.isValidSign(service.sign, service.address, hash)) throw new Error('invalid sign');

            return res.send(service);
        } catch (err: any) {
            return res.status(400).send({ error: err.message });
        }
    });

    app.use('/api/v2', router);
}