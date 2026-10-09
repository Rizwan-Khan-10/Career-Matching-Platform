export type JobPostingStatus = 'pending' | 'extracted' | 'failed';

export interface JobRoleRequirements {
  title?: string;
  summary?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  minExperienceYears?: number | null;
  qualifications?: string | null;
  responsibilities?: string[];
  seniority?: string | null;
  location?: string | null;
  employmentType?: string | null;
}

export interface JobRole {
  id: string;
  jobPostingId: string;
  title: string;
  requirements: JobRoleRequirements | null;
  createdAt: string;
}

export interface JobPosting {
  id: string;
  status: JobPostingStatus;
  fileUrl: string;
  errorMessage?: string | null;
  stoppedAt?: string | null; // set = company stopped this job (no scanning, no matching)
  createdAt: string;
  roles: JobRole[];
}