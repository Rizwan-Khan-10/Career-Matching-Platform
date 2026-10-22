import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { writeAudit } from '../common/audit-client';
import {
    COMPANY_PEOPLE_STAGES,
    EFFECTIVE_BRANCH_SQL,
    PEOPLE_STAGES,
    buildPeopleQuery,
    clampLimit,
    clampPage,
    isDistinctMode,
    resumeBranchJoin,
    toPersonRow,
    type PeopleFilters,
    type PeoplePage,
    type PeopleViewer,
} from './stats-people';

export interface RoleStats {
    jobRoleId: string;
    roleTitle: string;
    jobPostingId: string;
    companyId?: string;
    companyName?: string | null;
    stopped: boolean;
    scanned: number;   // distinct applicants the matching-agent evaluated for this role (any of their resumes)
    matched: number;   // ... of which eligible with at least one resume
    applied: number;   // ... of which approved sharing their resume with the company
    shortlisted: number;
    rejected: number;
}

export interface BranchStats {
    branch: string;   // effective branch (contract §4.3), 'Unknown' when nobody told us
    scanned: number;  // distinct applicants of that branch ...
    matched: number;
    applied: number;
    shortlisted: number;
    rejected: number;
}

export interface Totals {
    scanned: number;
    matched: number;
    applied: number;
    shortlisted: number;
    rejected: number;
}

/**
 * Funnel numbers for the dashboards. Everything is computed in SQL (counts cast to int: Prisma returns bigint
 * for COUNT, which JSON cannot serialise). The jobs/users schemas live in the same database, like everywhere else.
 */
@Injectable()
export class StatsService {
    constructor(private prisma: PrismaService) { }

    private roleRowsSql(where: string) {
        return `
            SELECT jr.id AS "jobRoleId", jr.title AS "roleTitle", jp.id AS "jobPostingId", jp."companyId" AS "companyId",
                   cp.name AS "companyName", (jp."stoppedAt" IS NOT NULL) AS stopped,
                   COALESCE(s.scanned, 0)::int AS scanned, COALESCE(s.matched, 0)::int AS matched,
                   COALESCE(m.applied, 0)::int AS applied, COALESCE(m.shortlisted, 0)::int AS shortlisted,
                   COALESCE(m.rejected, 0)::int AS rejected
            FROM "jobs_service"."JobRole" jr
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            LEFT JOIN "users_service"."CompanyProfile" cp ON cp."userId" = jp."companyId"
            LEFT JOIN (
                SELECT "jobRoleId", COUNT(DISTINCT "applicantId") AS scanned, COUNT(DISTINCT "applicantId") FILTER (WHERE eligible) AS matched
                FROM "matches_service"."RoleScan" GROUP BY "jobRoleId"
            ) s ON s."jobRoleId" = jr.id
            LEFT JOIN (
                SELECT "jobRoleId",
                       COUNT(*) FILTER (WHERE "applicantStatus" = 'approved' AND (eligible OR verdict = 'review')) AS applied,
                       COUNT(*) FILTER (WHERE decision = 'shortlisted') AS shortlisted,
                       COUNT(*) FILTER (WHERE decision = 'rejected') AS rejected
                FROM "matches_service"."Match" GROUP BY "jobRoleId"
            ) m ON m."jobRoleId" = jr.id
            ${where}
            ORDER BY jp."createdAt" DESC, jr.title ASC`;
    }

