'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { feedbackPoints } from '@/lib/feedbackText';
import { FadeIn } from '@/components/motion/FadeIn';
import { ScoreBadge } from '@/components/matches/ScoreBadge';
import { SkillChips } from '@/components/matches/SkillChips';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { ListSkeleton } from '@/components/ui/Skeleton';
import type { Match } from '@/types/match';

export default function FeedbackPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: matches, isLoading, isError, refetch } = useQuery<Match[]>({
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
      <p className="text-sm text-ink-grey mb-6">Personalized guidance for roles you weren&apos;t matched to.</p>

      {isLoading && <ListSkeleton rows={2} />}

      {isError && <ErrorBox message="Couldn't load your feedback." onRetry={() => refetch()} />}

      {!isLoading && !isError && withFeedback?.length === 0 && (
        <EmptyState
          icon={MessageSquareText}
          title="No feedback yet"
          text="It appears here automatically once your matches are processed."
        />
      )}

      <div className="flex flex-col gap-3">
        {withFeedback?.map((match, i) => {
          const points = feedbackPoints(match.feedback);
          const missing = match.missingSkills ?? [];
          return (
            <FadeIn key={match.id} delay={Math.min(i, 10) * 0.04}>
              <div className="bg-paper-raised border border-hairline rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-ink">
                    {match.roleTitle ?? 'A role'}
                    {match.companyName && <span className="block text-xs font-normal text-ink-grey">{match.companyName}</span>}
                  </p>
                  <ScoreBadge score={match.score} />
                </div>

                {missing.length > 0 && <SkillChips label="What is missing" skills={missing} kind="missing" />}

                {points.length > 0 && (
                  <div className="mt-3">
                    <h2 className="text-xs font-medium text-ink-grey mb-1">How to improve</h2>
                    <ul className="list-disc pl-5 space-y-1 marker:text-ink-grey">
                      {points.map((point, idx) => (
                        <li key={idx} className="text-sm text-ink">{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </FadeIn>
          );
        })}
      </div>
    </div>
  );
}
