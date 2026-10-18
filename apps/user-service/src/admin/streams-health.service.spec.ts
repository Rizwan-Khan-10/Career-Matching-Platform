import { ServiceUnavailableException } from '@nestjs/common';
import { MONITORED_STREAMS, StreamsHealthService } from './streams-health.service';

function build(exec: jest.Mock) {
    const pipeline = { xlen: jest.fn().mockReturnThis(), exec };
    const redis = { client: { pipeline: jest.fn(() => pipeline) } };
    return { service: new StreamsHealthService(redis as any), pipeline };
}

describe('StreamsHealthService', () => {
    it('reports XLEN of every stream and of its .dead stream', async () => {
        const results = MONITORED_STREAMS.flatMap((_, i) => [[null, i], [null, i + 100]]);
        const { service, pipeline } = build(jest.fn().mockResolvedValue(results));

        const { streams } = await service.getStreams();

        expect(streams).toHaveLength(MONITORED_STREAMS.length);
        expect(streams[0]).toEqual({ name: MONITORED_STREAMS[0], length: 0, deadLength: 100 });
        expect(streams[3]).toEqual({ name: MONITORED_STREAMS[3], length: 3, deadLength: 103 });
        expect(pipeline.xlen.mock.calls.slice(0, 2)).toEqual([[MONITORED_STREAMS[0]], [`${MONITORED_STREAMS[0]}.dead`]]);
    });

    it('covers the streams the admin needs to watch', () => {
        for (const name of ['resume.confirmed', 'profile.updated', 'match.computed', 'candidate.ready',
            'company.status.changed', 'job.approval.changed', 'notification.created']) {
            expect(MONITORED_STREAMS).toContain(name);
        }
    });

    it('counts a failed XLEN as 0 instead of failing the whole page', async () => {
        const results = MONITORED_STREAMS.flatMap(() => [[new Error('WRONGTYPE'), undefined], [null, 2]]);
        const { service } = build(jest.fn().mockResolvedValue(results));
        const { streams } = await service.getStreams();
        expect(streams[0]).toMatchObject({ length: 0, deadLength: 2 });
    });

    it('answers 503 when Redis is not reachable', async () => {
        await expect(build(jest.fn().mockRejectedValue(new Error('down'))).service.getStreams())
            .rejects.toBeInstanceOf(ServiceUnavailableException);
        await expect(build(jest.fn().mockResolvedValue(null)).service.getStreams())
            .rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});