    /** Distinct applicants (one person counts once even if scanned for several roles). */
    private async totals(companyId: string | null): Promise<Totals> {
        const filter = companyId ? `WHERE jp."companyId" = $1` : '';
        const args = companyId ? [companyId] : [];
        const scan = await this.prisma.$queryRawUnsafe<{ scanned: number; matched: number }[]>(
            `SELECT COUNT(DISTINCT rs."applicantId")::int AS scanned,
                    (COUNT(DISTINCT rs."applicantId") FILTER (WHERE rs.eligible))::int AS matched
             FROM "matches_service"."RoleScan" rs
             JOIN "jobs_service"."JobRole" jr ON jr.id = rs."jobRoleId"
             JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId" ${filter}`,
            ...args,
        );
        const dec = await this.prisma.$queryRawUnsafe<{ applied: number; shortlisted: number; rejected: number }[]>(
            `SELECT (COUNT(DISTINCT m."applicantId") FILTER (WHERE m."applicantStatus" = 'approved' AND (m.eligible OR m.verdict = 'review')))::int AS applied,
                    (COUNT(DISTINCT m."applicantId") FILTER (WHERE m.decision = 'shortlisted'))::int AS shortlisted,
                    (COUNT(DISTINCT m."applicantId") FILTER (WHERE m.decision = 'rejected'))::int AS rejected
             FROM "matches_service"."Match" m
             JOIN "jobs_service"."JobRole" jr ON jr.id = m."jobRoleId"
             JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId" ${filter}`,
            ...args,
        );
        return {
            scanned: scan[0]?.scanned ?? 0,
            matched: scan[0]?.matched ?? 0,
            applied: dec[0]?.applied ?? 0,
            shortlisted: dec[0]?.shortlisted ?? 0,
            rejected: dec[0]?.rejected ?? 0,
        };
    }

    /**
     * Funnel per branch, counting DISTINCT applicants. The branch is the applicant's effective branch (contract §4.3):
     * admin-verified profile value, else the branch on their active resume, else the self-entered profile value.
     * Applicants without any branch fall into 'Unknown'.
     */
    async byBranch(): Promise<BranchStats[]> {
        return this.prisma.$queryRawUnsafe<BranchStats[]>(`
            WITH people AS (
                SELECT "applicantId" FROM "matches_service"."RoleScan"
                UNION
                SELECT "applicantId" FROM "matches_service"."Match"
            ),
            eff AS (
                SELECT p."applicantId",
                       COALESCE(
                           NULLIF(TRIM(CASE WHEN ap."academicVerified" THEN ap.branch END), ''),
                           NULLIF(TRIM(r.branch), ''),
                           NULLIF(TRIM(ap.branch), ''),
                           'Unknown'
                       ) AS branch
                FROM people p
                LEFT JOIN "users_service"."ApplicantProfile" ap ON ap."userId" = p."applicantId"
                LEFT JOIN LATERAL (
                    SELECT "parsedData"->>'branch' AS branch
                    FROM "resumes_service"."Resume"
                    WHERE "applicantId" = p."applicantId" AND status = 'parsed'
                      AND "confirmedAt" IS NOT NULL AND "supersededAt" IS NULL
                      AND "parsedData"->>'branch' IS NOT NULL
                    ORDER BY "confirmedAt" DESC LIMIT 1
                ) r ON TRUE
            )
            SELECT e.branch AS branch,
                   COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "matches_service"."RoleScan" rs WHERE rs."applicantId" = e."applicantId"))::int AS scanned,
                   COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "matches_service"."RoleScan" rs WHERE rs."applicantId" = e."applicantId" AND rs.eligible))::int AS matched,
                   COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "matches_service"."Match" m WHERE m."applicantId" = e."applicantId" AND m."applicantStatus" = 'approved' AND (m.eligible OR m.verdict = 'review')))::int AS applied,
                   COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "matches_service"."Match" m WHERE m."applicantId" = e."applicantId" AND m.decision = 'shortlisted'))::int AS shortlisted,
                   COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM \"matches_service\".\"Match\" m WHERE m.\"applicantId\" = e.\"applicantId\" AND m.decision = 'rejected'))::int AS rejected
            FROM eff e
            GROUP BY e.branch
            ORDER BY scanned DESC, e.branch ASC`);
    }

    async forCompany(companyId: string) {
        const [totals, roles] = await Promise.all([
            this.totals(companyId),
            this.prisma.$queryRawUnsafe<RoleStats[]>(this.roleRowsSql(`WHERE jp."companyId" = $1`), companyId),
        ]);
        return { totals, roles };
    }

