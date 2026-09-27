export type ResumeStatus = 'pending' | 'parsed' | 'failed';

export interface ResumeProject {
  name: string;
  description: string;
}

export interface ParsedResumeData {
  skills?: string[];
  projects?: ResumeProject[];
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