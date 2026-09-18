'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { ProfileBanner } from '@/components/ProfileBanner';

export default function CompanyDashboard() {
  const { data: profile } = useQuery({
    queryKey: ['companyProfile'],
    queryFn: () => apiClient.get('/company/me').then((r) => r.data),
  });

  return (
    <div>
      {profile && !profile.name && <ProfileBanner href="/company/profile" />}
      <h1 className="font-heading text-2xl text-ink">Company Dashboard</h1>
    </div>
  );
}