    async forAdmin() {
        const [totals, roles, platform, byBranch] = await Promise.all([
            this.totals(null),
            this.prisma.$queryRawUnsafe<RoleStats[]>(this.roleRowsSql('')),
            this.prisma.$queryRawUnsafe<{ applicants: number; resumesScanned: number; jobs: number; stoppedJobs: number }[]>(`
                SELECT (SELECT COUNT(*) FROM "users_service"."ApplicantProfile")::int AS applicants,
                       (SELECT COUNT(*) FROM "resumes_service"."Resume" WHERE status = 'parsed')::int AS "resumesScanned",
                       (SELECT COUNT(*) FROM "jobs_service"."JobPosting")::int AS jobs,
                       (SELECT COUNT(*) FROM "jobs_service"."JobPosting" WHERE "stoppedAt" IS NOT NULL)::int AS "stoppedJobs"`),
            this.byBranch(),
        ]);

        // per-company roll-up (a person scanned for two of a company's roles counts twice here: it is a sum over roles)
        const byCompany = new Map<string, any>();
        for (const r of roles) {
            const key = r.companyId ?? 'unknown';
            const c = byCompany.get(key) ?? { companyId: key, companyName: r.companyName || 'Unnamed company', jobs: new Set<string>(), stoppedJobs: new Set<string>(), scanned: 0, matched: 0, applied: 0, shortlisted: 0, rejected: 0 };
            c.jobs.add(r.jobPostingId);
            if (r.stopped) c.stoppedJobs.add(r.jobPostingId);
            c.scanned += r.scanned; c.matched += r.matched; c.applied += r.applied; c.shortlisted += r.shortlisted; c.rejected += r.rejected;
            byCompany.set(key, c);
        }
        const companies = [...byCompany.values()]
            .map((c) => ({ ...c, jobs: c.jobs.size, stoppedJobs: c.stoppedJobs.size }))
            .sort((a, b) => b.applied - a.applied || b.matched - a.matched);

        return { platform: platform[0], totals, byBranch, companies, roles: roles.slice(0, 300) };
    }

    // ------------------------------------------------------------------ people behind the numbers

    private async ownedRole(jobRoleId: string, companyId: string) {
        const rows = await this.prisma.$queryRawUnsafe<{ title: string; companyId: string }[]>(
            `SELECT jr.title AS title, jp."companyId" AS "companyId"
             FROM "jobs_service"."JobRole" jr JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
             WHERE jr.id = $1`,
            jobRoleId,
        );
        if (rows.length === 0) throw new NotFoundException('Role not found');
        if (rows[0].companyId !== companyId) throw new ForbiddenException('This role belongs to another company');
        return rows[0];
    }

    /** The people behind one number of a dashboard. Admin: every stage. Company: only people who approved sharing. */
    async people(filters: PeopleFilters, viewer: PeopleViewer): Promise<PeoplePage> {
        if (!PEOPLE_STAGES.includes(filters.stage)) throw new BadRequestException('Unknown stage');
        if (viewer.role === 'COMPANY') {
            if (!COMPANY_PEOPLE_STAGES.includes(filters.stage)) {
                throw new ForbiddenException('Companies can only list applicants who approved sharing their resume');
            }
            if (filters.jobRoleId) await this.ownedRole(filters.jobRoleId, viewer.userId);
        }
        if (filters.stage === 'parsed' && (filters.jobRoleId || filters.companyId)) {
            throw new BadRequestException('Parsed resumes are not tied to a role or a company');
        }

        const page = clampPage(filters.page);
        const limit = clampLimit(filters.limit);
        const built = buildPeopleQuery({ ...filters, page, limit }, viewer);
        const [count, rows] = await Promise.all([
            this.prisma.$queryRawUnsafe<{ total: number }[]>(built.countSql, ...built.args),
            this.prisma.$queryRawUnsafe<Record<string, any>[]>(built.pageSql, ...built.args),
        ]);
        return {
            stage: filters.stage,
            total: count[0]?.total ?? 0,
            page,
            limit,
            distinct: isDistinctMode(filters, viewer),
            rows: rows.map(toPersonRow),
        };
    }

