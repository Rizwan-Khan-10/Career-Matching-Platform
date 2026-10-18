const DEFAULT_WEB_URL = 'http://localhost:3000';

const normalise = (origin: string) => origin.trim().replace(/\/+$/, '').toLowerCase();

/**
 * Browser origins that may open a socket: `WEB_URL`, or several separated by commas. Read on every call (not at import
 * time) because the .env file is loaded by ConfigModule only after the gateway class has been decorated.
 */
export function allowedOrigins(webUrl: string | undefined = process.env.WEB_URL): string[] {
    const list = (webUrl || DEFAULT_WEB_URL).split(',').map(normalise).filter(Boolean);
    return list.length > 0 ? list : [normalise(DEFAULT_WEB_URL)];
}

/** Dynamic `origin` for socket.io / express CORS. Requests without an Origin header are not browsers: nothing to check. */
export function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
    if (!origin) return callback(null, true);
    callback(null, allowedOrigins().includes(normalise(origin)));
}