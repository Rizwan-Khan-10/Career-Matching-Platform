import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsController, parsePeopleQuery } from './stats.controller';
import { buildPeopleQuery } from './stats-people';

jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../auth/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class {} }));

describe('StatsService', () => {
    let prisma: any;
    let service: StatsService;

    const role = (over: Record<string, unknown> = {}) => ({
        jobRoleId: 'r1', roleTitle: 'Backend', jobPostingId: 'p1', companyId: 'c1', companyName: 'Acme', stopped: false,
        scanned: 10, matched: 4, applied: 3, shortlisted: 2, rejected: 1, ...over,
    });

    beforeEach(() => {
        prisma = {
            $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string) => {
                if (sql.includes('WITH people')) return [{ branch: 'Computer Science', scanned: 8, matched: 3, applied: 2, shortlisted: 1, rejected: 0 }, { branch: 'Unknown', scanned: 4, matched: 2, applied: 2, shortlisted: 2, rejected: 1 }];
                if (sql.includes('FROM "jobs_service"."JobRole" jr') && sql.includes('AS "roleTitle"')) return [role(), role({ jobRoleId: 'r2', applied: 1, shortlisted: 1, rejected: 0 })];
                if (sql.includes('FROM "matches_service"."RoleScan" rs')) return [{ scanned: 12, matched: 5 }];
                if (sql.includes('FROM "matches_service"."Match" m')) return [{ applied: 4, shortlisted: 3, rejected: 2 }];
                if (sql.includes('AS applicants')) return [{ applicants: 20, resumesScanned: 25, jobs: 3, stoppedJobs: 1 }];
                return [];
            }),
        };
        service = new StatsService(prisma);
    });

    it('company stats include shortlisted and rejected in totals and per role', async () => {
        const res = await service.forCompany('c1');

        expect(res.totals).toEqual({ scanned: 12, matched: 5, applied: 4, shortlisted: 3, rejected: 2 });
        expect(res.roles[0]).toMatchObject({ shortlisted: 2, rejected: 1 });
    });

    it('company stats are limited to the calling company', async () => {
        await service.forCompany('c1');

        const calls = prisma.$queryRawUnsafe.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        for (const c of calls) {
            expect(c[0]).toContain('"companyId" = $1');
            expect(c[1]).toBe('c1');
        }
    });

    it('admin stats add rejected to totals and company roll-ups, and a byBranch list', async () => {
        const res: any = await service.forAdmin();

        expect(res.totals).toEqual({ scanned: 12, matched: 5, applied: 4, shortlisted: 3, rejected: 2 });
        expect(res.companies[0]).toMatchObject({ companyId: 'c1', applied: 4, shortlisted: 3, rejected: 1 });
        expect(res.byBranch).toEqual([
            { branch: 'Computer Science', scanned: 8, matched: 3, applied: 2, shortlisted: 1, rejected: 0 },
            { branch: 'Unknown', scanned: 4, matched: 2, applied: 2, shortlisted: 2, rejected: 1 },
        ]);
        expect(res.platform).toMatchObject({ applicants: 20 });
    });

    it('byBranch uses the effective branch (verified profile, then resume, then self-entered) and counts people once', async () => {
        await service.byBranch();

        const sql: string = prisma.$queryRawUnsafe.mock.calls[0][0];
        const verified = sql.indexOf('"academicVerified"');
        const resume = sql.indexOf("NULLIF(TRIM(r.branch), '')");
        const self = sql.indexOf("NULLIF(TRIM(ap.branch), '')");
        expect(verified).toBeGreaterThan(-1);
        expect(verified).toBeLessThan(resume);
        expect(resume).toBeLessThan(self);
        expect(sql).toContain("'Unknown'");
        expect(sql).toContain('GROUP BY e.branch');
        expect(sql).toContain("m.decision = 'rejected'");
    });
});

