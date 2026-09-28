export type JobPostingStatus = 'pending' | 'extracted' | 'failed';

export interface JobRoleRequirements {
  title?: string;
  requiredSkills?: string[];
  minExperienceYears?: number | null;
  qualifications?: string | null;
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
  createdAt: string;
  roles: JobRole[];
}