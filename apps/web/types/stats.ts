export interface Totals {
    scanned: number;     // distinct applicants the matching engine evaluated
    matched: number;     // ... of which were eligible
    applied: number;     // ... of which approved sharing their resume with the company
    shortlisted: number; // recruiter shortlisted
    rejected: number;    // recruiter rejected
}

export interface RoleStats extends Omit<Totals, never> {
    jobRoleId: string;
    roleTitle: string;
    jobPostingId: string;
    companyId?: string;
    companyName?: string | null;
    stopped: boolean;
}

export interface CompanyStats {
    totals: Totals;
    roles: RoleStats[];
}

export interface AdminCompanyRow extends Totals {
    companyId: string;
    companyName: string;
    jobs: number;
    stoppedJobs: number;
}

// contract 5.6: GET /stats/admin -> byBranch (effective branch, contract 4.3)
export interface BranchStats {
    branch: string | null;
    scanned: number;
    matched: number;
    applied: number;
    shortlisted: number;
    rejected?: number; // missing on an older backend
}

export interface AdminStats {
    platform: { applicants: number; resumesScanned: number; jobs: number; stoppedJobs: number };
    totals: Totals;
    companies: AdminCompanyRow[];
    roles: RoleStats[];
    byBranch?: BranchStats[]; // missing on an older backend
}

// ---- the people behind the numbers: GET /stats/admin/people and GET /stats/company/people
export type PeopleStage = 'parsed' | 'scanned' | 'matched' | 'applied' | 'shortlisted' | 'rejected';

export interface PeopleFilters {
    stage: PeopleStage;
    jobRoleId?: string;
    companyId?: string;
    branch?: string;
}

export interface PersonResume {
    resumeId: string | null;
    targetLabel: string | null;
    status: string | null;
    parsedAt: string | null;
    hasPdf: boolean;
    summary: { skills: string[]; education: string | null; projects: string[] } | null;
}

export interface PersonRowData {
    applicantId: string;
    name: string | null;
    email: string | null;   // admin only
    phone: string | null;   // admin only
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
    resume: PersonResume;
}

export interface PeoplePageData {
    stage: PeopleStage;
    total: number;
    page: number;
    limit: number;
    distinct: boolean;
    rows: PersonRowData[];
}

// GET /stats/company/roles/:id/insights (scanned / matched, no names)
export interface RoleInsights {
    jobRoleId: string;
    roleTitle: string;
    scanned: number;
    matched: number;
    notMatched: number;
    scoreBuckets: { from: number; to: number; count: number }[];
    topMissingSkills: { skill: string; count: number }[];
    byBranch: { branch: string; scanned: number; matched: number }[];
}

// GET /stats/admin/applicant-stages
export type ApplicantStage = PeopleStage | 'none';
export interface ApplicantStageRow {
    applicantId: string;
    stage: ApplicantStage;
}