describe('StatsService people drill-down', () => {
    let prisma: any;
    let service: StatsService;

    beforeEach(() => {
        prisma = {
            $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string) => {
                if (sql.includes('COUNT(*)::int AS total')) return [{ total: 2 }];
                if (sql.includes('FROM "jobs_service"."JobRole" jr JOIN')) return [{ title: 'Backend', companyId: 'c1' }];
                return [
                    { applicantId: 'a1', name: 'Asha', email: 'a@x.com', branch: 'CSE', score: 0.9, matchedSkills: ['java'], hasPdf: true, targetTrack: 'backend', targetStack: 'java' },
                    { applicantId: 'a2', name: null, branch: 'Unknown', score: 0.5 },
                ];
            }),
        };
        service = new StatsService(prisma);
    });

    // the table and the list must use the SAME conditions, or the numbers and the people drift apart
    it.each([
        ['scanned', 'FROM "matches_service"."RoleScan" rs', null],
        ['matched', 'WHERE rs.eligible', null],
        ['applied', `m."applicantStatus" = 'approved' AND m.eligible`, null],
        ['shortlisted', `m.decision = 'shortlisted'`, null],
        ['rejected', `m.decision = 'rejected'`, null],
    ])('stage %s uses the same predicate as the dashboard count', (stage, predicate) => {
        const sql = buildPeopleQuery({ stage: stage as any }, { role: 'ADMIN' }).pageSql;
        expect(sql).toContain(predicate);
    });

    it('lists the parsed resumes the "Resumes scanned" card counts', () => {
        const sql = buildPeopleQuery({ stage: 'parsed' }, { role: 'ADMIN' }).pageSql;
        expect(sql).toContain(`r.status = 'parsed'`);
    });

    it('returns total, page, limit and mapped rows with the resume label', async () => {
        const res = await service.people({ stage: 'applied', page: 1, limit: 25 }, { role: 'ADMIN' });
        expect(res).toMatchObject({ total: 2, page: 1, limit: 25, distinct: true });
        expect(res.rows[0]).toMatchObject({ name: 'Asha', score: 0.9, resume: { hasPdf: true, targetLabel: 'Backend · Java' } });
        expect(res.rows[1].name).toBeNull();
    });

    it('caps the page size at 100 and never concatenates user text into the SQL', () => {
        const built = buildPeopleQuery({ stage: 'applied', limit: 5000, q: "x'; DROP TABLE" , branch: 'CSE' }, { role: 'ADMIN' });
        expect(built.pageSql).toContain('LIMIT 100');
        expect(built.pageSql).not.toContain('DROP TABLE');
        expect(built.args).toContain('CSE');
    });

    it('a company is forced to its own company id', async () => {
        await service.people({ stage: 'applied', companyId: 'someone-else' }, { role: 'COMPANY', userId: 'c1' });
        const call = prisma.$queryRawUnsafe.mock.calls.find((c: any[]) => c[0].includes('LIMIT'));
        expect(call[1]).toBe('c1');
        expect(call).not.toContain('someone-else');
    });

    it('a company cannot list scanned / matched / parsed people', async () => {
        for (const stage of ['scanned', 'matched', 'parsed'] as const) {
            await expect(service.people({ stage }, { role: 'COMPANY', userId: 'c1' })).rejects.toThrow(ForbiddenException);
        }
    });

    it('a company cannot read another company\'s role (people and insights)', async () => {
        await expect(service.people({ stage: 'applied', jobRoleId: 'r1' }, { role: 'COMPANY', userId: 'c2' })).rejects.toThrow(ForbiddenException);
        await expect(service.roleInsights('r1', 'c2')).rejects.toThrow(ForbiddenException);
    });

    it('a company never receives emails or phones', () => {
        const sql = buildPeopleQuery({ stage: 'applied' }, { role: 'COMPANY', userId: 'c1' }).pageSql;
        expect(sql).not.toContain('u.email AS');
        expect(sql).not.toContain('ap.phone AS');
    });

    it('rejects an unknown role and a parsed list with a role filter', async () => {
        prisma.$queryRawUnsafe.mockResolvedValueOnce([]);
        await expect(service.roleInsights('missing', 'c1')).rejects.toThrow(NotFoundException);
        await expect(service.people({ stage: 'parsed', jobRoleId: 'r1' }, { role: 'ADMIN' })).rejects.toThrow(BadRequestException);
    });

    it('parsePeopleQuery requires a valid stage', () => {
        expect(() => parsePeopleQuery({})).toThrow(BadRequestException);
        expect(() => parsePeopleQuery({ stage: 'nope' })).toThrow(BadRequestException);
        expect(parsePeopleQuery({ stage: 'applied', page: '2', limit: '10', sort: 'name' })).toMatchObject({ stage: 'applied', page: 2, limit: 10, sort: 'name' });
    });
});

describe('StatsController access', () => {
    const service = { forCompany: jest.fn().mockResolvedValue({}), forAdmin: jest.fn().mockResolvedValue({}), people: jest.fn().mockResolvedValue({}), roleInsights: jest.fn().mockResolvedValue({}) } as any;
    const ctrl = new StatsController(service);
    const req = (role: string) => ({ user: { userId: 'u1', role } }) as any;

    it('lets only a company read /stats/company and only an admin read /stats/admin', () => {
        expect(() => ctrl.company(req('APPLICANT'))).toThrow(ForbiddenException);
        expect(() => ctrl.company(req('ADMIN'))).toThrow(ForbiddenException);
        expect(() => ctrl.admin(req('COMPANY'))).toThrow(ForbiddenException);
        expect(() => ctrl.admin(req('APPLICANT'))).toThrow(ForbiddenException);
        ctrl.company(req('COMPANY'));
        ctrl.admin(req('ADMIN'));
        expect(service.forCompany).toHaveBeenCalledWith('u1');
        expect(service.forAdmin).toHaveBeenCalled();
    });

    it('only an admin reads admin people, only a company reads company people and insights', () => {
        expect(() => ctrl.adminPeople(req('COMPANY'), { stage: 'applied' })).toThrow(ForbiddenException);
        expect(() => ctrl.companyPeople(req('ADMIN'), { stage: 'applied' })).toThrow(ForbiddenException);
        expect(() => ctrl.companyInsights(req('APPLICANT'), 'r1')).toThrow(ForbiddenException);
        ctrl.adminPeople(req('ADMIN'), { stage: 'applied' });
        ctrl.companyPeople(req('COMPANY'), { stage: 'applied' });
        ctrl.companyInsights(req('COMPANY'), 'r1');
        expect(service.people).toHaveBeenCalledWith(expect.objectContaining({ stage: 'applied' }), { role: 'ADMIN' });
        expect(service.people).toHaveBeenCalledWith(expect.objectContaining({ stage: 'applied' }), { role: 'COMPANY', userId: 'u1' });
        expect(service.roleInsights).toHaveBeenCalledWith('r1', 'u1');
    });
});
