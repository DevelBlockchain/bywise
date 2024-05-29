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
import { ApplicationContext, Task } from '../types/task.type';
import errorMiddleware from '../middlewares/error.middleware';
import { ApiContext } from '../types/api.type';
import walletsController from '../controllers/wallets.controller';
import { RoutingKeys } from '../datasource/message-queue';

class Api implements Task {

    public isRun = false;
    private app;
    private apiCtx: ApiContext;
    public server: any;
    private applicationContext: ApplicationContext;

    constructor(applicationContext: ApplicationContext) {
        this.applicationContext = applicationContext;
        this.apiCtx = new ApiContext(applicationContext);
        this.app = express();
    }

    private async addChain(chain: string) {
        const blockTree = await this.apiCtx.blockProvider.getMainBlockTree(chain);
        this.apiCtx.blockTree.set(chain, blockTree);
        if (!this.apiCtx.chains.includes(chain)) {
            this.apiCtx.chains.push(chain)
        }
    }

    async start() {
        this.isRun = false;

        this.applicationContext.mq.addMessageListener(RoutingKeys.know_nodes, async (message: any) => {
            this.apiCtx.knowNodes = message;
        });
        this.applicationContext.mq.addMessageListener(RoutingKeys.selected_new_block, async (message: any) => {
            await this.addChain(message);
        });

        const initialChains = await this.apiCtx.chainsProvider.getChains(true);
        for (let i = 0; i < initialChains.length; i++) {
            const chain = initialChains[i];
            await this.addChain(chain);
        }
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

        metadataMiddleware(this.app);
        authMiddleware(this.app, this.applicationContext);

        await authController(this.app, this.applicationContext);
        await blocksController(this.app, this.apiCtx);
        await nodesController(this.app, this.apiCtx);
        await slicesController(this.app, this.apiCtx);
        await transactionsController(this.app, this.apiCtx);
        await contractsController(this.app, this.apiCtx);
        await walletsController(this.app, this.apiCtx);

        errorMiddleware(this.app, this.applicationContext);
        notFoundMiddleware(this.app);

        swaggerJson = metadataDocument.generateSwaggerJson();

        if (!this.applicationContext.https) {
            this.server = this.app.listen(this.applicationContext.port, () => {
                this.applicationContext.logger.verbose('Start server on port ' + this.applicationContext.port);
                this.isRun = true;
            });
        } else {
            this.server = https.createServer({
                key: this.applicationContext.https.key,
                cert: this.applicationContext.https.cert,
                secureProtocol: 'TLSv1_2_method',
            }, this.app);
            this.server.listen(this.applicationContext.port, () => {
                this.applicationContext.logger.verbose('Start server on port ' + this.applicationContext.port);
                this.isRun = true;
            });
        }
        while (!this.isRun) {
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