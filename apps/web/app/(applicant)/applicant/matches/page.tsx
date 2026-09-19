'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { motion } from 'motion/react';
import { FadeIn } from '@/components/motion/FadeIn';

interface Match {
  id: string;
  jobRoleId: string;
  score: number;
  eligible: boolean;
  feedback: string | null;
  createdAt: string;
}

export default function MatchesPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => apiClient.get('/matches/mine').then((r) => r.data),
  });

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socket.on('match.computed', () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    });
    return () => {
      socket.off('match.computed');
    };
  }, [token, queryClient]);

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Matches</h1>
      <p className="text-sm text-ink-grey mb-6">Roles you've been evaluated against.</p>

      {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

      {matches?.length === 0 && (
        <p className="text-sm text-ink-grey">
          No matches yet — this fills in automatically once your resume is processed and matched against open roles.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {matches?.map((match, i) => (
          <FadeIn key={match.id} delay={i * 0.05}>
            <div className="bg-paper-raised border border-hairline rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Role ID: {match.jobRoleId}</p>
                <p className="text-xs text-ink-grey font-mono mt-0.5">Score: {match.score.toFixed(2)}</p>
              </div>
              <motion.span
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`text-xs font-medium px-2.5 py-1 rounded-full ${match.eligible ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                  }`}
              >
                {match.eligible ? 'Eligible' : 'Not eligible'}
              </motion.span>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}