'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { ProfileBanner } from '@/components/ProfileBanner';
import { FadeIn } from '@/components/motion/FadeIn';

export default function ApplicantDashboard() {
  const { data: profile } = useQuery({
    queryKey: ['applicantProfile'],
    queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
  });
  const { data: resumes } = useQuery({
    queryKey: ['resumes'],
    queryFn: () => apiClient.get('/resumes/mine').then((r) => r.data),
  });
  const { data: matches } = useQuery({
    queryKey: ['matches'],
    queryFn: () => apiClient.get('/matches/mine').then((r) => r.data),
  });

  const eligibleCount = matches?.filter((m: any) => m.eligible).length ?? 0;
  const resumeStatus = resumes?.[0]?.status ?? 'not uploaded';

  return (
    <div>
      {profile && !profile.name && <ProfileBanner href="/applicant/profile" />}
      <h1 className="font-heading text-2xl text-ink mb-6">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        <FadeIn>
          <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <p className="text-2xl font-heading font-bold text-ink capitalize">{resumeStatus}</p>
            <p className="text-sm text-ink-grey mt-1">Resume status</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.05}>
          <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <p className="text-2xl font-heading font-bold text-ink">{matches?.length ?? 0}</p>
            <p className="text-sm text-ink-grey mt-1">Total matches</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <p className="text-2xl font-heading font-bold text-success">{eligibleCount}</p>
            <p className="text-sm text-ink-grey mt-1">Eligible roles</p>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}