'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { PENDING_JOBS_KEY } from '@/lib/hooks/useJobApproval';
import { FadeIn } from '@/components/motion/FadeIn';
import { JobApprovalRow } from '@/components/admin/JobApprovalRow';
import type { PendingJob } from '@/types/admin';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ErrorBox } from '@/components/ui/ErrorBox';

export default function AdminJobApprovalsPage() {
  const { data, isLoading, isError, refetch } = useQuery<PendingJob[]>({
    queryKey: PENDING_JOBS_KEY,
    queryFn: () => apiClient.get('/jobs/admin/pending').then((r) => r.data),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Job approvals</h1>
      <p className="text-sm text-ink-grey mb-6">
        New job postings wait here while &quot;Approve new job postings&quot; is on in{' '}
        <Link href="/admin/settings" className="text-accent underline underline-offset-2">
          Settings
        </Link>
        . An approved job is read and matched; a rejected one is not.
      </p>

      {isLoading && <ListSkeleton rows={3} />}

      {isError && <ErrorBox message="Couldn't load the pending jobs." onRetry={() => refetch()} />}

      {data && (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
          {data.length === 0 && <p className="text-sm text-ink-grey p-4">Nothing is waiting for your approval.</p>}
          {data.map((job, i) => (
            <FadeIn key={job.id} delay={Math.min(i, 10) * 0.03}>
              <div className={i > 0 ? 'border-t border-hairline' : ''}>
                <JobApprovalRow job={job} />
              </div>
            </FadeIn>
          ))}
        </div>
      )}
    </div>
  );
}