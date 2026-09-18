'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { FadeIn } from '@/components/motion/FadeIn';

interface Match {
  id: string;
  jobRoleId: string;
  eligible: boolean;
  feedback: string | null;
}

export default function FeedbackPage() {
  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => apiClient.get('/matches/mine').then((r) => r.data),
  });

  const withFeedback = matches?.filter((m) => !m.eligible && m.feedback);

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Feedback</h1>
      <p className="text-sm text-ink-grey mb-6">Personalized guidance for roles you weren't matched to.</p>

      {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

      {withFeedback?.length === 0 && (
        <p className="text-sm text-ink-grey">No feedback yet — check back after your matches are processed.</p>
      )}

      <div className="flex flex-col gap-3">
        {withFeedback?.map((match, i) => (
          <FadeIn key={match.id} delay={i * 0.05}>
            <div className="bg-paper-raised border border-hairline rounded-xl p-4">
              <p className="text-xs text-ink-grey font-mono mb-2">Role ID: {match.jobRoleId}</p>
              <p className="text-sm text-ink">{match.feedback}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}