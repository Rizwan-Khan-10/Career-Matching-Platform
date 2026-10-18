import { currentRequestId } from './request-context';

/** Headers for calls to another service's /internal/* routes: the shared key (contract section 3, rule 3) and the current requestId. */
export function internalHeaders(): Record<string, string | undefined> {
    const requestId = currentRequestId();
    return { 'x-internal-key': process.env.INTERNAL_API_KEY, ...(requestId ? { 'x-request-id': requestId } : {}) };
}

/** Headers for every other call to a service (no key): just the requestId, so one chat message can be followed across services. */
export function requestHeaders(): Record<string, string> {
    const requestId = currentRequestId();
    return requestId ? { 'x-request-id': requestId } : {};
}
