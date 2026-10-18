import { currentRequestId, newRequestId } from './request-context';

/** Contract section 3, rule 2: every XADD is trimmed with MAXLEN ~ 10000. */
export const STREAM_MAXLEN = 10000;

export interface OutgoingEvent {
    stream: string;
    payload: Record<string, unknown>;
}

const requestIdOf = (payload?: Record<string, unknown>): string =>
    (typeof payload?.requestId === 'string' && payload.requestId) || currentRequestId() || newRequestId();

/**
 * Publishes one event in the shared envelope: one field `data` holding JSON (contract section 3, rule 1).
 * `requestId` is copied from the HTTP request being handled, or created when there is none.
 */
export function publishEvent(redis: { client: any }, stream: string, payload: Record<string, unknown>) {
    return redis.client.xadd(stream, 'MAXLEN', '~', STREAM_MAXLEN, '*', 'data', JSON.stringify({ ...payload, requestId: requestIdOf(payload) }));
}

/**
 * Publishes several events as ONE Redis transaction (MULTI/EXEC): either all of them are written or none, so a failure can
 * be rolled back cleanly. Throws when Redis could not run the transaction or any command in it failed.
 */
export async function publishEvents(redis: { client: any }, events: OutgoingEvent[]): Promise<void> {
    const pipeline = redis.client.multi();
    for (const { stream, payload } of events) {
        pipeline.xadd(stream, 'MAXLEN', '~', STREAM_MAXLEN, '*', 'data', JSON.stringify({ ...payload, requestId: requestIdOf(payload) }));
    }
    const results: [Error | null, unknown][] | null = await pipeline.exec();
    if (!results) throw new Error('redis transaction was aborted');
    const failed = results.find(([err]) => err);
    if (failed) throw failed[0];
}

/** Headers for calls to another service's /internal/* routes: the shared key (contract section 3, rule 3) and the current requestId. */
export function internalHeaders(): Record<string, string | undefined> {
    const requestId = currentRequestId();
    return { 'x-internal-key': process.env.INTERNAL_API_KEY, ...(requestId ? { 'x-request-id': requestId } : {}) };
}
