import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// Every stream of Spec §7 plus the new ones of contract §6. Add a line here when a new stream appears.
export const MONITORED_STREAMS = [
    'resume.uploaded', 'resume.parsed', 'resume.confirmed', 'resume.updated', 'resume.superseded', 'resume.deleted',
    'resume.pdf.ready', 'resume.pdf.failed',
    'jd.uploaded', 'jd.extracted', 'job.role.deleted', 'job.stopped', 'job.approval.changed',
    'profile.updated', 'company.status.changed',
    'match.computed', 'match.scanned', 'match.approved', 'feedback.ready',
    'candidate.ready', 'candidate.shortlisted', 'candidate.rejected',
    'prep.ready', 'rejection-feedback.ready', 'notification.created',
] as const;

export interface StreamHealth {
    name: string;
    length: number;
    deadLength: number;
}

@Injectable()
export class StreamsHealthService {
    constructor(private redis: RedisService) { }

    /** XLEN of every stream and of its `<stream>.dead` (a missing stream counts as 0). One round trip. */
    async getStreams(): Promise<{ streams: StreamHealth[] }> {
        let results: [Error | null, unknown][] | null;
        try {
            const pipeline = this.redis.client.pipeline();
            for (const name of MONITORED_STREAMS) {
                pipeline.xlen(name);
                pipeline.xlen(`${name}.dead`);
            }
            results = await pipeline.exec();
        } catch {
            throw new ServiceUnavailableException('Redis is not reachable');
        }
        if (!results) throw new ServiceUnavailableException('Redis is not reachable');

        const count = (entry: [Error | null, unknown]) => (entry[0] ? 0 : Number(entry[1]) || 0);
        return {
            streams: MONITORED_STREAMS.map((name, i) => ({
                name,
                length: count(results[2 * i]),
                deadLength: count(results[2 * i + 1]),
            })),
        };
    }
}