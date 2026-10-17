import { config } from './config';

/** matching-agent is internal (not behind nginx). GET /stats needs the internal key. */
export async function matchingStats(): Promise<unknown> {
  const res = await fetch(`${config.matchingAgentUrl}/stats`, { headers: { 'x-internal-key': config.internalApiKey } });
  if (!res.ok) throw new Error(`GET ${config.matchingAgentUrl}/stats returned ${res.status} (check E2E_MATCHING_AGENT_URL and E2E_INTERNAL_API_KEY)`);
  return res.json();
}

/** Sums every number whose key looks like "skipped by hash", wherever it sits in the JSON (the exact name is not in the contract). */
export function skippedByHash(stats: unknown): number {
  if (!stats || typeof stats !== 'object') return 0;
  let total = 0;
  for (const [key, value] of Object.entries(stats as Record<string, unknown>)) {
    if (typeof value === 'number' && /skip.*hash|hash.*skip/i.test(key)) total += value;
    else if (value && typeof value === 'object') total += skippedByHash(value);
  }
  return total;
}