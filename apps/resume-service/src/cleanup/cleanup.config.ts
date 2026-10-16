export interface CleanupConfig {
    enabled: boolean;
    intervalMs: number;
    unconfirmedTtlDays: number;
    batchSize: number;
}

/** A positive number from the environment, or the default when unset / not a positive number. */
function positiveNumber(raw: string | undefined, fallback: number): number {
    if (raw === undefined || raw.trim() === '') return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Read on every call (not cached) so tests and ops changes need no code change. */
export function readCleanupConfig(env: NodeJS.ProcessEnv = process.env): CleanupConfig {
    return {
        enabled: env.CLEANUP_ENABLED !== 'false',
        intervalMs: positiveNumber(env.CLEANUP_INTERVAL_HOURS, 24) * 60 * 60 * 1000,
        unconfirmedTtlDays: positiveNumber(env.UNCONFIRMED_RESUME_TTL_DAYS, 14),
        batchSize: Math.max(1, Math.floor(positiveNumber(env.CLEANUP_BATCH_SIZE, 100))),
    };
}