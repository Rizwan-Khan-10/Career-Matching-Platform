/**
 * Best-effort audit entry in user-service (POST /internal/audit, x-internal-key). An audit failure must never
 * fail the request that caused it, so errors are only logged.
 */
export async function writeAudit(entry: { actorId: string; action: string; target: string; meta?: Record<string, unknown> }): Promise<void> {
    const base = process.env.USER_SERVICE_URL;
    if (!base) {
        console.warn(`audit entry "${entry.action}" was not saved: USER_SERVICE_URL is not set`);
        return;
    }
    try {
        const res = await fetch(`${base}/internal/audit`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(process.env.INTERNAL_API_KEY ? { 'x-internal-key': process.env.INTERNAL_API_KEY } : {}) },
            body: JSON.stringify(entry),
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) console.warn(`audit entry "${entry.action}" was not saved: HTTP ${res.status}`);
    } catch (err) {
        console.warn(`audit entry "${entry.action}" was not saved: ${(err as Error).message}`);
    }
}
