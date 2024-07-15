import { Express, Request, Response, NextFunction } from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { TokenInfo, MetadataPathType } from '../types';
import { WSNode, WSRequest } from '../types/network.type';
import { ApiService } from '../services';

declare global {
    namespace Express {
        interface Request {
            context: TokenInfo,
            metadataPathType: MetadataPathType,
        }
    }
}

function validateInputs(apiProvider: ApiService, req: Request, res: Response, next: NextFunction): void {
    const pathMeta = metadataDocument.findPath(req.path, req.method.toLowerCase());
    if (pathMeta) {
        req.metadataPathType = pathMeta;
        try {
            req.params = {}
            const pathExpected = pathMeta.path.split("/");
            const pathReceived = req.path.split("/");
            for (let i = 0; i < pathExpected.length; i++) {
                const param = pathExpected[i];
                const value = pathReceived[i];
                
                if(param.startsWith("{")) {
                    req.params[param.replace("{", "").replace("}", "")] = value;
                }
            }
            metadataDocument.validateInput(pathMeta, req as any);
        } catch (err: any) {
            res.status(422).send({
                error: `Invalid input parameters`,
                details: err.message
            });
            return;
        }
    } else {
        apiProvider.applicationContext.logger.error('findPath not found '+ req.path)
        res.status(404).send({
            error: `path not found "${req.method}:${req.path}"`
        });
        return;
    }
    next();
}

const apiValidate = (app: Express, apiProvider: ApiService): void => {
    app.use((req: Request, res: Response, next: NextFunction) => {
        validateInputs(apiProvider, req, res, next);
    });
}

const wsValidate = (apiProvider: ApiService, node: WSNode, req: WSRequest): MetadataPathType | null => {
    const pathMeta = metadataDocument.findPath(req.path.toLowerCase(), req.method.toLowerCase());
    if (pathMeta) {
        try {
            req.params = {}
            const pathExpected = pathMeta.path.split("/");
            const pathReceived = req.path.split("/");
            for (let i = 0; i < pathExpected.length; i++) {
                const param = pathExpected[i];
                const value = pathReceived[i];
                
                if(param.startsWith("{")) {
                    req.params[param.replace("{", "").replace("}", "")] = value;
                }
            }
            metadataDocument.validateInput(pathMeta, req as any);
            return pathMeta;
        } catch (err: any) {
            apiProvider.sendToNode(node, {
                id: req.id,
                status: 422,
                body: {
                    error: `Invalid input parameters`,
                    details: err.message
                }
            });
        }
    } else {
        apiProvider.applicationContext.logger.error('findPath not found '+ req.path)
        apiProvider.sendToNode(node, {
            id: req.id,
            status: 404,
            body: {
                error: `path not found "${req.method}:${req.path}"`
            }
        });
    }
    return null;
}

const metadataMiddleware = {
    apiValidate,
    wsValidate,
}

export default metadataMiddleware;