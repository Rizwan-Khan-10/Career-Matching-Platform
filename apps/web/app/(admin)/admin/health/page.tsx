'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { cn } from '@/lib/cn';
import { streamLabel } from '@/lib/streams';
import { Pill } from '@/components/admin/Pill';
import type { SystemHealth } from '@/types/admin';

export default function AdminHealthPage() {
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQuery<SystemHealth>({
    queryKey: ['adminHealth'],
    queryFn: () => apiClient.get('/admin/health').then((r) => r.data),
    refetchInterval: 15000,
  });

  // streams with failed messages first, then by name
  const streams = [...(data?.streams ?? [])].sort((a, b) => Number(b.deadLength > 0) - Number(a.deadLength > 0) || a.name.localeCompare(b.name));
  const failing = streams.filter((s) => s.deadLength > 0);
  const deadTotal = failing.reduce((sum, s) => sum + s.deadLength, 0);

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-heading text-2xl text-ink">System health</h1>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-hairline text-ink-grey hover:text-ink transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} />
          Refresh
        </button>
      </div>
      <p className="text-sm text-ink-grey mb-6">
        Each row is an event stream between services. A message goes to the dead-letter list when a service could not process it
        after several tries. Nothing is retried from there, so someone has to look at it.
        {dataUpdatedAt > 0 && <span className="block text-xs mt-1">Last checked {new Date(dataUpdatedAt).toLocaleTimeString()}. Updates every 15 seconds.</span>}
      </p>

      {isLoading && <div className="h-48 rounded-xl bg-paper-raised border border-hairline animate-pulse" />}

      {isError && (
        <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-xl px-4 py-3">
          <span>Couldn&apos;t load the system health.</span>
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div
            role="status"
            className={cn(
              'rounded-xl px-4 py-3 text-sm mb-4',
              failing.length > 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
            )}
          >
            {failing.length > 0
              ? `${deadTotal} failed ${deadTotal === 1 ? 'message' : 'messages'} in ${failing.length} ${failing.length === 1 ? 'stream' : 'streams'}. See the highlighted rows.`
              : 'No failed messages. All streams look healthy.'}
          </div>

          <div className="bg-paper-raised border border-hairline rounded-xl overflow-x-auto">
            {streams.length === 0 ? (
              <p className="text-sm text-ink-grey p-4">No streams reported yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-grey border-b border-hairline">
                    <th className="px-4 py-2.5 font-medium">Stream</th>
                    <th className="px-3 py-2.5 font-medium text-right">Messages</th>
                    <th className="px-4 py-2.5 font-medium text-right">Dead letters</th>
                  </tr>
                </thead>
                <tbody>
                  {streams.map((s) => (
                    <tr key={s.name} className={cn('border-b border-hairline last:border-0', s.deadLength > 0 && 'bg-danger-soft/50')}>
                      <td className="px-4 py-2.5 text-sm text-ink" title={s.name}>{streamLabel(s.name)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{s.length.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        {s.deadLength > 0 ? (
                          <Pill tone="danger" title={`${s.name}.dead`}>
                            {s.deadLength.toLocaleString()} failed
                          </Pill>
                        ) : (
                          <span className="font-mono text-ink-grey">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}