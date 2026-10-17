export interface JobRole {
  id: string;
  title: string;
  description?: string;
  requirements?: string;
  stopped?: boolean;
  createdAt: string;
}

export interface JobPosting {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  errorMessage?: string;
  stoppedAt?: string | null;
  roles: JobRole[];
  createdAt: string;
}

