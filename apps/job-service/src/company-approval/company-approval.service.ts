import { ForbiddenException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { internalHeaders } from '../common/events';

/** Contract 5.5: the answer of user-service is cached for 60 seconds. */
export const APPROVAL_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;
const REQUEST_TIMEOUT_MS = 5000;

export const NOT_APPROVED_MESSAGE = 'Company is not approved yet';
export const UNAVAILABLE_MESSAGE = 'Could not check the company approval right now. Please try again in a minute.';

@Injectable()
export class CompanyApprovalService {
    private readonly logger = new Logger(CompanyApprovalService.name);
    /** companyId -> expiry time. Only "approved" is cached, see assertApproved. */
    private readonly approvedUntil = new Map<string, number>();

    /**
     * Passes when user-service says the company is approved.
     * 403 when it is not; 503 when we cannot find out (fail closed: an unreachable user-service never lets anyone in).
     *
     * Only "approved" is cached: a company that was just approved by the admin can upload at once,
     * while a revoked company is blocked after at most 60 seconds.
     */
    async assertApproved(companyId: string): Promise<void> {
        const until = this.approvedUntil.get(companyId);
        if (until !== undefined && until > Date.now()) return;
        this.approvedUntil.delete(companyId);

        const status = await this.fetchStatus(companyId);
        if (status !== 'approved') throw new ForbiddenException(NOT_APPROVED_MESSAGE);
        this.remember(companyId);
    }

    private remember(companyId: string) {
        if (this.approvedUntil.size >= MAX_CACHE_ENTRIES) {
            const oldest = this.approvedUntil.keys().next().value;
            if (oldest !== undefined) this.approvedUntil.delete(oldest);
        }
        this.approvedUntil.set(companyId, Date.now() + APPROVAL_CACHE_TTL_MS);
    }

    private async fetchStatus(companyId: string): Promise<string | null> {
        const base = process.env.USER_SERVICE_URL?.replace(/\/+$/, '');
        if (!base) {
            this.logger.error('USER_SERVICE_URL is not set: cannot check company approval');
            throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
        }

        try {
            const res = await axios.get<{ status?: unknown }>(
                `${base}/internal/companies/${encodeURIComponent(companyId)}/status`,
                { headers: internalHeaders(), timeout: REQUEST_TIMEOUT_MS },
            );
            if (typeof res.data?.status !== 'string') throw new Error('unexpected response body');
            return res.data.status;
        } catch (err) {
            // no company profile at all: it cannot be approved (not an outage)
            if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
            const e = err as { message?: string; response?: { status?: number } };
            this.logger.warn(`company approval lookup failed: ${e.message ?? `HTTP ${e.response?.status ?? '?'}`}`);
            throw new ServiceUnavailableException(UNAVAILABLE_MESSAGE);
        }
    }
}
