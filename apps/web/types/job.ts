export type JobPostingStatus = 'pending' | 'extracted' | 'failed';
export type JobApprovalStatus = 'approved' | 'pending' | 'rejected'; // contract 4.6
export type RoleLevel = 'fresher' | 'experienced' | 'any'; // contract 4.1

export interface JobRoleRequirements {
  title?: string;
  summary?: string | null;
  requiredSkills?: string[];
  preferredSkills?: string[];
  minExperienceYears?: number | null;
  maxExperienceYears?: number | null; // company's upper bound; empty = no limit
  strictMinExperience?: boolean | null; // true = below the minimum is rejected outright (no soft rule)
  qualifications?: string | null;
  responsibilities?: string[];
  seniority?: string | null;
  location?: string | null;
  employmentType?: string | null;
  level?: RoleLevel | null;
  track?: string | null;
  stacks?: string[] | null;
  minCgpa?: number | null;
  allowedBranches?: string[] | null;
  passingYears?: number[] | null;
  maxBacklogs?: number | null;
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
  approvalStatus?: JobApprovalStatus; // contract 4.6; missing on old rows = approved
  approvalNote?: string | null;
  createdAt: string;
  roles: JobRole[];
}