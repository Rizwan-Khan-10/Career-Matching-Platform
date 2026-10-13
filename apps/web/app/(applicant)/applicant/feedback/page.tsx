'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { FadeIn } from '@/components/motion/FadeIn';
import type { Match } from '@/types/match';

export default function FeedbackPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => apiClient.get('/matches/mine').then((r) => r.data),
  });

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    const refresh = () => { queryClient.invalidateQueries({ queryKey: ['matches'] }); setTimeout(() => queryClient.invalidateQueries({ queryKey: ['matches'] }), 1500); };
    socket.on('feedback.ready', refresh);
    return () => { socket.off('feedback.ready', refresh); };
  }, [token, queryClient]);

  const withFeedback = matches?.filter((m) => !m.eligible && m.feedback);

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Feedback</h1>
      <p className="text-sm text-ink-grey mb-6">Personalized guidance for roles you weren't matched to.</p>

      {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

      {!isLoading && withFeedback?.length === 0 && (
        <p className="text-sm text-ink-grey">No feedback yet. It appears here automatically once your matches are processed.</p>
      )}

      <div className="flex flex-col gap-3">
        {withFeedback?.map((match, i) => (
          <FadeIn key={match.id} delay={i * 0.05}>
            <div className="bg-paper-raised border border-hairline rounded-xl p-4">
              <p className="text-sm font-medium text-ink mb-2">
                {match.roleTitle ?? 'A role'}{match.companyName ? ` · ${match.companyName}` : ''}
              </p>
              <p className="text-sm text-ink whitespace-pre-line">{match.feedback}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}