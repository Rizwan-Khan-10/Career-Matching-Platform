'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { CompanyProfile, CompanyStatus } from '@/types/company';

// same query key as the company dashboard, so both share one cached request
export function useCompanyProfile() {
  return useQuery<CompanyProfile>({
    queryKey: ['companyProfile'],
    queryFn: () => apiClient.get('/companies/me').then((r) => r.data),
  });
}

/** Rows created before this feature have no status and count as approved. */
export function useCompanyStatus(): { status: CompanyStatus; canManage: boolean } {
  const { data } = useCompanyProfile();
  const status = data?.status ?? 'approved';
  return { status, canManage: status === 'approved' };
}