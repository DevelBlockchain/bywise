import express from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { RequestProcess } from '../types';
import helper from '../utils/helper';
import fs from 'fs';
import { ApiService } from '../services';

const pidusage = require('pidusage');
const v8 = require('v8');

export default async function authController(app: express.Express, apiProvider: ApiService): Promise<void> {

    const router = express.Router();

    const reqProcessMe: RequestProcess = async (req, context) => {
        return {
            id: req.id,
            body: {
                message: 'OK',
                ...context,
                time: helper.getNow()
            },
            status: 200
        }
    }
    metadataDocument.addPath({
        path: "/api/v2/auth/me",
        type: 'get',
        controller: 'AuthController',
        description: 'Create new account',
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
                properties: [

                    { name: 'message', type: 'string', example: 'OK' },
                    { name: 'type', type: 'string', enum: ['user', 'node', 'token'], example: 'user' },
                    { name: 'id', type: 'string', example: '632c6484947ba8178426866e' },
                    { name: 'iat', type: 'string', example: '1719159113' },
                    { name: 'exp', type: 'string', example: '1719159113' },
                    { name: 'time', type: 'string', example: '1719159113' }
                ]
            },
        }],
        reqProcess: reqProcessMe,
    })
    router.get('/me', async (req: any, res: express.Response) => {
        const response = await reqProcessMe(req, req.context);
        return res.status(response.status).send(response.body);
    });

    const reqProcessStatistics: RequestProcess = async (req, context) => {
        let token = `${req.query.token}`;
        if (token !== process.env.TOKEN) {
            return {
                id: req.id,
                body: { error: `Forbidden` },
                status: 400
            }
        }
        let done = false;

        const defaultResponse = {
            size: 0,
            cpu: 0,
            memory: 0,
            total_heap_size: 0,
            used_heap_size: 0,
            heap_size_limit: 0,
            timestamp: Date.now(),
        };

        const readDir = (path: string): number => {
            const dir = fs.readdirSync(path);
            let size = 0;
            for (let i = 0; i < dir.length; i++) {
                const file = dir[i];
                const fileLocation = `${path}/${file}`;

                const stat = fs.statSync(fileLocation);
                if (stat.isDirectory()) {
                    size += readDir(fileLocation)
                } else {
                    size += stat.size;
                }
            }
            return size;
        }

        pidusage(process.pid, (err: any, stat: any) => {
            if (err) {
                apiProvider.applicationContext.logger.error(err.message);
                return;
            }
            const heap = v8.getHeapStatistics();

            defaultResponse.cpu = stat.cpu;
            defaultResponse.memory = stat.memory / 1024 / 1024;
            defaultResponse.total_heap_size = heap.total_heap_size / 1024 / 1024;
            defaultResponse.used_heap_size = heap.used_heap_size / 1024 / 1024;
            defaultResponse.heap_size_limit = heap.heap_size_limit / 1024 / 1024;
            defaultResponse.timestamp = Date.now();

            done = true;
        });
        defaultResponse.size = readDir('./data')
        while (!done) {
            await helper.sleep(100);
        }
        return {
            id: req.id,
            body: defaultResponse,
            status: 200
        }
    }
    metadataDocument.addPath({
        path: "/api/v2/auth/statistics",
        type: 'get',
        security: false,
        controller: 'AuthController',
        description: 'Create new account',
        parameters: [
            { name: 'token', in: 'query', pattern: /^[a-zA-Z0-9_]+$/ },
        ],
        responses: [{
            code: 200,
            description: 'Success',
            body: {
                type: 'object',
                properties: [
                    { name: 'size', type: 'number', example: '22072' },
                    { name: 'cpu', type: 'number', example: '34.18918918918919' },
                    { name: 'memory', type: 'number', example: '247.33203125' },
                    { name: 'total_heap_size', type: 'number', example: '184.8828125' },
                    { name: 'used_heap_size', type: 'number', example: '179.84854125976562' },
                    { name: 'heap_size_limit', type: 'number', example: '179.84854125976562' },
                    { name: 'timestamp', type: 'number', example: '1719160195723' },
                ]
            },
        }],
        reqProcess: reqProcessStatistics
    })
    router.get('/statistics', async (req: any, res: express.Response) => {
        const response = await reqProcessStatistics(req, req.context);
        return res.status(response.status).send(response.body);
    });

    app.use('/api/v2/auth', router);
}