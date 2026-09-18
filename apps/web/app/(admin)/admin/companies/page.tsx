'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

interface CompanyProfile {
  id: string;
  userId: string;
  name: string;
  industry: string | null;
  contact: string | null;
  createdAt: string;
}

export default function AdminCompaniesPage() {
  const { data: companies, isLoading } = useQuery<CompanyProfile[]>({
    queryKey: ['adminCompanies'],
    queryFn: () => apiClient.get('/admin/companies').then((r) => r.data),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Companies</h1>
      <p className="text-sm text-ink-grey mb-6">All registered companies on the platform.</p>

      {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

      <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
        {companies?.length === 0 && (
          <p className="text-sm text-ink-grey p-4">No companies registered yet.</p>
        )}
        {companies?.map((company, i) => (
          <div
            key={company.id}
            className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-hairline' : ''}`}
          >
            <div>
              <p className="text-sm font-medium text-ink">{company.name || 'Unnamed'}</p>
              <p className="text-xs text-ink-grey">{company.industry || 'Industry not set'}</p>
            </div>
            <span className="text-xs text-ink-grey">
              Joined {new Date(company.createdAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}