import { readCleanupConfig } from './cleanup.config';

describe('readCleanupConfig', () => {
    it('uses the documented defaults', () => {
        expect(readCleanupConfig({})).toEqual({
            enabled: true,
            intervalMs: 24 * 60 * 60 * 1000,
            unconfirmedTtlDays: 14,
            batchSize: 100,
        });
    });

    it('reads the environment', () => {
        const config = readCleanupConfig({
            UNCONFIRMED_RESUME_TTL_DAYS: '7',
            CLEANUP_INTERVAL_HOURS: '6',
            CLEANUP_BATCH_SIZE: '25',
            CLEANUP_ENABLED: 'false',
        });
        expect(config).toEqual({ enabled: false, intervalMs: 6 * 60 * 60 * 1000, unconfirmedTtlDays: 7, batchSize: 25 });
    });

    it('falls back to the defaults for empty, zero, negative or non-numeric values', () => {
        for (const bad of ['', '0', '-3', 'abc']) {
            const config = readCleanupConfig({ UNCONFIRMED_RESUME_TTL_DAYS: bad, CLEANUP_BATCH_SIZE: bad });
            expect(config.unconfirmedTtlDays).toBe(14);
            expect(config.batchSize).toBe(100);
        }
    });
});