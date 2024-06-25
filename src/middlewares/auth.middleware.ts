import { Express, Request, Response, NextFunction } from 'express';
import AuthProvider from '../services/auth.service';
import { ApplicationContext } from '../types/task.type';

export default function authMiddleware(app: Express, applicationContext: ApplicationContext): void {
    const authProvider = new AuthProvider(applicationContext);

    async function validateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
        if (!req.metadataPathType) {
            applicationContext.logger.error('findPath not found '+ req.path)
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

        const decode = await authProvider.checkJWT(token);
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