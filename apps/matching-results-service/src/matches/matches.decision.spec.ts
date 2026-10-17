import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { SetDecisionDto } from './dto/set-decision.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

// unit test: the real Prisma client, Redis and JWT guard stay out of it, everything is mocked below
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../redis/redis.service', () => ({ RedisService: class {} }));
jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));
jest.mock('../generated/prisma', () => ({ Prisma: { sql: (...a: unknown[]) => a, join: (...a: unknown[]) => a, DbNull: 'DbNull' } }));

/** Validates a raw request body exactly like the global ValidationPipe({ whitelist, transform }) would. */
async function check(body: unknown) {
    const dto = plainToInstance(SetDecisionDto, body);
    const errors = await validate(dto, { whitelist: true });
    return { dto, errors, fields: errors.map((e) => e.property) };
}

describe('SetDecisionDto validation (contract 5.6)', () => {
    const shortlist = { roundName: 'Technical round 1', mode: 'online' };
    const rejection = { reasonCategory: 'skills_gap' };

    it('accepts a minimal shortlist (roundName + mode only)', async () => {
        expect((await check({ decision: 'shortlisted', shortlist })).errors).toHaveLength(0);
    });

    it('accepts a full shortlist', async () => {
        const full = { ...shortlist, scheduledAt: '2026-11-03T10:00:00.000Z', bring: 'ID card', link: 'https://meet.example/x', address: 'Pune', note: 'Be on time' };
        expect((await check({ decision: 'shortlisted', shortlist: full })).errors).toHaveLength(0);
    });

    it('accepts a reject with only the reason, and with a message', async () => {
        expect((await check({ decision: 'rejected', rejection })).errors).toHaveLength(0);
        expect((await check({ decision: 'rejected', rejection: { ...rejection, message: 'thanks' } })).errors).toHaveLength(0);
    });

    it('accepts decision null (clears) without any form', async () => {
        expect((await check({ decision: null })).errors).toHaveLength(0);
    });

    it('rejects a missing or unknown decision', async () => {
        expect((await check({})).fields).toContain('decision');
        expect((await check({ decision: 'hired' })).fields).toContain('decision');
    });

    it('requires the shortlist form for "shortlisted" and the rejection form for "rejected"', async () => {
        expect((await check({ decision: 'shortlisted' })).fields).toContain('shortlist');
        expect((await check({ decision: 'rejected' })).fields).toContain('rejection');
    });

    it('requires roundName and mode for a shortlist, and a real mode', async () => {
        expect((await check({ decision: 'shortlisted', shortlist: { mode: 'online' } })).errors).not.toHaveLength(0);
        expect((await check({ decision: 'shortlisted', shortlist: { roundName: 'R1' } })).errors).not.toHaveLength(0);
        expect((await check({ decision: 'shortlisted', shortlist: { roundName: 'R1', mode: 'carrier-pigeon' } })).errors).not.toHaveLength(0);
    });

    it('rejects a blank roundName (trimmed) and a bad scheduledAt', async () => {
        expect((await check({ decision: 'shortlisted', shortlist: { roundName: '   ', mode: 'phone' } })).errors).not.toHaveLength(0);
        expect((await check({ decision: 'shortlisted', shortlist: { ...shortlist, scheduledAt: 'tomorrow evening' } })).errors).not.toHaveLength(0);
    });

    it('rejects an unknown reasonCategory', async () => {
        expect((await check({ decision: 'rejected', rejection: { reasonCategory: 'bad_vibes' } })).errors).not.toHaveLength(0);
    });

    it('drops fields that are not part of the contract (whitelist)', async () => {
        const { dto } = await check({ decision: 'rejected', rejection: { ...rejection, secret: 'x' }, decidedBy: 'someone-else' });
        expect(dto).not.toHaveProperty('decidedBy');
        expect(dto.rejection).not.toHaveProperty('secret');
    });
});

