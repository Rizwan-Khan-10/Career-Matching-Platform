'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { toCsv } from '@/lib/exportCsv';
import { BranchTable, branchName } from '@/components/admin/BranchTable';
import { ExportCsvButton } from '@/components/admin/ExportCsvButton';
import { Pill } from '@/components/admin/Pill';
import { PeopleDrawer } from '@/components/stats/PeopleDrawer';
import { FunnelBars } from '@/components/stats/FunnelBars';
import { StatCard } from '@/components/stats/StatCard';
import { StageLegend, StatsTable, stageColumns, type StatsColumn } from '@/components/stats/StatsTable';
import { STAGE_LABEL, type Drill } from '@/components/stats/stages';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { AdminApplicant, AdminCompany } from '@/types/admin';
import type { AdminCompanyRow, AdminStats, PeopleFilters, PeopleStage, RoleStats } from '@/types/stats';

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-10 mb-1">
      <h2 className="font-heading text-lg text-ink">{title}</h2>
      {children}
    </div>
  );
}

export default function AdminDashboard() {
  const { data: companies } = useQuery<AdminCompany[]>({
    queryKey: ['adminCompanies'],
    queryFn: () => apiClient.get('/admin/companies').then((r) => r.data),
  });
  const { data: applicants } = useQuery<AdminApplicant[]>({
    queryKey: ['adminApplicants'],
    queryFn: () => apiClient.get('/admin/applicants').then((r) => r.data),
  });
  const { data: stats, isError, refetch } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: () => apiClient.get('/stats/admin').then((r) => r.data),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const [drill, setDrill] = useState<Drill | null>(null);
  const open = (title: string, filters: PeopleFilters) => setDrill({ title, filters });
  const openStage = (stage: PeopleStage, scope: { title?: string } & Partial<PeopleFilters> = {}) => {
    const { title, ...filters } = scope;
    open(`${title ? `${title} · ` : ''}${STAGE_LABEL[stage]}`, { ...filters, stage });
  };

  const p = stats?.platform;
  const t = stats?.totals;
  const pendingCompanies = companies?.filter((c) => c.status === 'pending').length ?? 0;
  const byBranch = stats?.byBranch ?? [];
  const roleName = (r: RoleStats) => `${r.roleTitle} at ${r.companyName || 'Unnamed company'}`;

  const companyColumns: StatsColumn<AdminCompanyRow>[] = [
    { key: 'company', header: 'Company', cell: (c) => <span className="text-ink">{c.companyName}</span> },
    {
      key: 'jobs',
      header: 'Jobs',
      align: 'right',
      title: 'Job postings this company uploaded',
      cell: (c) => (
        <span className={`font-mono tabular-nums ${c.jobs === 0 ? 'text-ink-grey' : ''}`}>
          {c.jobs.toLocaleString()}
          {c.stoppedJobs > 0 && <span className="text-ink-grey font-body"> ({c.stoppedJobs} stopped)</span>}
        </span>
      ),
      total: (rows) => <span className="font-mono tabular-nums">{rows.reduce((s, r) => s + r.jobs, 0).toLocaleString()}</span>,
    },
    ...stageColumns<AdminCompanyRow>((c, stage) => openStage(stage, { title: c.companyName, companyId: c.companyId })),
  ];

  const roleColumns: StatsColumn<RoleStats>[] = [
    { key: 'role', header: 'Role', cell: (r) => <span className="text-ink">{r.roleTitle}</span> },
    { key: 'company', header: 'Company', cell: (r) => <span className="text-ink-grey">{r.companyName || 'Unnamed company'}</span> },
    ...stageColumns<RoleStats>((r, stage) => openStage(stage, { title: roleName(r), jobRoleId: r.jobRoleId })),
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      cell: (r) => <Pill tone={r.stopped ? 'muted' : 'success'}>{r.stopped ? 'Stopped' : 'Active'}</Pill>,
    },
  ];

  return (
    <div className="max-w-6xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Admin Dashboard</h1>
      <p className="text-sm text-ink-grey mb-6">
        Platform overview.{' '}
        <Link href="/admin/health" className="text-accent underline underline-offset-2">System health</Link>
        {' · '}
        <Link href="/admin/audit" className="text-accent underline underline-offset-2">Audit log</Link>
      </p>

      {isError && !stats && <ErrorBox className="mb-4" message="Couldn't load the platform numbers." onRetry={() => refetch()} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          href="/admin/companies"
          value={companies?.length}
          label="Companies"
          hint={pendingCompanies > 0 ? `${pendingCompanies} waiting for approval` : undefined}
        />
        <StatCard href="/admin/applicants" value={applicants?.length ?? p?.applicants} label="Applicants" />
        <StatCard value={p?.jobs} label="Job postings" hint={p?.stoppedJobs ? `${p.stoppedJobs} stopped` : undefined} />
        <StatCard value={p?.resumesScanned} label="Resumes scanned" hint="parsed successfully" onOpen={() => openStage('parsed')} />
      </div>

      <SectionHeader title="Matching funnel" />
      <p className="text-sm text-ink-grey mb-3">
        Bar width is the share of everyone who was scanned. The text beside each number shows how many made it from the step before.
      </p>
      <FunnelBars totals={t} onOpen={(stage) => openStage(stage)} />

      <SectionHeader title="By branch">
        <ExportCsvButton
          fileName="branch-stats"
          disabled={byBranch.length === 0}
          build={() =>
            toCsv(byBranch, [
              { header: 'Branch', value: branchName },
              { header: 'Scanned', value: (r) => r.scanned },
              { header: 'Matched', value: (r) => r.matched },
              { header: 'Applied', value: (r) => r.applied },
              { header: 'Shortlisted', value: (r) => r.shortlisted },
              { header: 'Rejected', value: (r) => r.rejected ?? 0 },
            ])
          }
        />
      </SectionHeader>
      <StageLegend />
      {!stats && <TableSkeleton rows={3} />}
      {stats && byBranch.length === 0 && (
        <p className="text-sm text-ink-grey">
          No branch data yet. Branch-wise numbers appear once applicants have a branch (from your CSV import or entered by them).
        </p>
      )}
      {byBranch.length > 0 && (
        <BranchTable
          rows={byBranch}
          onOpen={(row, stage) => openStage(stage, { title: branchName(row), branch: row.branch?.trim() || 'Unknown' })}
        />
      )}
      {byBranch.length > 0 && <p className="text-xs text-ink-grey mt-2">Each person is counted once, in their branch.</p>}

      <SectionHeader title="By company">
        <ExportCsvButton
          fileName="company-stats"
          disabled={!stats || stats.companies.length === 0}
          build={() =>
            toCsv(stats?.companies ?? [], [
              { header: 'Company', value: (c) => c.companyName },
              { header: 'Jobs', value: (c) => c.jobs },
              { header: 'Stopped jobs', value: (c) => c.stoppedJobs },
              { header: 'Scanned', value: (c) => c.scanned },
              { header: 'Matched', value: (c) => c.matched },
              { header: 'Applied', value: (c) => c.applied },
              { header: 'Shortlisted', value: (c) => c.shortlisted },
              { header: 'Rejected', value: (c) => c.rejected },
            ])
          }
        />
      </SectionHeader>
      <StageLegend />
      {!stats && <TableSkeleton rows={4} />}
      {stats && stats.companies.length === 0 && <p className="text-sm text-ink-grey">No jobs posted yet.</p>}
      {stats && stats.companies.length > 0 && (
        <StatsTable rows={stats.companies} columns={companyColumns} getKey={(c) => c.companyId} caption="Funnel numbers by company" />
      )}
      {stats && stats.companies.length > 0 && (
        <p className="text-xs text-ink-grey mt-2">A person can appear for more than one role, so a company row can add up to more than its distinct people.</p>
      )}

      <SectionHeader title="By job role" />
      <StageLegend />
      {!stats && <TableSkeleton rows={5} />}
      {stats && stats.roles.length === 0 && <p className="text-sm text-ink-grey">No roles yet.</p>}
      {stats && stats.roles.length > 0 && (
        <StatsTable rows={stats.roles} columns={roleColumns} getKey={(r) => r.jobRoleId} caption="Funnel numbers by job role" />
      )}

      <PeopleDrawer drill={drill} viewer="admin" onClose={() => setDrill(null)} />
    </div>
  );
}
