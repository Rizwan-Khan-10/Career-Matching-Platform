'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { ProfileBanner } from '@/components/ProfileBanner';
import { CompanyProfileModal } from '@/components/profile/CompanyProfileModal';
import { Pill } from '@/components/admin/Pill';
import type { JobPosting } from '@/types/job';
import { PeopleDrawer } from '@/components/stats/PeopleDrawer';
import { InsightsPanel } from '@/components/stats/InsightsPanel';
import { FunnelBars } from '@/components/stats/FunnelBars';
import { StatCard } from '@/components/stats/StatCard';
import { StageLegend, StatsTable, stageColumns, type StatsColumn } from '@/components/stats/StatsTable';
import { COMPANY_LIST_STAGES, STAGE_LABEL, type Drill } from '@/components/stats/stages';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { FileUp } from 'lucide-react';
import type { CompanyStats, PeopleStage, RoleStats } from '@/types/stats';

export default function CompanyDashboard() {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [insights, setInsights] = useState<{ roleId: string; title: string } | null>(null);
  // Applied / Shortlisted / Rejected list the people (they approved sharing); the server only allows these three stages
  const openStage = (stage: PeopleStage, title?: string, jobRoleId?: string) =>
    setDrill({ title: `${title ? `${title} · ` : ''}${STAGE_LABEL[stage]}`, filters: { stage, jobRoleId } });

  const { data: profile } = useQuery({
    queryKey: ['companyProfile'],
    queryFn: () => apiClient.get('/companies/me').then((r) => r.data),
  });

  const { data: postings } = useQuery<JobPosting[]>({
    queryKey: ['jobPostings'],
    queryFn: () => apiClient.get('/jobs/mine').then((r) => r.data),
  });

  const { data: stats, isError, refetch } = useQuery<CompanyStats>({
    queryKey: ['companyStats'],
    queryFn: () => apiClient.get('/stats/company').then((r) => r.data),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const totalRoles = postings ? postings.reduce((sum, p) => sum + (p.roles?.length ?? 0), 0) : undefined;
  const stoppedJobs = postings?.filter((p) => p.stoppedAt).length ?? 0;
  const t = stats?.totals;

  // scanned / matched are numbers only (those people have not approved sharing): they open the insights panel per role
  const roleColumns: StatsColumn<RoleStats>[] = [
    {
      key: 'role',
      header: 'Role',
      cell: (r) => (
        <Link href={`/company/roles/${r.jobRoleId}/applicants`} className="text-ink hover:text-accent">
          {r.roleTitle}
        </Link>
      ),
    },
    ...stageColumns<RoleStats>((r, stage) => {
      if (stage === 'scanned' || stage === 'matched') setInsights({ roleId: r.jobRoleId, title: r.roleTitle });
      else openStage(stage, r.roleTitle, r.jobRoleId);
    }),
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (r) => <Pill tone={r.stopped ? 'muted' : 'success'}>{r.stopped ? 'Stopped' : 'Active'}</Pill>,
    },
  ];

  return (
    <div className="max-w-5xl">
      {profile && !profile.name && <ProfileBanner onClick={() => setIsProfileOpen(true)} />}
      <CompanyProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <h1 className="font-heading text-2xl text-ink mb-1">Dashboard</h1>
      <p className="text-sm text-ink-grey mb-6">How your jobs are doing, from the resumes checked to the people you shortlisted.</p>

      {isError && !stats && <ErrorBox className="mb-4" message="Couldn't load your numbers." onRetry={() => refetch()} />}

      <h2 className="font-heading text-lg text-ink mb-3">Hiring funnel</h2>
      <FunnelBars
        totals={t}
        stages={['scanned', 'matched', 'applied', 'shortlisted', 'rejected']}
        canOpen={(stage) => COMPANY_LIST_STAGES.includes(stage)}
        onOpen={(stage) => openStage(stage)}
      />
      <p className="text-xs text-ink-grey mt-2">Applied, shortlisted and rejected open the list of people. Scanned and matched are numbers only, per role below.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
        <StatCard value={postings?.length} label="Job postings" hint={stoppedJobs ? `${stoppedJobs} stopped` : undefined} href="/company/jobs" />
        <StatCard value={totalRoles} label="Roles posted" href="/company/jobs" />
        <StatCard
          value={t ? Math.max(t.matched - t.applied, 0) : stats ? null : undefined}
          label="Matched, not applied yet"
          hint="waiting for the applicant's approval"
        />
      </div>

      <h2 className="font-heading text-lg text-ink mt-10 mb-1">By role</h2>
      <StageLegend />
      {!stats && !isError && <TableSkeleton rows={4} />}
      {stats && stats.roles.length === 0 && (
        <EmptyState
          icon={FileUp}
          title="No roles yet"
          text="Upload a requirement document and the roles in it will show up here with their numbers."
          actionLabel="Upload a job"
          actionHref="/company/jobs"
        />
      )}
      {stats && stats.roles.length > 0 && (
        <StatsTable rows={stats.roles} columns={roleColumns} getKey={(r) => r.jobRoleId} caption="Funnel numbers by role" />
      )}
      <InsightsPanel roleId={insights?.roleId ?? null} roleTitle={insights?.title ?? ''} onClose={() => setInsights(null)} />
      <PeopleDrawer drill={drill} viewer="company" onClose={() => setDrill(null)} />
    </div>
  );
}
