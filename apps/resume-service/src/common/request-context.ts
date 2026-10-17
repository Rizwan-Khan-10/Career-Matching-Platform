import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const storage = new AsyncLocalStorage<{ requestId: string }>();

/** requestId of the HTTP request being handled (undefined outside a request, e.g. in the cleanup job). */
export function getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
}

/** Id for an event published because of the current request; a fresh uuid when there is no request (contract 3.1). */
export function newRequestId(): string {
    return getRequestId() ?? randomUUID();
}

/** Takes `x-request-id` from the caller (nginx / another service) or creates one, and echoes it in the response. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
    const incoming = req.headers['x-request-id'];
    const header = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId = header && /^[A-Za-z0-9._-]{1,100}$/.test(header) ? header : randomUUID();
    res.setHeader('x-request-id', requestId);
    storage.run({ requestId }, next);
}