import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { newRequestId, runWithRequestId } from './request-context';

const SAFE_ID = /^[A-Za-z0-9._-]{1,100}$/;
const logger = new Logger('http');

/**
 * Takes requestId from the `x-request-id` header (or creates one), returns it in the response header, keeps it
 * available to logs and published events for the whole request, and writes one access line when the response ends.
 * /health is not logged (probes would drown everything else).
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : newRequestId();
    res.setHeader('x-request-id', requestId);

    const started = Date.now();
    res.on('finish', () => {
        const path = (req.originalUrl || req.url || '').split('?')[0];
        if (path === '/health') return;
        runWithRequestId(requestId, () => logger.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`));
    });

    runWithRequestId(requestId, next);
}
