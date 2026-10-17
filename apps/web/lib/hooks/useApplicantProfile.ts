'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ApplicantProfile } from '@/types/profile';

// same query key as the dashboard and the profile modal, so they share one cached request
export function useApplicantProfile() {
  return useQuery<ApplicantProfile>({
    queryKey: ['applicantProfile'],
    queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
  });
}