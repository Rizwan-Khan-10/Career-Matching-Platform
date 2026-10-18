import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * The requestId of whatever is running right now: an HTTP request (x-request-id header) or a stream message being
 * handled (the `requestId` field of the event). Logs and events published meanwhile pick it up automatically
 * (contract section 3, rules 1 and 8).
 */
const storage = new AsyncLocalStorage<{ requestId: string }>();

export const newRequestId = (): string => randomUUID();

export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}