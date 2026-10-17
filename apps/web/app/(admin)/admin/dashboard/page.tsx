'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { toCsv } from '@/lib/exportCsv';
import { BranchTable, branchName } from '@/components/admin/BranchTable';
import { ExportCsvButton } from '@/components/admin/ExportCsvButton';
import type { AdminApplicant, AdminCompany } from '@/types/admin';
import type { AdminStats } from '@/types/stats';

function Card({ value, label, hint, href }: { value: number | string; label: string; hint?: string; href?: string }) {
  const body = (
    <div className={`bg-paper-raised border border-hairline rounded-xl p-5 ${href ? 'hover:border-accent transition-colors' : ''}`}>
      <p className="text-3xl font-heading font-bold text-ink">{value}</p>
      <p className="text-sm text-ink-grey mt-1">{label}</p>
      {hint && <p className="text-xs text-ink-grey mt-0.5">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
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
        <Card value={p?.resumesScanned ?? '—'} label="Resumes scanned" hint="parsed successfully" />
      </div>

      <h2 className="font-heading text-lg text-ink mt-8 mb-3">Matching funnel</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card value={t?.scanned ?? '—'} label="Applicants scanned" hint="checked against a job" />
        <Card value={t?.matched ?? '—'} label="Matched" />
        <Card value={t?.applied ?? '—'} label="Applied" hint="approved sharing their resume" />
        <Card value={t?.shortlisted ?? '—'} label="Shortlisted" />
        <Card value={t?.rejected ?? '—'} label="Rejected" />
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
            ])
          }
        />
      </SectionHeader>
      {stats && byBranch.length === 0 && (
        <p className="text-sm text-ink-grey">
          No branch data yet. Branch-wise numbers appear once applicants have a branch (from your CSV import or entered by them).
        </p>
      )}
      {byBranch.length > 0 && <BranchTable rows={byBranch} />}

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
                  <td className="px-3 py-2.5 text-right font-mono">{c.scanned}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.matched}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.applied}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{c.shortlisted}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{c.rejected ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
                  <td className="px-3 py-2.5 text-right font-mono">{r.scanned}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{r.matched}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{r.applied}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{r.shortlisted}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{r.rejected ?? '—'}</td>
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
    </div>
  );
}