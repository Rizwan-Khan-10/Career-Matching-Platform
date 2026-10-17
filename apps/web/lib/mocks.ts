import type { InternalAxiosRequestConfig } from 'axios';

/**
 * DEV4_task_01 — contract-shaped mocks for endpoints owned by Dev 1 that are not merged into
 * this branch yet (`GET /auth/registration-mode`, `status` on `GET /companies/me`).
 * Only active when `NEXT_PUBLIC_USE_MOCKS=true`. Delete this file + its one call site in
 * `apiClient.ts` once the real auth-service / user-service endpoints are merged.
 *
 * Toggle the scenario with env vars (defaults shown):
 *   NEXT_PUBLIC_MOCK_REGISTRATION_MODE=open | invite_only | domain   (default: open)
 *   NEXT_PUBLIC_MOCK_ALLOWED_DOMAINS=college.edu                     (comma-separated, used when mode=domain)
 *   NEXT_PUBLIC_MOCK_COMPANY_STATUS=approved | pending | rejected    (default: approved)
 */

type RegistrationMode = 'open' | 'invite_only' | 'domain';
type CompanyStatus = 'pending' | 'approved' | 'rejected';

const MODE = (process.env.NEXT_PUBLIC_MOCK_REGISTRATION_MODE || 'open') as RegistrationMode;
const ALLOWED_DOMAINS = (process.env.NEXT_PUBLIC_MOCK_ALLOWED_DOMAINS || 'college.edu')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
const COMPANY_STATUS = (process.env.NEXT_PUBLIC_MOCK_COMPANY_STATUS || 'approved') as CompanyStatus;

export interface MockedResult {
    status: number;
    data: unknown;
}

function parseBody(config: InternalAxiosRequestConfig): Record<string, unknown> {
    if (!config.data) return {};
    if (typeof config.data === 'string') {
        try {
            return JSON.parse(config.data);
        } catch {
            return {};
        }
    }
    return config.data as Record<string, unknown>;
}

/** Returns a mocked {status, data} for known contract endpoints, or null to let the real request go through. */
export function getMockResponse(config: InternalAxiosRequestConfig): MockedResult | null {
    const method = (config.method || 'get').toLowerCase();
    const url = config.url || '';

    if (method === 'get' && url.startsWith('/auth/registration-mode')) {
        return { status: 200, data: { mode: MODE, allowedDomains: ALLOWED_DOMAINS } };
    }

    if (method === 'post' && url.startsWith('/auth/signup')) {
        if (MODE === 'invite_only') {
            return {
                status: 403,
                data: { statusCode: 403, message: 'Registration is closed. Ask your institution admin to add your account.', error: 'Forbidden' },
            };
        }
        if (MODE === 'domain') {
            const email = String(parseBody(config).email || '').toLowerCase();
            const domainOk = ALLOWED_DOMAINS.some((d) => email.endsWith(`@${d.toLowerCase()}`));
            if (!domainOk) {
                return {
                    status: 403,
                    data: { statusCode: 403, message: `Only emails from ${ALLOWED_DOMAINS.join(', ')} can sign up.`, error: 'Forbidden' },
                };
            }
        }
        return null; // open mode, or domain allowed: let the real signup call run
    }

    if (method === 'post' && url.startsWith('/auth/login')) {
        const email = String(parseBody(config).email || '').toLowerCase();
        if (email === 'disabled@example.com') {
            return { status: 401, data: { statusCode: 401, message: 'Account disabled', error: 'Unauthorized' } };
        }
        return null; // any other login: let the real backend answer
    }

    if (method === 'get' && url.startsWith('/companies/me')) {
        // Minimal fake profile so the dashboard still renders; only `status` matters for this task.
        return {
            status: 200,
            data: { name: 'Mock Company Pvt Ltd', industry: 'Software', status: COMPANY_STATUS },
        };
    }

    return null;
}
