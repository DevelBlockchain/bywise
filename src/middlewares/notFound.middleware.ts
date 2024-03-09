import { Express, Request, Response, NextFunction } from 'express';

function validateToken(req: Request, res: Response, next: NextFunction): void {
    res.status(404).send({ error: "Not Found" });
    return;
}

export default function notFoundMiddleware(app: Express): void {
    app.use(validateToken);
}