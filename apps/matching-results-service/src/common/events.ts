import { currentRequestId, newRequestId } from './request-context';

/** Contract section 3, rule 2: every XADD is trimmed with MAXLEN ~ 10000. */
export const STREAM_MAXLEN = 10000;

/**
 * Publishes one event in the shared envelope: one field `data` holding JSON (contract section 3, rule 1).
 * `requestId` is copied from the event / HTTP request being handled, or created when there is none.
 * An explicit `payload.requestId` wins.
 */
export function publishEvent(redis: { client: any }, stream: string, payload: Record<string, unknown>) {
    const requestId = (typeof payload.requestId === 'string' && payload.requestId) || currentRequestId() || newRequestId();
    return redis.client.xadd(stream, 'MAXLEN', '~', STREAM_MAXLEN, '*', 'data', JSON.stringify({ ...payload, requestId }));
}
