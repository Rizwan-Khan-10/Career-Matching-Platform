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
  error?: string;
}

export interface Resume {
  id: string;
  status: ResumeStatus;
  fileUrl: string;
  parsedData: ParsedResumeData | null;
  createdAt: string;
}