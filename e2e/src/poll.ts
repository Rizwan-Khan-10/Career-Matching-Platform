import { config } from './config';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Throw this inside eventually() to stop waiting at once (a retry cannot help). */
export class Fatal extends Error {}

/**
 * Calls fn until it returns something truthy. Errors and falsy values mean "not yet".
 * Times out with the last error, so a stuck agent is easy to spot.
 */
export async function eventually<T>(
  what: string,
  fn: () => Promise<T | null | undefined | false>,
  { timeoutMs = config.waitMs, intervalMs = 2000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      if (err instanceof Fatal) throw err;
      lastError = err;
    }
    if (Date.now() > deadline) {
      const detail = lastError ? ` (last error: ${(lastError as Error).message})` : '';
      throw new Error(`Timed out after ${timeoutMs} ms waiting for: ${what}${detail}`);
    }
    await sleep(intervalMs);
  }
}