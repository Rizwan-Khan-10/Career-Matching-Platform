import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { internalHeaders } from '../common/events';

/** Contract 5.5: the answer of auth-service is cached for 60 seconds. */
export const SETTINGS_CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5000;

export const SETTINGS_UNAVAILABLE_MESSAGE = 'Could not check the platform settings right now. Please try again in a minute.';

@Injectable()
export class AuthSettingsService {
    private readonly logger = new Logger(AuthSettingsService.name);
    private cached: { value: boolean; until: number } | null = null;

    /**
     * Is the admin approval of new job postings switched on (`GET auth-service /internal/settings`, cached 60 s)?
     * Fails closed: when the setting cannot be read the caller gets a 503 instead of a posting that skips the approval.
     */
    async jobApprovalRequired(): Promise<boolean> {
        if (this.cached && this.cached.until > Date.now()) return this.cached.value;

        const base = process.env.AUTH_SERVICE_URL?.replace(/\/+$/, '');
        if (!base) {
            this.logger.error('AUTH_SERVICE_URL is not set: cannot read the job approval setting');
            throw new ServiceUnavailableException(SETTINGS_UNAVAILABLE_MESSAGE);
        }
        try {
            const res = await axios.get<{ jobApprovalRequired?: unknown }>(`${base}/internal/settings`, {
                headers: internalHeaders(),
                timeout: REQUEST_TIMEOUT_MS,
            });
            const value = res.data?.jobApprovalRequired;
            if (typeof value !== 'boolean') throw new Error('unexpected response body');
            this.cached = { value, until: Date.now() + SETTINGS_CACHE_TTL_MS };
            return value;
        } catch (err) {
            const e = err as { message?: string; response?: { status?: number } };
            this.logger.warn(`settings lookup failed: ${e.message ?? `HTTP ${e.response?.status ?? '?'}`}`);
            throw new ServiceUnavailableException(SETTINGS_UNAVAILABLE_MESSAGE);
        }
    }
}
