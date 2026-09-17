'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function Home() {
  const router = useRouter();
  const { token, role } = useAuthStore();

  useEffect(() => {
    if (!token) router.replace('/login');
    else if (role === 'APPLICANT') router.replace('/applicant/dashboard');
    else if (role === 'COMPANY') router.replace('/company/dashboard');
    else if (role === 'ADMIN') router.replace('/admin/dashboard');
  }, [token, role, router]);

  return null;
}