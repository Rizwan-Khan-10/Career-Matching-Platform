const normalise = (origin: string) => origin.trim().replace(/\/+$/, '').toLowerCase();

/**
 * Browser origins allowed to call this API: `WEB_URL` (one or several, comma separated).
 * WEB_URL not set -> any origin (local development without .env; production sets it, docker-compose does).
 * Requests without an Origin header (service-to-service, curl) are not browsers: nothing to check.
 */
export function webCorsOptions(webUrl: string | undefined = process.env.WEB_URL) {
    const allowed = (webUrl ?? '').split(',').map(normalise).filter(Boolean);
    if (allowed.length === 0) return { origin: true as const };
    return {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            if (!origin) return callback(null, true);
            callback(null, allowed.includes(normalise(origin)));
        },
    };
}
