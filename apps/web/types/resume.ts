export type ResumeStatus = 'pending' | 'parsed' | 'failed';

export interface ResumeProject {
  name: string;
  description: string;
}

export interface ResumeExperience {
  title: string;
  company?: string;
  startDate?: string | null;
  endDate?: string | null;
  description?: string;
}

export interface ParsedResumeData {
  currentTitle?: string | null;
  summary?: string | null;
  skills?: string[];
  projects?: ResumeProject[];
  experience?: ResumeExperience[];
  certifications?: string[];
  education?: string | null;
  cgpa?: number | null;
  experienceYears?: number | null;
  branch?: string | null;
  passingYear?: number | null;
  backlogs?: number | null;
  error?: string;
}

export interface Resume {
  id: string;
  status: ResumeStatus;
  fileUrl: string;
  parsedData: ParsedResumeData | null;
  createdAt: string;
  // contract 4.9 / 5.4
  targetTrack?: string;
  targetStack?: string;
  targetLabel?: string; // e.g. "Backend · Java"
  confirmedAt?: string | null;
  supersededAt?: string | null;
}