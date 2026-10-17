export type CompanyStatus = 'pending' | 'approved' | 'rejected';

export interface CompanyProfile {
  name?: string | null;
  status?: CompanyStatus; // missing on old rows = approved
  [key: string]: unknown;
}