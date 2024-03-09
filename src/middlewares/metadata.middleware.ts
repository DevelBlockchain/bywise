import { Express, Request, Response, NextFunction } from 'express';
import metadataDocument from '../metadata/metadataDocument';
import { TokenInfo, MetadataPathType } from '../types';

declare global {
    namespace Express {
        interface Request {
            context: TokenInfo,
            metadataPathType: MetadataPathType,
        }
    }
}

function validateInputs(req: Request, res: Response, next: NextFunction): void {
    const pathMeta = metadataDocument.findPath(req.path, req.method.toLowerCase());
    if (pathMeta) {
        req.metadataPathType = pathMeta;
        try {
            metadataDocument.validateInput(pathMeta, req);
        } catch (err: any) {
            res.status(422).send({
                error: `Invalid input parameters`,
                details: err.message
            });
            return;
        }
    }
    next();
}

export default function metadataMiddleware(app: Express): void {
    app.use(validateInputs);
}