import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * The requestId of whatever is running right now: an HTTP request (x-request-id header) or a stream message being
 * handled (the `requestId` field of the event). Logs made meanwhile pick it up automatically (contract section 3).
 */
const storage = new AsyncLocalStorage<{ requestId: string }>();

const SAFE_ID = /^[A-Za-z0-9._-]{1,100}$/;

export const newRequestId = (): string => randomUUID();

export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The requestId an event carries, or a fresh one when it has none (or an unsafe one). */
export function requestIdFrom(value: unknown): string {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : newRequestId();
}