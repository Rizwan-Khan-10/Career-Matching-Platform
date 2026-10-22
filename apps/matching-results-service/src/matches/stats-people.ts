import { targetLabel } from './target-label';

/**
 * Drill-down behind the dashboard numbers: the real people of each stage.
 * One SQL builder per kind of stage so the list always uses the SAME conditions as the counts in stats.service.ts
 * (the "counts equal list" test in stats.service.spec.ts keeps both honest).
 */
export const PEOPLE_STAGES = ['parsed', 'scanned', 'matched', 'applied', 'shortlisted', 'rejected'] as const;
export type PeopleStage = (typeof PEOPLE_STAGES)[number];

/** Stages a company may list (the person approved sharing). Scanned / matched are aggregate-only for a company. */
export const COMPANY_PEOPLE_STAGES: PeopleStage[] = ['applied', 'shortlisted', 'rejected'];

export const PEOPLE_SORTS = ['score', 'name', 'date'] as const;
export type PeopleSort = (typeof PEOPLE_SORTS)[number];

export const MAX_PEOPLE_LIMIT = 100;
export const DEFAULT_PEOPLE_LIMIT = 25;

export interface PeopleFilters {
    stage: PeopleStage;
    jobRoleId?: string;
    companyId?: string;
    branch?: string;
    q?: string;
    page?: number;
    limit?: number;
    sort?: PeopleSort;
}

export type PeopleViewer = { role: 'ADMIN' } | { role: 'COMPANY'; userId: string };

export interface PeopleResume {
    resumeId: string | null;
    targetLabel: string | null;
    status: string | null;       // parse status of the resume ('parsed' ...)
    parsedAt: string | null;
    hasPdf: boolean;
    summary: { skills: string[]; education: string | null; projects: string[] } | null; // only when the PDF was not shared
}

export interface PersonRow {
    applicantId: string;
    name: string | null;
    email: string | null;         // admin only
    phone: string | null;         // admin only
    headline: string | null;
    location: string | null;
    branch: string;
    cgpa: number | null;
    passingYear: number | null;
    backlogs: number | null;
    academicVerified: boolean;
    roleId: string | null;
    roleTitle: string | null;
    companyId: string | null;
    companyName: string | null;
    score: number | null;
    eligible: boolean | null;
    matchedSkills: string[];
    missingSkills: string[];
    unverifiedRules: string[];
    scannedAt: string | null;
    approvedAt: string | null;
    decidedAt: string | null;
    decision: 'shortlisted' | 'rejected' | null;
    rejectReason: string | null;
    rejectMessage: string | null;
    resume: PeopleResume;
}

export interface PeoplePage {
    stage: PeopleStage;
    total: number;
    page: number;
    limit: number;
    /** true = one row per person (the dashboard cards count distinct people), false = one row per (role, person) */
    distinct: boolean;
    rows: PersonRow[];
}

/** Effective branch rule, identical to byBranch(): verified profile > active resume > self-entered > 'Unknown'. */
export const EFFECTIVE_BRANCH_SQL = `COALESCE(
    NULLIF(TRIM(CASE WHEN ap."academicVerified" THEN ap.branch END), ''),
    NULLIF(TRIM(rb.branch), ''),
    NULLIF(TRIM(ap.branch), ''),
    'Unknown'
)`;

/** Branch written on the person's active (confirmed, not superseded) parsed resume; joined as `rb`. */
export const resumeBranchJoin = (applicantExpr: string) => `
    LEFT JOIN LATERAL (
        SELECT "parsedData"->>'branch' AS branch
        FROM "resumes_service"."Resume"
        WHERE "applicantId" = ${applicantExpr} AND status = 'parsed'
          AND "confirmedAt" IS NOT NULL AND "supersededAt" IS NULL
          AND "parsedData"->>'branch' IS NOT NULL
        ORDER BY "confirmedAt" DESC LIMIT 1
    ) rb ON TRUE`;

