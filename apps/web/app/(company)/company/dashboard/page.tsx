'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { ProfileBanner } from '@/components/ProfileBanner';
import { CompanyProfileModal } from '@/components/profile/CompanyProfileModal';
import { FadeIn } from '@/components/motion/FadeIn';
import type { JobPosting } from '@/types/job';
import { PeopleDrawer } from '@/components/stats/PeopleDrawer';
import { InsightsPanel } from '@/components/stats/InsightsPanel';
import { StageCount } from '@/components/stats/StageCount';
import { STAGE_LABEL, type Drill } from '@/components/stats/stages';
import type { CompanyStats, PeopleStage } from '@/types/stats';

function StatCard({ value, label, hint, delay, onOpen }: { value: number | string; label: string; hint?: string; delay?: number; onOpen?: () => void }) {
  const clickable = !!onOpen && typeof value === 'number' && value > 0;
  const body = (
    <div className={`bg-paper-raised border border-hairline rounded-xl p-5 ${clickable ? 'hover:border-accent transition-colors' : ''}`}>
      <p className="text-2xl font-heading font-bold text-ink">{value}</p>
      <p className="text-sm text-ink-grey mt-1">{label}</p>
      {hint && <p className="text-xs text-ink-grey mt-0.5">{hint}</p>}
    </div>
  );
  return (
    <FadeIn delay={delay}>
      {clickable ? (
        <button type="button" onClick={onOpen} aria-label={`${value} ${label.toLowerCase()}, view list`} className="text-left w-full cursor-pointer">
          {body}
        </button>
      ) : (
        body
      )}
    </FadeIn>
  );
}

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

  const { data: stats } = useQuery<CompanyStats>({
    queryKey: ['companyStats'],
    queryFn: () => apiClient.get('/stats/company').then((r) => r.data),
    refetchInterval: 30000,
  });

  const totalRoles = postings?.reduce((sum, p) => sum + (p.roles?.length ?? 0), 0) ?? 0;
  const stoppedJobs = postings?.filter((p) => p.stoppedAt).length ?? 0;
  const t = stats?.totals;

  return (
    <div className="max-w-3xl">
      {profile && !profile.name && <ProfileBanner onClick={() => setIsProfileOpen(true)} />}
      <CompanyProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <h1 className="font-heading text-2xl text-ink mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard value={t?.scanned ?? '—'} label="Applicants scanned" hint="resumes checked against your jobs" />
        <StatCard value={t?.matched ?? '—'} label="Matched" hint="meet your requirements" delay={0.05} />
        <StatCard value={t?.applied ?? '—'} label="Applied" hint="approved sharing their resume" delay={0.1} onOpen={() => openStage('applied')} />
        <StatCard value={t?.shortlisted ?? '—'} label="Shortlisted" delay={0.15} onOpen={() => openStage('shortlisted')} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <StatCard value={t?.rejected ?? '—'} label="Rejected" delay={0.2} onOpen={() => openStage('rejected')} />
        <StatCard value={postings?.length ?? 0} label="Job postings" hint={stoppedJobs ? `${stoppedJobs} stopped` : undefined} delay={0.25} />
        <StatCard value={totalRoles} label="Roles posted" delay={0.3} />
        <StatCard
          value={t ? Math.max(t.matched - t.applied, 0) : '—'}
          label="Matched, not applied yet"
          hint="waiting for the applicant's approval"
          delay={0.35}
        />
      </div>

      <h2 className="font-heading text-lg text-ink mt-8 mb-3">By role</h2>
      {stats && stats.roles.length === 0 && <p className="text-sm text-ink-grey">No roles yet — upload a requirement document to get started.</p>}
      {stats && stats.roles.length > 0 && (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-grey border-b border-hairline">
                <th className="px-4 py-2.5 font-medium">Role</th>
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
                  <td className="px-4 py-2.5">
                    <Link href={`/company/roles/${r.jobRoleId}/applicants`} className="text-ink hover:text-accent">
                      {r.roleTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.scanned} stage="scanned" onOpen={() => setInsights({ roleId: r.jobRoleId, title: r.roleTitle })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.matched} stage="matched" onOpen={() => setInsights({ roleId: r.jobRoleId, title: r.roleTitle })} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.applied ?? 0} stage="applied" onOpen={() => openStage('applied', r.roleTitle, r.jobRoleId)} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.shortlisted ?? 0} stage="shortlisted" onOpen={() => openStage('shortlisted', r.roleTitle, r.jobRoleId)} /></td>
                  <td className="px-3 py-2.5 text-right"><StageCount value={r.rejected ?? 0} stage="rejected" onOpen={() => openStage('rejected', r.roleTitle, r.jobRoleId)} /></td>
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
      <InsightsPanel roleId={insights?.roleId ?? null} roleTitle={insights?.title ?? ''} onClose={() => setInsights(null)} />
      <PeopleDrawer drill={drill} viewer="company" onClose={() => setDrill(null)} />
    </div>
  );
}
