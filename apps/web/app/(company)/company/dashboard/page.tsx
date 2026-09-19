'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { ProfileBanner } from '@/components/ProfileBanner';
import { FadeIn } from '@/components/motion/FadeIn';

export default function CompanyDashboard() {
  const { data: profile } = useQuery({
    queryKey: ['companyProfile'],
    queryFn: () => apiClient.get('/companies/me').then((r) => r.data),
  });
  const { data: postings } = useQuery({
    queryKey: ['jobPostings'],
    queryFn: () => apiClient.get('/jobs/mine').then((r) => r.data),
  });

  const totalRoles = postings?.reduce((sum: number, p: any) => sum + (p.roles?.length ?? 0), 0) ?? 0;

  return (
    <div>
      {profile && !profile.name && <ProfileBanner href="/company/profile" />}
      <h1 className="font-heading text-2xl text-ink mb-6">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4">
        <FadeIn>
          <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <p className="text-2xl font-heading font-bold text-ink">{postings?.length ?? 0}</p>
            <p className="text-sm text-ink-grey mt-1">Job postings</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.05}>
          <div className="bg-paper-raised border border-hairline rounded-xl p-5">
            <p className="text-2xl font-heading font-bold text-ink">{totalRoles}</p>
            <p className="text-sm text-ink-grey mt-1">Roles posted</p>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}