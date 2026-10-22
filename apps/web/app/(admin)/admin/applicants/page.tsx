'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { FadeIn } from '@/components/motion/FadeIn';
import { ApplicantRow, APPLICANTS_KEY, STAGE_PILL } from '@/components/admin/ApplicantRow';
import { Select } from '@/components/ui/Select';
import { ListToolbar } from '@/components/admin/ListToolbar';
import type { AdminApplicant } from '@/types/admin';
import type { ApplicantStage, ApplicantStageRow } from '@/types/stats';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ErrorBox } from '@/components/ui/ErrorBox';

const PAGE_SIZE = 50;
type Tab = 'all' | 'active' | 'inactive';

export default function AdminApplicantsPage() {
  const { data, isLoading, isError, refetch } = useQuery<AdminApplicant[]>({
    queryKey: APPLICANTS_KEY,
    queryFn: () => apiClient.get('/admin/applicants').then((r) => r.data),
  });
  // furthest stage of each person (an older backend has no such endpoint: then the column and filter are simply hidden)
  const { data: stageRows } = useQuery<ApplicantStageRow[]>({
    queryKey: ['adminApplicantStages'],
    queryFn: () => apiClient.get('/stats/admin/applicant-stages').then((r) => r.data),
    retry: false,
  });
  const stageOf = new Map((stageRows ?? []).map((r) => [r.applicantId, r.stage]));
  const [stageFilter, setStageFilter] = useState<'' | ApplicantStage>('');
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
      if (stageFilter && stageOf.get(a.userId) !== stageFilter) return false;
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

      {stageRows && (
        <div className="mb-4 max-w-xs">
          <Select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value as '' | ApplicantStage); setVisible(PAGE_SIZE); }} aria-label="Filter by stage">
            <option value="">All stages</option>
            {(Object.keys(STAGE_PILL) as ApplicantStage[]).map((st) => (
              <option key={st} value={st}>{STAGE_PILL[st].label}</option>
            ))}
          </Select>
        </div>
      )}

      {isLoading && <ListSkeleton rows={4} />}

      {isError && <ErrorBox message="Couldn't load the applicants." onRetry={() => refetch()} />}

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
                <ApplicantRow applicant={applicant} stage={stageRows ? stageOf.get(applicant.userId) ?? 'none' : undefined} />
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