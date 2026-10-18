import { Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';
import { AuthSettingsService, SETTINGS_CACHE_TTL_MS } from './auth-settings.service';
import { runWithRequestId } from '../common/request-context';

jest.mock('axios');
const get = axios.get as jest.Mock;

describe('AuthSettingsService (jobApprovalRequired, contract 5.5)', () => {
    let service: AuthSettingsService;
    const env = { ...process.env };

    beforeEach(() => {
        process.env.AUTH_SERVICE_URL = 'http://auth-service:3001/';
        process.env.INTERNAL_API_KEY = 'secret';
        get.mockReset();
        jest.useFakeTimers();
        jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        service = new AuthSettingsService();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
        process.env = { ...env };
    });

    it.each([true, false])('reads jobApprovalRequired=%s from /internal/settings with the internal key and a timeout', async (value) => {
        get.mockResolvedValue({ data: { registrationMode: 'open', jobApprovalRequired: value } });

        await expect(service.jobApprovalRequired()).resolves.toBe(value);

        expect(get).toHaveBeenCalledWith('http://auth-service:3001/internal/settings', { headers: { 'x-internal-key': 'secret' }, timeout: 5000 });
    });

    it('forwards the requestId of the request being handled', async () => {
        get.mockResolvedValue({ data: { jobApprovalRequired: false } });

        await runWithRequestId('req-77', () => service.jobApprovalRequired());

        expect(get.mock.calls[0][1].headers).toEqual({ 'x-internal-key': 'secret', 'x-request-id': 'req-77' });
    });

    it('caches the answer for 60 seconds, then asks again (and sees a changed setting)', async () => {
        get.mockResolvedValueOnce({ data: { jobApprovalRequired: false } }).mockResolvedValueOnce({ data: { jobApprovalRequired: true } });

        expect(await service.jobApprovalRequired()).toBe(false);
        jest.advanceTimersByTime(SETTINGS_CACHE_TTL_MS - 1000);
        expect(await service.jobApprovalRequired()).toBe(false);
        expect(get).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(1500);
        expect(await service.jobApprovalRequired()).toBe(true);
        expect(get).toHaveBeenCalledTimes(2);
        expect(SETTINGS_CACHE_TTL_MS).toBe(60_000);
    });

    it.each([
        ['auth-service is unreachable', () => get.mockRejectedValue(new Error('ECONNREFUSED'))],
        ['it answers an error', () => get.mockRejectedValue({ response: { status: 500 } })],
        ['the body has no boolean', () => get.mockResolvedValue({ data: { jobApprovalRequired: 'yes' } })],
        ['the body is empty', () => get.mockResolvedValue({ data: undefined })],
    ])('fails closed with a 503 when %s', async (_name, arrange) => {
        arrange();

        await expect(service.jobApprovalRequired()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('does not cache a failure: the next call asks again', async () => {
        get.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce({ data: { jobApprovalRequired: true } });

        await expect(service.jobApprovalRequired()).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(await service.jobApprovalRequired()).toBe(true);
    });

    it('answers 503 without calling anything when AUTH_SERVICE_URL is not set', async () => {
        delete process.env.AUTH_SERVICE_URL;

        await expect(service.jobApprovalRequired()).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(get).not.toHaveBeenCalled();
    });
});
