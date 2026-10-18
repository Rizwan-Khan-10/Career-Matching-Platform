import { ForbiddenException, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { APPROVAL_CACHE_TTL_MS, CompanyApprovalService, NOT_APPROVED_MESSAGE } from './company-approval.service';

jest.mock('axios');
const get = axios.get as jest.Mock;

describe('CompanyApprovalService', () => {
    let service: CompanyApprovalService;
    const env = { ...process.env };

    beforeEach(() => {
        process.env.USER_SERVICE_URL = 'http://user-service:3002/';
        process.env.INTERNAL_API_KEY = 'secret';
        get.mockReset();
        jest.useFakeTimers();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        service = new CompanyApprovalService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
        process.env = { ...env };
    });

    it('lets an approved company through and calls the internal endpoint with key and timeout', async () => {
        get.mockResolvedValue({ data: { status: 'approved' } });
        await expect(service.assertApproved('c1')).resolves.toBeUndefined();
        expect(get).toHaveBeenCalledWith(
            'http://user-service:3002/internal/companies/c1/status',
            { headers: { 'x-internal-key': 'secret' }, timeout: 5000 },
        );
    });

    it.each(['pending', 'rejected'])('answers 403 "Company is not approved yet" for a %s company', async (status) => {
        get.mockResolvedValue({ data: { status } });
        const err = await service.assertApproved('c1').catch((e) => e);
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(err.message).toBe(NOT_APPROVED_MESSAGE);
        expect(NOT_APPROVED_MESSAGE).toBe('Company is not approved yet');
    });

    it('answers 403 when user-service has no profile for the company (404)', async () => {
        get.mockRejectedValue({ response: { status: 404 } });
        await expect(service.assertApproved('c1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('caches "approved" for 60 seconds, then asks again', async () => {
        get.mockResolvedValue({ data: { status: 'approved' } });
        await service.assertApproved('c1');
        await service.assertApproved('c1');
        expect(get).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(APPROVAL_CACHE_TTL_MS - 1);
        await service.assertApproved('c1');
        expect(get).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(2);
        await service.assertApproved('c1');
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('does not cache a company that is not approved, so approval takes effect at once', async () => {
        get.mockResolvedValueOnce({ data: { status: 'pending' } }).mockResolvedValueOnce({ data: { status: 'approved' } });
        await expect(service.assertApproved('c1')).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.assertApproved('c1')).resolves.toBeUndefined();
    });

    it('caches per company', async () => {
        get.mockResolvedValue({ data: { status: 'approved' } });
        await service.assertApproved('c1');
        await service.assertApproved('c2');
        expect(get).toHaveBeenCalledTimes(2);
    });

    it('fails closed with 503 when user-service is unreachable, times out or errors', async () => {
        for (const failure of [new Error('ECONNREFUSED'), { code: 'ECONNABORTED', message: 'timeout' }, { response: { status: 500 } }]) {
            get.mockRejectedValueOnce(failure);
            await expect(service.assertApproved('c1')).rejects.toBeInstanceOf(ServiceUnavailableException);
        }
    });

    it('fails closed with 503 on an unexpected response body', async () => {
        get.mockResolvedValue({ data: {} });
        await expect(service.assertApproved('c1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('never serves an old "approved" from cache after a failed refresh', async () => {
        get.mockResolvedValueOnce({ data: { status: 'approved' } });
        await service.assertApproved('c1');
        jest.advanceTimersByTime(APPROVAL_CACHE_TTL_MS + 1);
        get.mockRejectedValueOnce(new Error('down'));
        await expect(service.assertApproved('c1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('fails closed with 503 when USER_SERVICE_URL is not configured', async () => {
        delete process.env.USER_SERVICE_URL;
        await expect(service.assertApproved('c1')).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(get).not.toHaveBeenCalled();
    });
});
