export interface RoleStats {
  jobRoleId: string;
  roleTitle: string;
  scanned: number;
  matched: number;
  applied: number;
  stopped: boolean;
}

export interface StatTotals {
  scanned: number;
  matched: number;
  applied: number;
  shortlisted: number;
}

export interface CompanyStats {
  totals: StatTotals;
  roles: RoleStats[];
}

