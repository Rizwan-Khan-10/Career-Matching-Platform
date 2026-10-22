'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Logo } from '@/components/ui/Logo';

export default function Home() {
  const router = useRouter();
  const { token, role } = useAuthStore();

  useEffect(() => {
    if (!token) router.replace('/login');
    else if (role === 'APPLICANT') router.replace('/applicant/dashboard');
    else if (role === 'COMPANY') router.replace('/company/dashboard');
    else if (role === 'ADMIN') router.replace('/admin/dashboard');
  }, [token, role, router]);

  // shown for the moment the redirect takes, instead of a white flash
  return (
    <div role="status" className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4">
      <Logo />
      <Loader2 className="size-5 text-ink-grey animate-spin motion-reduce:animate-none" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
