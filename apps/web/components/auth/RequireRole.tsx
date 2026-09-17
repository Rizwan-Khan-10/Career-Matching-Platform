'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export function RequireRole({
  role,
  children,
}: {
  role: 'ADMIN' | 'COMPANY' | 'APPLICANT';
  children: React.ReactNode;
}) {
  const { token, role: userRole, hasHydrated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!token) router.replace('/login');
    else if (userRole !== role) router.replace('/');
  }, [hasHydrated, token, userRole, role, router]);

  if (!hasHydrated || !token || userRole !== role) return null;

  return <>{children}</>;
}