'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';

export default function AdminDashboard() {
  const { data: companies } = useQuery({
    queryKey: ['adminCompanies'],
    queryFn: () => apiClient.get('/admin/companies').then((r) => r.data),
  });
  const { data: applicants } = useQuery({
    queryKey: ['adminApplicants'],
    queryFn: () => apiClient.get('/admin/applicants').then((r) => r.data),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Admin Dashboard</h1>
      <p className="text-sm text-ink-grey mb-6">Platform overview.</p>

      <div className="grid grid-cols-2 gap-4">
        <Link
          href="/admin/companies"
          className="bg-paper-raised border border-hairline rounded-xl p-5 hover:border-accent transition-colors"
        >
          <p className="text-3xl font-heading font-bold text-ink">{companies?.length ?? '—'}</p>
          <p className="text-sm text-ink-grey mt-1">Companies</p>
        </Link>
        <Link
          href="/admin/applicants"
          className="bg-paper-raised border border-hairline rounded-xl p-5 hover:border-accent transition-colors"
        >
          <p className="text-3xl font-heading font-bold text-ink">{applicants?.length ?? '—'}</p>
          <p className="text-sm text-ink-grey mt-1">Applicants</p>
        </Link>
      </div>
    </div>
  );
}