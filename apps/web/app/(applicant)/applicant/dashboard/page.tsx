'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { cn } from '@/lib/cn';
import { ProfileBanner } from '@/components/ProfileBanner';
import { ApplicantProfileModal } from '@/components/profile/ApplicantProfileModal';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { ScoreBadge } from '@/components/matches/ScoreBadge';
import { StatCard } from '@/components/stats/StatCard';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { canApprove } from '@/lib/matchReason';
import type { Match } from '@/types/match';
import type { Resume } from '@/types/resume';

type StepState = 'done' | 'current' | 'todo';

/** One human sentence for the resume status (instead of the raw word "parsed" or "not uploaded"). */
function resumeSentence(resumes: Resume[] | undefined): string {
  const current = (resumes ?? []).filter((r) => !r.supersededAt);
  if (current.length === 0) return 'No resume yet. Upload one to start matching.';
  if (current.some((r) => r.status === 'pending')) return 'Reading your resume. This takes a minute.';
  if (current.some((r) => r.status === 'parsed' && !r.confirmedAt)) return 'Parsed. Please confirm your details.';
  if (current.some((r) => r.status === 'parsed' && r.confirmedAt)) return 'Confirmed. You are being matched with open roles.';
  return "We couldn't read your resume. Upload a new PDF.";
}

export default function ApplicantDashboard() {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ['applicantProfile'],
    queryFn: () => apiClient.get('/applicants/me').then((r) => r.data),
  });
  const { data: resumes, isLoading: resumesLoading } = useQuery<Resume[]>({
    queryKey: ['resumes'],
    queryFn: () => apiClient.get('/resumes/mine').then((r) => r.data),
  });
  const { data: matches, isLoading: matchesLoading } = useQuery<Match[]>({
    queryKey: ['matches'],
    queryFn: () => apiClient.get('/matches/mine').then((r) => r.data),
  });

  const current = (resumes ?? []).filter((r) => !r.supersededAt);
  const hasResume = current.length > 0;
  const hasConfirmed = current.some((r) => r.status === 'parsed' && !!r.confirmedAt);
  const hasMatches = (matches?.length ?? 0) > 0;
  const hasApproved = !!matches?.some((m) => m.applicantStatus === 'approved');
  const waiting = matches?.filter((m) => canApprove(m) && m.applicantStatus === 'pending' && !m.jobStopped).length ?? 0;
  const eligibleCount = matches?.filter((m) => m.eligible).length ?? 0;
  const top = [...(matches ?? [])].sort((a, b) => b.score - a.score).slice(0, 3);

  // the target role is picked while uploading, so "pick a role" is part of step 1
  const done = [hasResume, hasConfirmed, hasMatches, hasApproved];
  const firstOpen = done.findIndex((d) => !d);
  const steps: { title: string; text: string; href: string; action: string }[] = [
    { title: 'Upload your resume', text: 'Pick the kind of role it is for, then add a PDF.', href: '/applicant/resume', action: 'Upload resume' },
    { title: 'Confirm the parsed details', text: 'Check skills and academic details. Only a confirmed resume is matched.', href: '/applicant/resume', action: 'Review details' },
    { title: 'See your matches', text: 'Matching starts after you confirm. Results appear here by themselves.', href: '/applicant/matches', action: 'Open matches' },
    { title: 'Approve sharing', text: 'A company only sees your resume after you approve it.', href: '/applicant/matches', action: waiting > 0 ? `Review ${waiting} waiting` : 'Open matches' },
  ];
  const stateOf = (i: number): StepState => (done[i] ? 'done' : i === firstOpen ? 'current' : 'todo');
  const ready = !resumesLoading && !matchesLoading;

  return (
    <div className="max-w-3xl">
      {profile && !profile.name && <ProfileBanner onClick={() => setIsProfileOpen(true)} />}
      <ApplicantProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <h1 className="font-heading text-2xl text-ink mb-1">Dashboard</h1>
      <p className="text-sm text-ink-grey mb-6">{resumesLoading ? 'Checking your resume…' : resumeSentence(resumes)}</p>

      <h2 className="font-heading text-lg text-ink mb-3">Your progress</h2>
      {!ready ? (
        <CardSkeleton />
      ) : (
        <Stagger>
          <ol className="bg-paper-raised border border-hairline rounded-xl divide-y divide-hairline">
            {steps.map((step, i) => {
              const state = stateOf(i);
              return (
                <StaggerItem key={step.title}>
                  <li className={cn('flex items-start gap-3 px-4 py-3.5', state === 'current' && 'bg-accent-soft/50')} aria-current={state === 'current' ? 'step' : undefined}>
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                        state === 'done' && 'bg-success text-white',
                        state === 'current' && 'bg-accent text-white',
                        state === 'todo' && 'bg-hairline-soft text-ink-grey border border-hairline',
                      )}
                    >
                      {state === 'done' ? <Check className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm font-medium', state === 'todo' ? 'text-ink-grey' : 'text-ink')}>
                        {step.title}
                        <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (next step)' : ' (later)'}</span>
                      </p>
                      <p className="text-xs text-ink-grey mt-0.5">{step.text}</p>
                    </div>
                    {state === 'current' && (
                      <Link
                        href={step.href}
                        className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-lg bg-accent text-white hover:opacity-90 transition-opacity"
                      >
                        {step.action}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Link>
                    )}
                  </li>
                </StaggerItem>
              );
            })}
          </ol>
        </Stagger>
      )}

      <div className="grid grid-cols-2 gap-4 mt-6">
        <StatCard value={matchesLoading ? undefined : (matches?.length ?? 0)} label="Total matches" href="/applicant/matches" />
        <StatCard value={matchesLoading ? undefined : eligibleCount} label="Eligible roles" tone="success" hint="you can share your resume with these" href="/applicant/matches" />
      </div>

      {top.length > 0 && (
        <>
          <h2 className="font-heading text-lg text-ink mt-8 mb-3">Your top matches</h2>
          <ul className="bg-paper-raised border border-hairline rounded-xl divide-y divide-hairline">
            {top.map((m) => (
              <li key={m.id}>
                <Link href={`/applicant/matches#match-${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper transition-colors">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink truncate">{m.roleTitle || 'Untitled role'}</span>
                    <span className="block text-xs text-ink-grey truncate">{m.companyName}</span>
                  </span>
                  <ScoreBadge score={m.score} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
