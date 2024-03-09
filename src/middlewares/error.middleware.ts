import express from 'express';
import type { ErrorRequestHandler } from "express";
import { ApplicationContext } from '../types';

export default function errorMiddleware(app: express.Express, applicationContext: ApplicationContext): void {

    const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
        console.error(error.stack);
        applicationContext.logger.error(error.message);
        res.status(500).send({ error: "Something broke!" });
        return;
    };

    app.use(errorHandler as ErrorRequestHandler);
}
  