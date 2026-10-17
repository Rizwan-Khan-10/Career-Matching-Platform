'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { actionLabel, metaText } from '@/lib/audit';
import { timeAgo } from '@/lib/time';
import { useAuthStore } from '@/store/authStore';
import { FadeIn } from '@/components/motion/FadeIn';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { AuditEntry } from '@/types/admin';

const LIMITS = [50, 100, 200];

export default function AdminAuditPage() {
  const me = useAuthStore((s) => s.userId);
  const [limit, setLimit] = useState(50);
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<AuditEntry[]>({
    queryKey: ['adminAudit', limit],
    queryFn: () => apiClient.get('/admin/audit', { params: { limit } }).then((r) => r.data),
  });

  const entries = data ?? [];
  const actions = Array.from(new Set(entries.map((e) => e.action))).sort();
  const q = search.trim().toLowerCase();
  const shown = entries.filter(
    (e) => (!action || e.action === action) && (!q || `${e.target} ${e.actorId} ${metaText(e.meta)}`.toLowerCase().includes(q)),
  );

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Audit log</h1>
      <p className="text-sm text-ink-grey mb-6">What admins changed on the platform, newest first.</p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search target, person or details" aria-label="Search the audit log" />
        <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </Select>
        <Select value={limit} onChange={(e) => setLimit(Number(e.target.value))} aria-label="How many entries to load">
          {LIMITS.map((n) => (
            <option key={n} value={n}>
              Last {n}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && <div className="h-48 rounded-xl bg-paper-raised border border-hairline animate-pulse" />}

      {isError && (
        <div className="flex items-center justify-between gap-3 text-sm bg-danger-soft text-danger rounded-xl px-4 py-3">
          <span>Couldn&apos;t load the audit log.</span>
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {data && (
        <div className="bg-paper-raised border border-hairline rounded-xl overflow-hidden">
          {shown.length === 0 && (
            <p className="text-sm text-ink-grey p-4">{entries.length === 0 ? 'Nothing has been logged yet.' : 'No entries match this filter.'}</p>
          )}
          {shown.map((entry, i) => {
            const details = metaText(entry.meta);
            return (
              <FadeIn key={entry.id} delay={Math.min(i, 10) * 0.02}>
                <div className={`px-4 py-3 ${i > 0 ? 'border-t border-hairline' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{actionLabel(entry.action)}</p>
                    <time
                      dateTime={entry.createdAt}
                      title={timeAgo(entry.createdAt)}
                      className="text-xs text-ink-grey shrink-0"
                    >
                      {new Date(entry.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-xs text-ink-grey mt-0.5 break-all">
                    By {entry.actorId === me ? 'you' : <span className="font-mono" title={entry.actorId}>{entry.actorId.slice(0, 8)}</span>}
                    {' · '}
                    Target <span className="font-mono">{entry.target}</span>
                  </p>
                  {details && (
                    <p className="text-xs text-ink mt-1 wrap-break-words" title={JSON.stringify(entry.meta)}>
                      {details}
                    </p>
                  )}
                </div>
              </FadeIn>
            );
          })}
        </div>
      )}
    </div>
  );
}