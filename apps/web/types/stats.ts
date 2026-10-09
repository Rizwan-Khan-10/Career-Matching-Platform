export interface Totals {
    scanned: number;     // distinct applicants the matching engine evaluated
    matched: number;     // ... of which were eligible
    applied: number;     // ... of which approved sharing their resume with the company
    shortlisted: number; // recruiter shortlisted
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

export interface AdminStats {
    platform: { applicants: number; resumesScanned: number; jobs: number; stoppedJobs: number };
    totals: Totals;
    companies: AdminCompanyRow[];
    roles: RoleStats[];
}