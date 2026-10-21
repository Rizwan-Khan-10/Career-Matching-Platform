import type { RegistrationMode } from '@/types/auth';
import type { CompanyStatus } from '@/types/company';
import type { JobApprovalStatus } from '@/types/job';

// contract 5.1: GET / PUT /auth/admin/settings
export interface AdminSettings {
  registrationMode: RegistrationMode;
  allowedDomains: string[];
  companyApprovalRequired: boolean;
  jobApprovalRequired: boolean;
  requireTwoFactorForAdmin: boolean;
  emailVerificationRequired: boolean;
}

// contract 5.1: one element of POST /auth/admin/users/import { users: [...] }
export interface ImportUser {
  email: string;
  role: 'APPLICANT' | 'COMPANY';
  name?: string;
  cgpa?: number;
  branch?: string;
  passingYear?: number;
  backlogs?: number;
}

export interface ImportResult {
  created: { email: string; id: string }[];
  skipped: { email: string; reason: string }[];
}

// contract 5.2: GET /admin/companies. status / isActive / email are new; old rows may miss them (= approved / active)
export interface AdminCompany {
  id: string;
  userId: string; // used by PATCH /admin/companies/:userId/status and by /auth/admin/users/:id
  name: string;
  email?: string;
  industry: string | null;
  contact: string | null;
  status?: CompanyStatus;
  isActive?: boolean;
  createdAt: string;
}

// contract 5.2: GET /admin/applicants
export interface AdminApplicant {
  id: string;
  userId: string;
  name: string;
  email?: string;
  education: string | null;
  isActive?: boolean;
  cgpa?: number | null;
  branch?: string | null;
  passingYear?: number | null;
  backlogs?: number | null;
  academicVerified?: boolean; // true = imported by an admin, locked for the applicant (contract 4.3)
  createdAt: string;
}

// contract 5.5: GET /jobs/admin/pending (item shape is not written in the contract: companyName and fileUrl are assumed)
export interface PendingJob {
  id: string;
  companyId: string;
  companyName?: string | null;
  fileUrl: string;
  createdAt: string;
  approvalStatus?: JobApprovalStatus;
}

// contract 5.2: GET /admin/health
export interface HealthStream {
  name: string; // e.g. "resume.uploaded"; dead letters live in "<name>.dead"
  length: number;
  deadLength: number; // messages that failed after all retries
}

export interface SystemHealth {
  streams: HealthStream[];
}

// contract 5.2: GET /admin/audit?limit=50
export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  target: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  actorName?: string | null;   // resolved by the backend; missing on an older backend
  targetLabel?: string | null; // e.g. "Company: Acme Ltd"
}