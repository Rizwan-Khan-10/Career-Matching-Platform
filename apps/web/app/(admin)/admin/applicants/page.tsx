'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { FadeIn } from '@/components/motion/FadeIn';
import { ApplicantRow, APPLICANTS_KEY } from '@/components/admin/ApplicantRow';
import { ListToolbar } from '@/components/admin/ListToolbar';
import type { AdminApplicant } from '@/types/admin';

const PAGE_SIZE = 50;
type Tab = 'all' | 'active' | 'inactive';

export default function AdminApplicantsPage() {
  const { data, isLoading, isError, refetch } = useQuery<AdminApplicant[]>({
    queryKey: APPLICANTS_KEY,
    queryFn: () => apiClient.get('/admin/applicants').then((r) => r.data),
  });
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const all = data ?? [];
  const inactive = all.filter((a) => a.isActive === false).length;
  const q = search.trim().toLowerCase();
  const filtered = all
    .filter((a) => {
      const isActive = a.isActive !== false;
      if (tab === 'active' && !isActive) return false;
      if (tab === 'inactive' && isActive) return false;
      return !q || `${a.name} ${a.email ?? ''} ${a.branch ?? ''}`.toLowerCase().includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="max-w-4xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Applicants</h1>
      <p className="text-sm text-ink-grey mb-6">
        All registered applicants, with the academic details used for campus rules. &quot;Verified&quot; means you imported the
        values and the applicant cannot change them.
      </p>

      <ListToolbar
        search={search}
        onSearch={(v) => { setSearch(v); setVisible(PAGE_SIZE); }}
        placeholder="Search by name, email or branch"
        tabs={[
          { id: 'all', label: 'All', count: all.length },
          { id: 'active', label: 'Active', count: all.length - inactive },
          { id: 'inactive', label: 'Deactivated', count: inactive },
        ]}
        active={tab}
        onTab={(id) => { setTab(id as Tab); setVisible(PAGE_SIZE); }}
      />

      {isLoading && <div className="h-40 rounded-xl bg-paper-raised border border-hairline animate-pulse" />}

      {isError && (
        <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-xl px-4 py-3">
          <span>Couldn&apos;t load the applicants.</span>
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
          {filtered.length === 0 && (
            <p className="text-sm text-ink-grey p-4">
              {all.length === 0 ? 'No applicants registered yet.' : 'No applicants match this filter.'}
            </p>
          )}
          {filtered.slice(0, visible).map((applicant, i) => (
            <FadeIn key={applicant.id} delay={Math.min(i, 10) * 0.03}>
              <div className={i > 0 ? 'border-t border-hairline' : ''}>
                <ApplicantRow applicant={applicant} />
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