describe('MatchesService.setDecision', () => {
    let prisma: any;
    let redis: any;
    let service: MatchesService;

    const approved = (over: Record<string, unknown> = {}) => ({
        id: 'm1', applicantId: 'a1', jobRoleId: 'r1', roleTitle: 'Backend Dev', applicantStatus: 'approved',
        decision: null, decidedAt: null, decidedBy: null, shortlistInfo: null, rejectReason: null, rejectMessage: null, prepGuide: null, rejectionFeedback: null,
        ...over,
    });
    const roleRow = { jobRoleId: 'r1', title: 'Backend Developer', companyId: 'c1', companyName: 'Acme Corp', industry: null, stopped: false };
    const dto = (body: unknown) => plainToInstance(SetDecisionDto, body);
    const shortlistDto = () => dto({ decision: 'shortlisted', shortlist: { roundName: ' Technical round 1 ', mode: 'online', note: '', link: 'https://meet.example/x' } });
    const rejectDto = () => dto({ decision: 'rejected', rejection: { reasonCategory: 'skills_gap', message: 'Needs more Java' } });
    const events = () => redis.client.xadd.mock.calls.map((c: any[]) => ({ stream: c[0], data: JSON.parse(c[6]) }));

    beforeEach(() => {
        prisma = {
            match: { findUnique: jest.fn().mockResolvedValue(approved()), update: jest.fn().mockImplementation(async ({ data }) => ({ ...approved(), ...data })) },
            // 1st call = ownership check, 2nd = role info for the event
            $queryRaw: jest.fn().mockResolvedValueOnce([{ ok: 1 }]).mockResolvedValueOnce([roleRow]),
        };
        redis = { client: { xadd: jest.fn().mockResolvedValue('1-0') } };
        service = new MatchesService(prisma, redis);
    });

    describe('privacy', () => {
        it('404 for a match that does not exist', async () => {
            prisma.match.findUnique.mockResolvedValue(null);
            await expect(service.setDecision('x', 'c1', 'COMPANY', shortlistDto())).rejects.toBeInstanceOf(NotFoundException);
        });

        it.each(['pending', 'declined'])('404 for a candidate whose status is "%s" (only approved ones are visible)', async (status) => {
            prisma.match.findUnique.mockResolvedValue(approved({ applicantStatus: status }));
            await expect(service.setDecision('m1', 'c1', 'COMPANY', shortlistDto())).rejects.toBeInstanceOf(NotFoundException);
            expect(prisma.match.update).not.toHaveBeenCalled();
        });

        it('403 for a company that does not own the role, and nothing is written or published', async () => {
            prisma.$queryRaw.mockReset().mockResolvedValueOnce([]);
            await expect(service.setDecision('m1', 'other-company', 'COMPANY', shortlistDto())).rejects.toBeInstanceOf(ForbiddenException);
            expect(prisma.match.update).not.toHaveBeenCalled();
            expect(redis.client.xadd).not.toHaveBeenCalled();
        });
    });

    describe('controller', () => {
        const controller = () => new MatchesController({ setDecision: jest.fn().mockResolvedValue('ok') } as any);
        const req = (role: string) => ({ user: { userId: 'u1', role } }) as any;

        it.each(['APPLICANT', 'ADMIN', ''])('role "%s" cannot decide', (role) => {
            expect(() => controller().decide('m1', shortlistDto(), req(role))).toThrow(ForbiddenException);
        });

        it('a company can decide (any letter case)', async () => {
            const c = controller();
            await expect(c.decide('m1', shortlistDto(), req('company'))).resolves.toBe('ok');
        });
    });

    describe('shortlist', () => {
        it('saves the cleaned details, clears reject fields and old AI guides, and publishes candidate.shortlisted', async () => {
            await service.setDecision('m1', 'c1', 'COMPANY', shortlistDto());

            const data = prisma.match.update.mock.calls[0][0].data;
            expect(data).toMatchObject({ decision: 'shortlisted', decidedBy: 'c1', rejectReason: null, rejectMessage: null, prepGuide: null, rejectionFeedback: null });
            expect(data.shortlistInfo).toEqual({ roundName: 'Technical round 1', mode: 'online', link: 'https://meet.example/x' }); // trimmed, empty note dropped
            expect(events()).toEqual([{
                stream: 'candidate.shortlisted',
                data: {
                    matchId: 'm1', applicantId: 'a1', jobRoleId: 'r1', companyId: 'c1', roleTitle: 'Backend Developer', companyName: 'Acme Corp',
                    shortlist: { roundName: 'Technical round 1', mode: 'online', link: 'https://meet.example/x' },
                    requestId: expect.any(String),
                },
            }]);
        });

        it('sending the same shortlist again does nothing (no second event)', async () => {
            // jsonb returns keys in another order than we stored them
            prisma.match.findUnique.mockResolvedValue(approved({ decision: 'shortlisted', shortlistInfo: { mode: 'online', link: 'https://meet.example/x', roundName: 'Technical round 1' } }));
            await service.setDecision('m1', 'c1', 'COMPANY', shortlistDto());

            expect(prisma.match.update).not.toHaveBeenCalled();
            expect(redis.client.xadd).not.toHaveBeenCalled();
        });

        it('changed details are saved and announced again', async () => {
            prisma.match.findUnique.mockResolvedValue(approved({ decision: 'shortlisted', shortlistInfo: { roundName: 'Technical round 1', mode: 'offline' } }));
            await service.setDecision('m1', 'c1', 'COMPANY', shortlistDto());

            expect(events().map((e: any) => e.stream)).toEqual(['candidate.shortlisted']);
        });
    });

    describe('reject', () => {
        it('stores the reason privately, clears shortlist data and publishes candidate.rejected', async () => {
            prisma.match.findUnique.mockResolvedValue(approved({ decision: 'shortlisted', shortlistInfo: { roundName: 'R1', mode: 'online' }, prepGuide: 'old guide' }));
            await service.setDecision('m1', 'c1', 'COMPANY', rejectDto());

            const data = prisma.match.update.mock.calls[0][0].data;
            expect(data).toMatchObject({ decision: 'rejected', rejectReason: 'skills_gap', rejectMessage: 'Needs more Java', prepGuide: null, rejectionFeedback: null });
            expect(data.shortlistInfo).toBe('DbNull');
            expect(events()).toEqual([{
                stream: 'candidate.rejected',
                data: { matchId: 'm1', applicantId: 'a1', jobRoleId: 'r1', companyId: 'c1', roleTitle: 'Backend Developer', reasonCategory: 'skills_gap', message: 'Needs more Java', requestId: expect.any(String) },
            }]);
        });

        it('leaves "message" out of the event when the recruiter wrote none', async () => {
            await service.setDecision('m1', 'c1', 'COMPANY', dto({ decision: 'rejected', rejection: { reasonCategory: 'position_filled' } }));

            expect(events()[0].data).not.toHaveProperty('message');
            expect(events()[0].data.reasonCategory).toBe('position_filled');
        });

        it('sending the same rejection again does nothing', async () => {
            prisma.match.findUnique.mockResolvedValue(approved({ decision: 'rejected', rejectReason: 'skills_gap', rejectMessage: 'Needs more Java' }));
            await service.setDecision('m1', 'c1', 'COMPANY', rejectDto());

            expect(prisma.match.update).not.toHaveBeenCalled();
            expect(redis.client.xadd).not.toHaveBeenCalled();
        });
    });

    describe('clear ({ decision: null })', () => {
        it('wipes the decision, its details and the AI guides, and sends no event', async () => {
            prisma.match.findUnique.mockResolvedValue(approved({ decision: 'rejected', rejectReason: 'other', rejectionFeedback: 'tips' }));
            await service.setDecision('m1', 'c1', 'COMPANY', dto({ decision: null }));

            expect(prisma.match.update.mock.calls[0][0].data).toEqual({
                decision: null, decidedAt: null, decidedBy: null, shortlistInfo: 'DbNull', rejectReason: null, rejectMessage: null, prepGuide: null, rejectionFeedback: null,
            });
            expect(redis.client.xadd).not.toHaveBeenCalled();
        });

        it('is a no-op when nothing was decided', async () => {
            await service.setDecision('m1', 'c1', 'COMPANY', dto({ decision: null }));

            expect(prisma.match.update).not.toHaveBeenCalled();
        });
    });

    describe('when the event cannot be published', () => {
        it('rolls the decision back and tells the company to retry', async () => {
            const before = approved({ decision: 'rejected', rejectReason: 'other', rejectMessage: 'x', prepGuide: null });
            prisma.match.findUnique.mockResolvedValue(before);
            redis.client.xadd.mockRejectedValue(new Error('redis down'));

            await expect(service.setDecision('m1', 'c1', 'COMPANY', shortlistDto())).rejects.toBeInstanceOf(ServiceUnavailableException);

            expect(prisma.match.update).toHaveBeenCalledTimes(2);
            expect(prisma.match.update.mock.calls[1][0].data).toMatchObject({ decision: 'rejected', rejectReason: 'other', rejectMessage: 'x', shortlistInfo: 'DbNull' });
        });
    });
});
