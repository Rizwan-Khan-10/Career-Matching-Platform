import type { RegistrationMode } from '@/types/auth';

// contract 5.1: GET / PUT /auth/admin/settings
export interface AdminSettings {
  registrationMode: RegistrationMode;
  allowedDomains: string[];
  companyApprovalRequired: boolean;
  jobApprovalRequired: boolean;
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