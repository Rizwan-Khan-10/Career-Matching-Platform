'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { RegistrationModeInfo } from '@/types/auth';

export function useRegistrationMode() {
  return useQuery<RegistrationModeInfo>({
    queryKey: ['auth', 'registration-mode'], // same key the admin settings page invalidates
    queryFn: () => apiClient.get('/auth/registration-mode').then((r) => r.data),
    staleTime: 60_000,
    retry: false, // if this fails the pages show the normal form; the server still enforces the mode
  });
}