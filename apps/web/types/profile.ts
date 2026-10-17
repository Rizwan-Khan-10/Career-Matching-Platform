export interface ApplicantProfile {
  name?: string | null;
  phone?: string | null;
  education?: string | null;
  headline?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  avatarUrl?: string | null;
  // contract 4.3
  cgpa?: number | null;
  branch?: string | null;
  passingYear?: number | null;
  backlogs?: number | null;
  academicVerified?: boolean; // true = imported by admin CSV, locked for the applicant
}