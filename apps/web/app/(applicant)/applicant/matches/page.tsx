'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { FadeIn } from '@/components/motion/FadeIn';
import { MatchCard } from '@/components/matches/MatchCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { canApprove, matchGroup, type MatchGroup } from '@/lib/matchReason';
import { Target } from 'lucide-react';
import { ApplicantProfileModal } from '@/components/profile/ApplicantProfileModal';
import type { Match } from '@/types/match';

// websocket events that change what this page shows (contract section 6)
const LIVE_EVENTS = [
  'match.computed',
  'feedback.ready',
  'candidate.shortlisted',
  'candidate.rejected',
  'prep.ready',
  'rejection-feedback.ready',
];

const GROUPS: { id: MatchGroup; title: string; text: string }[] = [
  { id: 'eligible', title: 'Eligible', text: 'You fit these roles. Approve to share your resume with the company.' },
  { id: 'almost', title: 'Possible match', text: 'Close, but not confirmed. You can still share your resume: the company will review it themselves.' },
  { id: 'not_eligible', title: 'Not eligible', text: 'Not a fit right now. Each card shows what to improve.' },
];

export default function MatchesPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const scrolledTo = useRef<string | null>(null);

  const { data: matches, isLoading, isError, refetch } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => apiClient.get('/matches/mine').then((r) => r.data),
    refetchInterval: (query) => {
      const list = query.state.data;
      // while a resume PDF is being prepared, keep checking until it is sent
      if (list?.some((m) => m.applicantStatus === 'approved' && m.resumeStatus === 'none')) return 5000;
      // safety net in case the socket is down while the AI prep tips are written
      if (list?.some((m) => m.outcome === 'shortlisted' && !m.prepGuide)) return 15000;
      return false;
    },
  });

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    // ws can beat the DB write, so refetch once more shortly after
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['matches'] }), 1500);
    };
    LIVE_EVENTS.forEach((event) => socket.on(event, refresh));
    return () => {
      LIVE_EVENTS.forEach((event) => socket.off(event, refresh));
    };
  }, [token, queryClient]);

  // deep link from a notification: /applicant/matches#match-<id>; scroll to the card once the list has loaded
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || !matches || scrolledTo.current === id) return;
    const el = document.getElementById(id);
    if (!el) return;
    scrolledTo.current = id;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matches]);

  const decide = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => apiClient.patch(`/matches/${id}/approval`, { approved }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success(vars.approved ? 'Approved — your resume is being sent' : 'Got it, we will not share your resume');
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Could not save your choice, try again')),
  });

  // best score first inside each group
  const grouped: Record<MatchGroup, Match[]> = { eligible: [], almost: [], not_eligible: [] };
  [...(matches ?? [])].sort((a, b) => b.score - a.score).forEach((m) => grouped[matchGroup(m)].push(m));

  const waitingForYou = matches?.filter((m) => canApprove(m) && m.applicantStatus === 'pending' && !m.jobStopped).length ?? 0;
  const shortlisted = matches?.filter((m) => m.outcome === 'shortlisted').length ?? 0;

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Matches</h1>
      <p className="text-sm text-ink-grey mb-6">
        Companies you matched with. Your resume is only shared with a company after you approve it. Matches come from automated screening, so a company may still look at your resume themselves before deciding.
      </p>

      <ApplicantProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />

      {shortlisted > 0 && (
        <p className="text-sm text-success bg-success-soft rounded-lg px-3 py-2 mb-3">
          You&apos;ve been shortlisted for {shortlisted} {shortlisted === 1 ? 'role' : 'roles'}.
        </p>
      )}

      {waitingForYou > 0 && (
        <p className="text-sm text-ink bg-accent-soft rounded-lg px-3 py-2 mb-4">
          {waitingForYou} {waitingForYou === 1 ? 'company is' : 'companies are'} waiting for your approval.
        </p>
      )}

      {isLoading && <ListSkeleton rows={3} />}

      {isError && <ErrorBox message="Couldn't load your matches." onRetry={() => refetch()} />}

      {!isLoading && !isError && matches?.length === 0 && (
        <EmptyState
          icon={Target}
          title="No matches yet"
          text="Confirm a resume and this fills in automatically once it is matched against open roles."
          actionLabel="Go to my resume"
          actionHref="/applicant/resume"
        />
      )}

      {GROUPS.map(({ id, title, text }) => {
        const list = grouped[id];
        if (list.length === 0) return null;
        return (
          <section key={id} aria-labelledby={`group-${id}`} className="mb-8">
            <h2 id={`group-${id}`} className="font-heading text-lg text-ink">
              {title} <span className="font-mono text-sm text-ink-grey">{list.length}</span>
            </h2>
            <p className="text-sm text-ink-grey mb-3">{text}</p>
            <div className="flex flex-col gap-3">
              {list.map((match, i) => (
                <FadeIn key={match.id} delay={Math.min(i, 10) * 0.03}>
                  <div id={`match-${match.id}`} className="scroll-mt-20 rounded-xl transition-shadow target:ring-2 target:ring-accent">
                    <MatchCard
                      match={match}
                      busy={decide.isPending}
                      onDecide={(approved) => decide.mutate({ id: match.id, approved })}
                      onOpenProfile={() => setIsProfileOpen(true)}
                    />
                  </div>
                </FadeIn>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}