/** Escapes % _ \ so the search text is matched literally by ILIKE. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const clampLimit = (limit?: number) => Math.min(Math.max(Math.trunc(limit || DEFAULT_PEOPLE_LIMIT), 1), MAX_PEOPLE_LIMIT);
export const clampPage = (page?: number) => Math.max(Math.trunc(page || 1), 1);

/** Does this query list one row per person (like the cards) or one row per (role, person) (like the role / company rows)? */
export function isDistinctMode(f: PeopleFilters, viewer: PeopleViewer): boolean {
    if (f.stage === 'parsed') return false; // one row per parsed resume
    if (f.jobRoleId) return false;
    // admin with a company filter: the company row of the table is a SUM over roles, so list per role
    if (viewer.role === 'ADMIN') return !f.companyId;
    return true; // a company's own totals are distinct applicants
}

interface Built {
    countSql: string;
    pageSql: string;
    args: unknown[];
}

const PERSON_COLUMNS = (isAdmin: boolean) => `
        ap.name AS name,
        ${isAdmin ? 'u.email' : 'NULL::text'} AS email,
        ${isAdmin ? 'ap.phone' : 'NULL::text'} AS phone,
        ap.headline AS headline, ap.location AS location,
        ${EFFECTIVE_BRANCH_SQL} AS branch,
        ap.cgpa AS cgpa, ap."passingYear" AS "passingYear", ap.backlogs AS backlogs,
        COALESCE(ap."academicVerified", false) AS "academicVerified"`;

const ORDER_BY: Record<PeopleSort, string> = {
    score: `p.score DESC NULLS LAST, p.name ASC NULLS LAST, p."applicantId", p."roleId"`,
    name: `p.name ASC NULLS LAST, p.score DESC NULLS LAST, p."applicantId", p."roleId"`,
    date: `COALESCE(p."decidedAt", p."approvedAt", p."scannedAt", p."resumeParsedAt") DESC NULLS LAST, p."applicantId", p."roleId"`,
};

function baseCte(stage: Exclude<PeopleStage, 'parsed'>): string {
    switch (stage) {
        case 'scanned':
        case 'matched':
            // one row per (role, person) even when the person has two resumes (the counts are DISTINCT applicants)
            return `SELECT DISTINCT ON (rs."jobRoleId", rs."applicantId")
                        rs."jobRoleId", rs."applicantId", rs."resumeId" AS "baseResumeId", rs.score, rs.eligible
                    FROM "matches_service"."RoleScan" rs
                    ${stage === 'matched' ? 'WHERE rs.eligible' : ''}
                    ORDER BY rs."jobRoleId", rs."applicantId", rs.score DESC, rs."scannedAt" DESC`;
        case 'applied':
            return `SELECT m."jobRoleId", m."applicantId", m."resumeId" AS "baseResumeId", m.score, m.eligible
                    FROM "matches_service"."Match" m
                    WHERE m."applicantStatus" = 'approved' AND (m.eligible OR m.verdict = 'review')`;
        case 'shortlisted':
            return `SELECT m."jobRoleId", m."applicantId", m."resumeId" AS "baseResumeId", m.score, m.eligible
                    FROM "matches_service"."Match" m WHERE m.decision = 'shortlisted'`;
        case 'rejected':
            return `SELECT m."jobRoleId", m."applicantId", m."resumeId" AS "baseResumeId", m.score, m.eligible
                    FROM "matches_service"."Match" m WHERE m.decision = 'rejected'`;
    }
}