    /** Furthest stage of every person, for the Stage column / filter of the admin applicants page. */
    async applicantStages(): Promise<{ applicantId: string; stage: string }[]> {
        return this.prisma.$queryRawUnsafe<{ applicantId: string; stage: string }[]>(`
            SELECT ap."userId" AS "applicantId",
                   CASE
                     WHEN EXISTS (SELECT 1 FROM "matches_service"."Match" m WHERE m."applicantId" = ap."userId" AND m.decision = 'shortlisted') THEN 'shortlisted'
                     WHEN EXISTS (SELECT 1 FROM "matches_service"."Match" m WHERE m."applicantId" = ap."userId" AND m."applicantStatus" = 'approved' AND (m.eligible OR m.verdict = 'review') AND m.decision IS NULL) THEN 'applied'
                     WHEN EXISTS (SELECT 1 FROM "matches_service"."Match" m WHERE m."applicantId" = ap."userId" AND m.decision = 'rejected') THEN 'rejected'
                     WHEN EXISTS (SELECT 1 FROM "matches_service"."RoleScan" rs WHERE rs."applicantId" = ap."userId" AND rs.eligible) THEN 'matched'
                     WHEN EXISTS (SELECT 1 FROM "matches_service"."RoleScan" rs WHERE rs."applicantId" = ap."userId") THEN 'scanned'
                     WHEN EXISTS (SELECT 1 FROM "resumes_service"."Resume" r WHERE r."applicantId" = ap."userId" AND r.status = 'parsed') THEN 'parsed'
                     ELSE 'none'
                   END AS stage
            FROM "users_service"."ApplicantProfile" ap`);
    }

    /**
     * Company, scanned / matched: aggregate only. No names, no emails, because those people did not approve sharing.
     */
    async roleInsights(jobRoleId: string, companyId: string) {
        const role = await this.ownedRole(jobRoleId, companyId);
        const [counts, buckets, missing, branches] = await Promise.all([
            this.prisma.$queryRawUnsafe<{ scanned: number; matched: number }[]>(
                `WITH best AS (SELECT "applicantId", bool_or(eligible) AS eligible FROM "matches_service"."RoleScan" WHERE "jobRoleId" = $1 GROUP BY "applicantId")
                 SELECT COUNT(*)::int AS scanned, (COUNT(*) FILTER (WHERE eligible))::int AS matched FROM best`,
                jobRoleId,
            ),
            this.prisma.$queryRawUnsafe<{ bucket: number; count: number }[]>(
                `WITH best AS (SELECT "applicantId", MAX(score) AS score FROM "matches_service"."RoleScan" WHERE "jobRoleId" = $1 GROUP BY "applicantId")
                 SELECT LEAST(FLOOR(score * 5), 4)::int AS bucket, COUNT(*)::int AS count FROM best GROUP BY 1`,
                jobRoleId,
            ),
            this.prisma.$queryRawUnsafe<{ skill: string; count: number }[]>(
                `SELECT LOWER(TRIM(s)) AS skill, COUNT(*)::int AS count
                 FROM "matches_service"."Match" m, UNNEST(m."missingSkills") s
                 WHERE m."jobRoleId" = $1 AND TRIM(s) <> ''
                 GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 5`,
                jobRoleId,
            ),
            this.prisma.$queryRawUnsafe<{ branch: string; scanned: number; matched: number }[]>(
                `WITH best AS (SELECT "applicantId", bool_or(eligible) AS eligible FROM "matches_service"."RoleScan" WHERE "jobRoleId" = $1 GROUP BY "applicantId")
                 SELECT ${EFFECTIVE_BRANCH_SQL} AS branch, COUNT(*)::int AS scanned, (COUNT(*) FILTER (WHERE b.eligible))::int AS matched
                 FROM best b
                 LEFT JOIN "users_service"."ApplicantProfile" ap ON ap."userId" = b."applicantId"
                 ${resumeBranchJoin('b."applicantId"')}
                 GROUP BY 1 ORDER BY 2 DESC, 1 ASC`,
                jobRoleId,
            ),
        ]);
        const scanned = counts[0]?.scanned ?? 0;
        const matched = counts[0]?.matched ?? 0;
        const byBucket = new Map(buckets.map((b) => [b.bucket, b.count]));
        return {
            jobRoleId,
            roleTitle: role.title,
            scanned,
            matched,
            notMatched: Math.max(scanned - matched, 0),
            scoreBuckets: [0, 1, 2, 3, 4].map((i) => ({ from: i * 20, to: (i + 1) * 20, count: byBucket.get(i) ?? 0 })),
            topMissingSkills: missing,
            byBranch: branches,
        };
    }

    /** Export of a people list holds personal data (emails): leave a trace in the audit log. */
    async logPeopleExport(actorId: string, meta: { stage: string; rows: number; jobRoleId?: string; companyId?: string; branch?: string }) {
        await writeAudit({ actorId, action: 'export.people', target: meta.stage, meta });
        return { ok: true };
    }
}
