import { Express, Request, Response, NextFunction } from 'express';
import { ApiService } from '../services';
import { MetadataPathType, TokenInfo, WSNode, WSRequest } from '../types';

function useAuthMiddleware(app: Express, apiProvider: ApiService): void {

    async function validateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
        if (!req.metadataPathType) {
            res.status(404).send({ error: "Not found" });
            return;
        }
        if (req.metadataPathType.security === false) {
            next();
            return;
        }
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).send({ error: "No token provided" });
            return;
        }
        const parts = authHeader.split(' ');
        if (parts.length !== 2) {
            res.status(401).send({ error: "Token error" });
            return;
        }
        const [scheme, token] = parts;
        if (scheme !== 'Bearer' && scheme !== 'Node') {
            res.status(401).send({ error: "Token malformatted" });
            return;
        }

        const decode = await apiProvider.authProvider.checkJWT(token);
        if (!decode) {
            res.status(401).send({ error: "Token expired" });
            return;
        }
        req.context = decode;
        if (req.metadataPathType.securityType && !req.metadataPathType.securityType.includes(req.context.type)) {
            res.status(403).send({ error: `Forbidden - Cannot access this endpoint by a ${req.context.type}` });
            return;
        } else {
            next();
            return;
        }
    }

    app.use(validateToken);
}

async function wsAuthMiddleware(apiProvider: ApiService, node: WSNode, req: WSRequest, metadataPath: MetadataPathType): Promise<TokenInfo | null> {
    if (metadataPath.security === false) {
        return {
            type: 'user',
            id: node.ip,
        };
    }
    const token = req.token;
    if (!token) {
        apiProvider.sendToNode(node, {
            id: req.id,
            status: 401,
            body: { error: `No token provided` }
        });
        return null;
    }
    const decode = await apiProvider.authProvider.checkJWT(token);
    if (!decode) {
        apiProvider.sendToNode(node, {
            id: req.id,
            status: 401,
            body: { error: `Token expired` }
        });
        return null;
    }
    return decode;
}

const authMiddleware = {
    useAuthMiddleware,
    wsAuthMiddleware,
}

export default authMiddleware;