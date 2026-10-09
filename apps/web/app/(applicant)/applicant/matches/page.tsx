'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/authStore';
import { getSocket } from '@/lib/socket';
import { motion } from 'motion/react';
import { FadeIn } from '@/components/motion/FadeIn';
import type { Match } from '@/types/match';

function SkillChips({ label, skills, className }: { label: string; skills?: string[]; className: string }) {
  if (!skills || skills.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-xs text-ink-grey mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span key={skill} className={`text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

function MatchCard({
  match,
  busy,
  onDecide,
}: {
  match: Match;
  busy: boolean;
  onDecide: (approved: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const company = match.companyName || 'this company';

  return (
    <div className="bg-paper-raised border border-hairline rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{match.roleTitle || `Role ${match.jobRoleId.slice(0, 8)}`}</p>
          <p className="text-xs text-ink-grey truncate">
            {match.companyName}
            {match.companyIndustry ? ` · ${match.companyIndustry}` : ''}
          </p>
          <p className="text-xs text-ink-grey font-mono mt-0.5">Match: {Math.round(match.score * 100)}%</p>
        </div>
        <motion.span
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${match.eligible ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
        >
          {match.eligible ? 'Eligible' : 'Not eligible'}
        </motion.span>
      </div>

      {match.reason && <p className="text-sm text-ink-grey mt-2">{match.reason}</p>}

      <SkillChips label="Skills you have" skills={match.matchedSkills} className="bg-success-soft text-success" />
      <SkillChips label="Related experience" skills={match.partialSkills} className="bg-accent-soft text-accent" />
      <SkillChips label="Skills to add" skills={match.missingSkills} className="bg-danger-soft text-danger" />

      {/* ---- consent: the company only sees you (and gets your resume) after you approve ---- */}
      {match.eligible && match.applicantStatus === 'pending' && match.jobStopped && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-sm text-ink-grey">This job is no longer accepting applications.</p>
        </div>
      )}

      {match.eligible && match.applicantStatus === 'pending' && !match.jobStopped && (
        <div className="mt-3 border-t border-hairline pt-3">
          {!confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50"
              >
                Approve — share my resume with {company}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(false)}
                className="text-sm font-medium text-ink-grey hover:text-ink px-3 py-2 disabled:opacity-50"
              >
                Not interested
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-ink mb-2">
                Your resume will be sent to <b>{company}</b> as a PDF, and they will see you as a ready candidate. This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                    onDecide(true);
                  }}
                  className="text-sm font-medium px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50"
                >
                  Yes, share it
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-sm font-medium text-ink-grey hover:text-ink px-3 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {match.eligible && match.applicantStatus === 'declined' && !match.jobStopped && (
        <div className="mt-3 border-t border-hairline pt-3 flex items-center gap-3">
          <p className="text-sm text-ink-grey">You said you&apos;re not interested.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(true)}
            className="text-sm font-medium text-accent hover:underline disabled:opacity-50"
          >
            Changed your mind? Share my resume
          </button>
        </div>
      )}

      {match.applicantStatus === 'approved' && (
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-sm font-medium text-success">Approved — shared with {company}</p>
          {match.resumeStatus === 'ready' && <p className="text-sm text-ink-grey mt-0.5">Your resume was sent to them as a PDF.</p>}
          {match.resumeStatus === 'none' && <p className="text-sm text-ink-grey mt-0.5">Preparing your resume as a PDF…</p>}
          {match.resumeStatus === 'failed' && (
            <div className="mt-1">
              <p className="text-sm text-danger">
                We couldn&apos;t turn your resume into a PDF. Try again, or upload your resume as a PDF and approve again.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(true)}
                className="text-sm font-medium text-accent hover:underline mt-1 disabled:opacity-50"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {!match.eligible && match.feedback && (
        <div className="mt-3 border-l-2 border-hairline pl-3">
          <p className="text-xs text-ink-grey mb-0.5">How to improve</p>
          <p className="text-sm text-ink whitespace-pre-line">{match.feedback}</p>
        </div>
      )}
    </div>
  );
}

export default function MatchesPage() {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: matches, isLoading } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => apiClient.get('/matches/mine').then((r) => r.data),
    // while a resume PDF is being prepared, keep checking until it is sent
    refetchInterval: (query) =>
      query.state.data?.some((m) => m.applicantStatus === 'approved' && m.resumeStatus === 'none') ? 5000 : false,
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

  const decide = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) => apiClient.patch(`/matches/${id}/approval`, { approved }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success(vars.approved ? 'Approved — your resume is being sent' : 'Got it, we will not share your resume');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Could not save your choice, try again'),
  });

  const waitingForYou = matches?.filter((m) => m.eligible && m.applicantStatus === 'pending' && !m.jobStopped).length ?? 0;

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl text-ink mb-1">Matches</h1>
      <p className="text-sm text-ink-grey mb-6">
        Companies you matched with. Your resume is only shared with a company after you approve it.
      </p>

      {waitingForYou > 0 && (
        <p className="text-sm text-ink bg-accent-soft rounded-lg px-3 py-2 mb-4">
          {waitingForYou} {waitingForYou === 1 ? 'company is' : 'companies are'} waiting for your approval.
        </p>
      )}

      {isLoading && <p className="text-sm text-ink-grey">Loading...</p>}

      {matches?.length === 0 && (
        <p className="text-sm text-ink-grey">
          No matches yet — this fills in automatically once your resume is processed and matched against open roles.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {matches?.map((match, i) => (
          <FadeIn key={match.id} delay={i * 0.05}>
            <MatchCard
              match={match}
              busy={decide.isPending}
              onDecide={(approved) => decide.mutate({ id: match.id, approved })}
            />
          </FadeIn>
        ))}
      </div>
    </div>
  );
}