/** Builds the count + page queries. All user input goes in as $n parameters, never concatenated. */
export function buildPeopleQuery(f: PeopleFilters, viewer: PeopleViewer): Built {
    const isAdmin = viewer.role === 'ADMIN';
    const args: unknown[] = [];
    const arg = (v: unknown) => {
        args.push(v);
        return `$${args.length}`;
    };

    const where: string[] = [];
    if (viewer.role === 'COMPANY') where.push(`jp."companyId" = ${arg(viewer.userId)}`);
    else if (f.companyId) where.push(`jp."companyId" = ${arg(f.companyId)}`);
    if (f.jobRoleId) where.push(`jr.id = ${arg(f.jobRoleId)}`);

    const searchText = f.q?.trim();
    const searchSql = (applicantNameExpr: string, branchExpr: string) => {
        if (!searchText) return null;
        const p = arg(likePattern(searchText));
        const parts = [`${applicantNameExpr} ILIKE ${p}`, `${branchExpr} ILIKE ${p}`];
        if (isAdmin) parts.push(`u.email ILIKE ${p}`);
        return `(${parts.join(' OR ')})`;
    };

    let joined: string;
    if (f.stage === 'parsed') {
        // one row per successfully parsed resume (the "Resumes scanned" card)
        const parsedWhere: string[] = [`r.status = 'parsed'`];
        if (f.branch) parsedWhere.push(`${EFFECTIVE_BRANCH_SQL} = ${arg(f.branch)}`);
        const s = searchSql('ap.name', EFFECTIVE_BRANCH_SQL);
        if (s) parsedWhere.push(s);
        joined = `
            SELECT r."applicantId" AS "applicantId",
                ${PERSON_COLUMNS(isAdmin)},
                NULL::text AS "roleId", NULL::text AS "roleTitle", NULL::text AS "companyId", NULL::text AS "companyName",
                NULL::float8 AS score, NULL::boolean AS eligible,
                '{}'::text[] AS "matchedSkills", '{}'::text[] AS "missingSkills", '{}'::text[] AS "unverifiedRules",
                NULL::timestamp AS "scannedAt", NULL::timestamp AS "approvedAt", NULL::timestamp AS "decidedAt",
                NULL::text AS decision, NULL::text AS "rejectReason", NULL::text AS "rejectMessage",
                r.id AS "resumeId", r."targetTrack" AS "targetTrack", r."targetStack" AS "targetStack",
                r.status AS "resumeStatus", r."updatedAt" AS "resumeParsedAt",
                false AS "hasPdf", r."parsedData" AS "parsedData"
            FROM "resumes_service"."Resume" r
            LEFT JOIN "users_service"."ApplicantProfile" ap ON ap."userId" = r."applicantId"
            LEFT JOIN "auth_service"."User" u ON u.id = r."applicantId"
            ${resumeBranchJoin('r."applicantId"')}
            WHERE ${parsedWhere.join(' AND ')}`;
    } else {
        if (f.branch) where.push(`${EFFECTIVE_BRANCH_SQL} = ${arg(f.branch)}`);
        const s = searchSql('ap.name', EFFECTIVE_BRANCH_SQL);
        if (s) where.push(s);
        joined = `
            SELECT b."applicantId" AS "applicantId",
                ${PERSON_COLUMNS(isAdmin)},
                jr.id AS "roleId", jr.title AS "roleTitle", jp."companyId" AS "companyId", cp.name AS "companyName",
                b.score AS score, b.eligible AS eligible,
                COALESCE(m."matchedSkills", '{}') AS "matchedSkills",
                COALESCE(m."missingSkills", '{}') AS "missingSkills",
                COALESCE(m."unverifiedRules", '{}') AS "unverifiedRules",
                (SELECT MAX(rs."scannedAt") FROM "matches_service"."RoleScan" rs
                  WHERE rs."jobRoleId" = b."jobRoleId" AND rs."applicantId" = b."applicantId") AS "scannedAt",
                m."approvedAt" AS "approvedAt", m."decidedAt" AS "decidedAt",
                m.decision AS decision,
                m."rejectReason" AS "rejectReason",
                m."rejectMessage" AS "rejectMessage",
                r.id AS "resumeId", r."targetTrack" AS "targetTrack", r."targetStack" AS "targetStack",
                r.status AS "resumeStatus", r."updatedAt" AS "resumeParsedAt",
                (m."applicantStatus" = 'approved' AND m."resumeStatus" = 'ready' AND r."pdfPublicId" IS NOT NULL) AS "hasPdf",
                ${isAdmin ? 'r."parsedData"' : 'NULL::jsonb'} AS "parsedData"
            FROM base b
            JOIN "jobs_service"."JobRole" jr ON jr.id = b."jobRoleId"
            JOIN "jobs_service"."JobPosting" jp ON jp.id = jr."jobPostingId"
            LEFT JOIN "users_service"."CompanyProfile" cp ON cp."userId" = jp."companyId"
            LEFT JOIN "matches_service"."Match" m ON m."applicantId" = b."applicantId" AND m."jobRoleId" = b."jobRoleId"
            LEFT JOIN "users_service"."ApplicantProfile" ap ON ap."userId" = b."applicantId"
            LEFT JOIN "auth_service"."User" u ON u.id = b."applicantId"
            ${resumeBranchJoin('b."applicantId"')}
            LEFT JOIN "resumes_service"."Resume" r ON r.id = COALESCE(m."resumeId", b."baseResumeId")
            ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
    }

    const withBase = f.stage === 'parsed' ? '' : `base AS (${baseCte(f.stage)}),`;
    const distinct = isDistinctMode(f, viewer);
    const picked = distinct
        ? `SELECT DISTINCT ON (j."applicantId") j.* FROM joined j ORDER BY j."applicantId", j.score DESC NULLS LAST`
        : `SELECT j.* FROM joined j`;
    const cte = `WITH ${withBase} joined AS (${joined}), picked AS (${picked})`;

    const sort = f.sort && ORDER_BY[f.sort] ? f.sort : f.stage === 'parsed' ? 'date' : 'score';
    const limit = clampLimit(f.limit);
    const offset = (clampPage(f.page) - 1) * limit;

    return {
        args,
        countSql: `${cte} SELECT COUNT(*)::int AS total FROM picked`,
        pageSql: `${cte} SELECT p.* FROM picked p ORDER BY ${ORDER_BY[sort]} LIMIT ${limit} OFFSET ${offset}`,
    };
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null);

/** Trimmed text version of a parsed resume, shown when there is no shared PDF yet. */
export function summarizeParsed(parsed: unknown): PeopleResume['summary'] {
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as { skills?: unknown; education?: unknown; projects?: unknown };
    const skills = Array.isArray(p.skills) ? p.skills.filter((s): s is string => typeof s === 'string').slice(0, 25) : [];
    const projects = Array.isArray(p.projects)
        ? p.projects
              .map((x) => (x && typeof x === 'object' ? String((x as { name?: unknown }).name ?? '').trim() : ''))
              .filter(Boolean)
              .slice(0, 6)
        : [];
    const education = typeof p.education === 'string' && p.education.trim() ? p.education.trim() : null;
    if (skills.length === 0 && projects.length === 0 && !education) return null;
    return { skills, education, projects };
}

export function toPersonRow(raw: Record<string, any>): PersonRow {
    const hasPdf = Boolean(raw.hasPdf);
    return {
        applicantId: raw.applicantId,
        name: raw.name ?? null,
        email: raw.email ?? null,
        phone: raw.phone ?? null,
        headline: raw.headline ?? null,
        location: raw.location ?? null,
        branch: raw.branch ?? 'Unknown',
        cgpa: raw.cgpa ?? null,
        passingYear: raw.passingYear ?? null,
        backlogs: raw.backlogs ?? null,
        academicVerified: Boolean(raw.academicVerified),
        roleId: raw.roleId ?? null,
        roleTitle: raw.roleTitle ?? null,
        companyId: raw.companyId ?? null,
        companyName: raw.companyName ?? null,
        score: raw.score ?? null,
        eligible: raw.eligible ?? null,
        matchedSkills: raw.matchedSkills ?? [],
        missingSkills: raw.missingSkills ?? [],
        unverifiedRules: raw.unverifiedRules ?? [],
        scannedAt: iso(raw.scannedAt),
        approvedAt: iso(raw.approvedAt),
        decidedAt: iso(raw.decidedAt),
        decision: raw.decision === 'shortlisted' || raw.decision === 'rejected' ? raw.decision : null,
        rejectReason: raw.rejectReason ?? null,
        rejectMessage: raw.rejectMessage ?? null,
        resume: {
            resumeId: raw.resumeId ?? null,
            targetLabel: raw.targetTrack ? targetLabel(raw.targetTrack, raw.targetStack ?? 'other') : null,
            status: raw.resumeStatus ?? null,
            parsedAt: iso(raw.resumeParsedAt),
            hasPdf,
            summary: hasPdf ? null : summarizeParsed(raw.parsedData),
        },
    };
}
