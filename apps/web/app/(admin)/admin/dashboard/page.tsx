'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { toCsv } from '@/lib/exportCsv';
import { BranchTable, branchName } from '@/components/admin/BranchTable';
import { ExportCsvButton } from '@/components/admin/ExportCsvButton';
import { PeopleDrawer } from '@/components/stats/PeopleDrawer';
import { StageCount } from '@/components/stats/StageCount';
import { STAGE_LABEL, type Drill } from '@/components/stats/stages';
import type { AdminApplicant, AdminCompany } from '@/types/admin';
import type { AdminStats, PeopleFilters, PeopleStage } from '@/types/stats';

function Card({ value, label, hint, href, onOpen }: { value: number | string; label: string; hint?: string; href?: string; onOpen?: () => void }) {
  const clickable = !!href || (!!onOpen && typeof value === 'number' && value > 0);
  const body = (
    <div className={`bg-paper-raised border border-hairline rounded-xl p-5 ${clickable ? 'hover:border-accent transition-colors' : ''}`}>
      <p className="text-3xl font-heading font-bold text-ink">{value}</p>
      <p className="text-sm text-ink-grey mt-1">{label}</p>
      {hint && <p className="text-xs text-ink-grey mt-0.5">{hint}</p>}
    </div>
  );
  if (href) return <Link href={href}>{body}</Link>;
  if (onOpen && typeof value === 'number' && value > 0) {
    return (
      <button type="button" onClick={onOpen} aria-label={`${value} ${label.toLowerCase()}, view list`} className="text-left w-full cursor-pointer">
        {body}
      </button>
    );
  }
  return body;
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-8 mb-3">
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
  const { data: stats } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: () => apiClient.get('/stats/admin').then((r) => r.data),
    refetchInterval: 30000,
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

  return (
    <div className="max-w-4xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Admin Dashboard</h1>
      <p className="text-sm text-ink-grey mb-6">
        Platform overview.{' '}
        <Link href="/admin/health" className="text-accent underline underline-offset-2">System health</Link>
        {' · '}
        <Link href="/admin/audit" className="text-accent underline underline-offset-2">Audit log</Link>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          href="/admin/companies"
          value={companies?.length ?? '—'}
          label="Companies"
          hint={pendingCompanies > 0 ? `${pendingCompanies} waiting for approval` : undefined}
        />
        <Card href="/admin/applicants" value={applicants?.length ?? p?.applicants ?? '—'} label="Applicants" />
        <Card value={p?.jobs ?? '—'} label="Job postings" hint={p?.stoppedJobs ? `${p.stoppedJobs} stopped` : undefined} />
        <Card value={p?.resumesScanned ?? '—'} label="Resumes scanned" hint="parsed successfully" onOpen={() => openStage('parsed')} />
      </div>

      <h2 className="font-heading text-lg text-ink mt-8 mb-3">Matching funnel</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card value={t?.scanned ?? '—'} label="Applicants scanned" hint="checked against a job" onOpen={() => openStage('scanned')} />
        <Card value={t?.matched ?? '—'} label="Matched" onOpen={() => openStage('matched')} />
        <Card value={t?.applied ?? '—'} label="Applied" hint="approved sharing their resume" onOpen={() => openStage('applied')} />
        <Card value={t?.shortlisted ?? '—'} label="Shortlisted" onOpen={() => openStage('shortlisted')} />
        <Card value={t?.rejected ?? '—'} label="Rejected" onOpen={() => openStage('rejected')} />
      </div>

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
      {stats && stats.companies.length === 0 && <p className="text-sm text-ink-grey">No jobs posted yet.</p>}
      {stats && stats.companies.length > 0 && (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-grey border-b border-hairline">
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium text-right">Jobs</th>
                <th className="px-3 py-2.5 font-medium text-right">Scanned</th>
                <th className="px-3 py-2.5 font-medium text-right">Matched</th>
                <th className="px-3 py-2.5 font-medium text-right">Applied</th>
                <th className="px-3 py-2.5 font-medium text-right">Shortlisted</th>
                <th className="px-4 py-2.5 font-medium text-right">Rejected</th>
              </tr>
            </thead>
            <tbody>
              {stats.companies.map((c) => (
                <tr key={c.companyId} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2.5 text-ink">{c.companyName}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {c.jobs}
                    {c.stoppedJobs > 0 && <span className="text-ink-grey"> ({c.stoppedJobs} stopped)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={c.scanned} stage="scanned" onOpen={() => openStage('scanned', { title: c.companyName, companyId: c.companyId })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={c.matched} stage="matched" onOpen={() => openStage('matched', { title: c.companyName, companyId: c.companyId })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={c.applied} stage="applied" onOpen={() => openStage('applied', { title: c.companyName, companyId: c.companyId })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={c.shortlisted} stage="shortlisted" onOpen={() => openStage('shortlisted', { title: c.companyName, companyId: c.companyId })} /></td>
                  <td className="px-4 py-2.5 text-right"><StageCount value={c.rejected ?? 0} stage="rejected" onOpen={() => openStage('rejected', { title: c.companyName, companyId: c.companyId })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {stats && stats.companies.length > 0 && <p className="text-xs text-ink-grey mt-2">A person can appear for more than one role, so a company row can add up to more than its distinct people.</p>}

      <h2 className="font-heading text-lg text-ink mt-8 mb-3">By job role</h2>
      {stats && stats.roles.length > 0 && (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-grey border-b border-hairline">
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Company</th>
                <th className="px-3 py-2.5 font-medium text-right">Scanned</th>
                <th className="px-3 py-2.5 font-medium text-right">Matched</th>
                <th className="px-3 py-2.5 font-medium text-right">Applied</th>
                <th className="px-3 py-2.5 font-medium text-right">Shortlisted</th>
                <th className="px-3 py-2.5 font-medium text-right">Rejected</th>
                <th className="px-4 py-2.5 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {stats.roles.map((r) => (
                <tr key={r.jobRoleId} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2.5 text-ink">{r.roleTitle}</td>
                  <td className="px-3 py-2.5 text-ink-grey">{r.companyName || 'Unnamed company'}</td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.scanned} stage="scanned" onOpen={() => openStage('scanned', { title: `${r.roleTitle} at ${r.companyName || 'Unnamed company'}`, jobRoleId: r.jobRoleId })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.matched} stage="matched" onOpen={() => openStage('matched', { title: `${r.roleTitle} at ${r.companyName || 'Unnamed company'}`, jobRoleId: r.jobRoleId })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.applied} stage="applied" onOpen={() => openStage('applied', { title: `${r.roleTitle} at ${r.companyName || 'Unnamed company'}`, jobRoleId: r.jobRoleId })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.shortlisted} stage="shortlisted" onOpen={() => openStage('shortlisted', { title: `${r.roleTitle} at ${r.companyName || 'Unnamed company'}`, jobRoleId: r.jobRoleId })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.rejected ?? 0} stage="rejected" onOpen={() => openStage('rejected', { title: `${r.roleTitle} at ${r.companyName || 'Unnamed company'}`, jobRoleId: r.jobRoleId })} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.stopped ? 'bg-paper text-ink-grey border border-hairline' : 'bg-success-soft text-success'}`}>
                      {r.stopped ? 'Stopped' : 'Active'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PeopleDrawer drill={drill} viewer="admin" onClose={() => setDrill(null)} />
    </div>
  );
}
