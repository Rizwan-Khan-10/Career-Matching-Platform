'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { ProfileBanner } from '@/components/ProfileBanner';

export default function ApplicantDashboard() {
  const { data: profile } = useQuery({
    queryKey: ['applicantProfile'],
    queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
  });

  return (
    <div>
      {profile && !profile.name && <ProfileBanner href="/applicant/profile" />}
      <h1 className="font-heading text-2xl text-ink">Applicant Dashboard</h1>
    </div>
  );
}