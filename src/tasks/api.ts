require("express-async-errors");
import helper from '../utils/helper';
import path from 'path';
import express from 'express';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import expressWinston from 'express-winston';
import bodyParser from 'body-parser';
import cors from 'cors';
import https from 'https';
import ws from 'ws';
import authController from '../controllers/auth.controller';
import nodesController from '../controllers/nodes.controller';
import authMiddleware from '../middlewares/auth.middleware';
import notFoundMiddleware from '../middlewares/notFound.middleware';
import metadataDocument from '../metadata/metadataDocument';
import metadataMiddleware from '../middlewares/metadata.middleware';
import transactionsController from '../controllers/transactions.controller';
import contractsController from '../controllers/contracts.controller';
import slicesController from '../controllers/slices.controller';
import blocksController from '../controllers/blocks.controller';
import { ApplicationContext, Task } from '../types';
import errorMiddleware from '../middlewares/error.middleware';
import walletsController from '../controllers/wallets.controller';
import { RoutingKeys } from '../datasource/message-queue';
import { ApiService } from '../services/api.service';
import { BlocksProvider, SlicesProvider, TransactionsProvider } from '../services';
import { WSNode, WSRequest } from '../types/network.type';

class Api implements Task {

    public isRun = false;
    private app;
    private apiCtx;
    public server: any;
    private applicationContext: ApplicationContext;

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        const transactionsProvider = new TransactionsProvider(applicationContext, this);
        const slicesProvider = new SlicesProvider(applicationContext, transactionsProvider);
        const blockProvider = new BlocksProvider(applicationContext, slicesProvider, transactionsProvider);
        this.apiCtx = new ApiService(applicationContext, transactionsProvider, slicesProvider, blockProvider);
        this.app = express();
    }

    async run() {
        return true;
    }

    async start() {
        if (this.isRun) {
            this.applicationContext.logger.error("API already started!");
            return;
        }
        this.isRun = true;

        const wsServer = new ws.Server({ noServer: true });
        wsServer.on('connection', (socket, req) => {
            const ip = req.socket.remoteAddress;
            if (ip) {
                if (this.apiCtx.blockList.has(ip)) {
                    socket.close(401);
                } else {
                    const node: WSNode = new WSNode(socket, ip);
                    this.apiCtx.clients.push(node);

                    socket.on('message', (message) => {
                        const messageStr = message.toString();
                        const req: WSRequest = JSON.parse(messageStr);
                        
                        const metadataPath = metadataMiddleware.wsValidate(this.apiCtx, node, req);
                        if(metadataPath) {
                            authMiddleware.wsAuthMiddleware(this.apiCtx, node, req, metadataPath).then(context => {
                                if(context) {
                                    metadataPath.reqProcess(req, context).then(res => {
                                        if(!req.broadcast) {
                                            this.apiCtx.sendToNode(node, res);
                                        }
                                    });
                                }
                            })
                        }
                    });
                }
            } else {
                socket.close(401);
            }
        });

        this.app.use(bodyParser.urlencoded({ extended: false }));
        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(cors());
        this.app.use(expressWinston.logger({
            transports: [
                new DailyRotateFile({
                    filename: './logs/requests-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '20m',
                    maxFiles: '14d'
                })
            ],
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json(),
            ),
        }));

        var swaggerJson = {};
        this.app.use('/', express.static(path.join(__dirname, '../../public')))

        this.app.get('/openapi.json', function (req, res) {
            res.send(swaggerJson);
        });

        metadataMiddleware.apiValidate(this.app, this.apiCtx);
        authMiddleware.useAuthMiddleware(this.app, this.apiCtx);

        await authController(this.app, this.apiCtx);
        await blocksController(this.app, this.apiCtx);
        await nodesController(this.app, this.apiCtx);
        await slicesController(this.app, this.apiCtx);
        await transactionsController(this.app, this.apiCtx);
        await contractsController(this.app, this.apiCtx);
        await walletsController(this.app, this.apiCtx);

        errorMiddleware(this.app, this.applicationContext);
        notFoundMiddleware(this.app);

        swaggerJson = metadataDocument.generateSwaggerJson();
        let run = false;
        if (!this.applicationContext.ssl) {
            this.server = this.app.listen(this.applicationContext.port, () => {
                this.applicationContext.logger.verbose('Start server on port ' + this.applicationContext.port);
                run = true;
            });
        } else {
            this.server = https.createServer({
                key: this.applicationContext.ssl.key,
                cert: this.applicationContext.ssl.cert,
                secureProtocol: 'TLSv1_2_method',
            }, this.app);
            this.server.listen(this.applicationContext.port, () => {
                this.applicationContext.logger.verbose('Start server on port ' + this.applicationContext.port);
                run = true;
            });
        }
        this.server.on('upgrade', (request: any, socket: any, head: any) => {
            wsServer.handleUpgrade(request, socket, head, socket => {
                wsServer.emit('connection', socket, request);
            });
        });

        while (!run) {
            await helper.sleep(10);
        }
        this.applicationContext.mq.send(RoutingKeys.started_api, '');
    };

    async stop() {
        if (this.isRun) {
            await this.server.close();
            this.applicationContext.logger.verbose('Stop server on port ' + this.applicationContext.port);
        }
        this.isRun = false;
    };
}

export default Api;