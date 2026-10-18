import { HealthController } from './health.controller';

describe('HealthController', () => {
    it('is ok when Redis answers', async () => {
        const controller = new HealthController({ client: { ping: jest.fn().mockResolvedValue('PONG') } } as any);
        await expect(controller.check()).resolves.toEqual({ status: 'ok', service: 'websocket-gateway', checks: { redis: true } });
    });

    it('is degraded (503) when Redis is down', async () => {
        const controller = new HealthController({ client: { ping: jest.fn().mockRejectedValue(new Error('down')) } } as any);
        await expect(controller.check()).rejects.toMatchObject({ status: 503 });
    });
});