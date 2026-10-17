'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { FadeIn } from '@/components/motion/FadeIn';
import { CompanyRow, COMPANIES_KEY } from '@/components/admin/CompanyRow';
import { ListToolbar } from '@/components/admin/ListToolbar';
import type { AdminCompany } from '@/types/admin';
import type { CompanyStatus } from '@/types/company';

const PAGE_SIZE = 50;
const ORDER: Record<CompanyStatus, number> = { pending: 0, approved: 1, rejected: 2 };
const statusOf = (c: AdminCompany): CompanyStatus => c.status ?? 'approved';

export default function AdminCompaniesPage() {
  const { data, isLoading, isError, refetch } = useQuery<AdminCompany[]>({
    queryKey: COMPANIES_KEY,
    queryFn: () => apiClient.get('/admin/companies').then((r) => r.data),
  });
  const [tab, setTab] = useState<'all' | CompanyStatus>('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const all = data ?? [];
  const count = (status: CompanyStatus) => all.filter((c) => statusOf(c) === status).length;
  const q = search.trim().toLowerCase();
  // companies waiting for a decision come first
  const filtered = all
    .filter((c) => (tab === 'all' || statusOf(c) === tab) && (!q || `${c.name} ${c.email ?? ''}`.toLowerCase().includes(q)))
    .sort((a, b) => ORDER[statusOf(a)] - ORDER[statusOf(b)] || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="max-w-4xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Companies</h1>
      <p className="text-sm text-ink-grey mb-6">
        Approve or reject companies, and deactivate or delete their accounts. A company that is not approved cannot upload jobs.
      </p>

      <ListToolbar
        search={search}
        onSearch={(v) => { setSearch(v); setVisible(PAGE_SIZE); }}
        placeholder="Search by name or email"
        tabs={[
          { id: 'all', label: 'All', count: all.length },
          { id: 'pending', label: 'Pending', count: count('pending') },
          { id: 'approved', label: 'Approved', count: count('approved') },
          { id: 'rejected', label: 'Rejected', count: count('rejected') },
        ]}
        active={tab}
        onTab={(id) => { setTab(id as 'all' | CompanyStatus); setVisible(PAGE_SIZE); }}
      />

      {isLoading && <div className="h-40 rounded-xl bg-paper-raised border border-hairline animate-pulse" />}

      {isError && (
        <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-xl px-4 py-3">
          <span>Couldn&apos;t load the companies.</span>
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
          {filtered.length === 0 && (
            <p className="text-sm text-ink-grey p-4">
              {all.length === 0 ? 'No companies registered yet.' : 'No companies match this filter.'}
            </p>
          )}
          {filtered.slice(0, visible).map((company, i) => (
            <FadeIn key={company.id} delay={Math.min(i, 10) * 0.03}>
              <div className={i > 0 ? 'border-t border-hairline' : ''}>
                <CompanyRow company={company} />
              </div>
            </FadeIn>
          ))}
        </div>
      )}

      {filtered.length > visible && (
        <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="mt-3 text-sm font-medium text-accent hover:underline">
          Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
        </button>
      )}
    </div>
  );
}