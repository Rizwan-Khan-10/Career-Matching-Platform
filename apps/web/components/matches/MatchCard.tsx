'use client';

import { motion } from 'motion/react';
import { SkillChips } from '@/components/matches/SkillChips';
import { ConsentSection } from '@/components/matches/ConsentSection';
import { ScoreBadge, SCORE_MEANING } from '@/components/matches/ScoreBadge';
import { matchGroup, plainReason } from '@/lib/matchReason';
import { UnverifiedRulesNote } from '@/components/matches/UnverifiedRulesNote';
import { ShortlistCard } from '@/components/matches/ShortlistCard';
import { RejectionCard } from '@/components/matches/RejectionCard';
import type { Match } from '@/types/match';

function badgeFor(match: Match): { label: string; className: string } {
    if (match.outcome === 'shortlisted') return { label: 'Shortlisted', className: 'bg-success-soft text-success' };
    if (match.outcome === 'rejected') return { label: 'Not selected', className: 'bg-paper text-ink-grey border border-hairline' };
    if (match.eligible) return { label: 'Eligible', className: 'bg-success-soft text-success' };
    if (matchGroup(match) === 'almost') return { label: 'Possible match', className: 'bg-warning-soft text-warning' };
    return { label: 'Not eligible', className: 'bg-danger-soft text-danger' };
}

export function MatchCard({
    match,
    busy,
    onDecide,
    onOpenProfile,
}: {
    match: Match;
    busy: boolean;
    onDecide: (approved: boolean) => void;
    onOpenProfile: () => void;
}) {
    const badge = badgeFor(match);

    return (
        <div className="bg-paper-raised border border-hairline rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{match.roleTitle || 'Untitled role'}</p>
                    <p className="text-xs text-ink-grey truncate">
                        {match.companyName}
                        {match.companyIndustry ? ` · ${match.companyIndustry}` : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ScoreBadge score={match.score} />
                        <span className="text-xs text-ink-grey">{SCORE_MEANING}</span>
                    </div>
                </div>
                <motion.span
                    key={badge.label}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${badge.className}`}
                >
                    {badge.label}
                </motion.span>
            </div>

            {match.resumeTargetLabel && (
                <p className="text-xs text-ink-grey mt-1.5">
                    Matched using: <span className="font-medium text-ink">{match.resumeTargetLabel}</span> resume
                </p>
            )}

            {match.reason && <p className="text-sm text-ink mt-2">{plainReason(match.reason)}</p>}

            <SkillChips label="Skills you have" skills={match.matchedSkills} kind="matched" />
            <SkillChips label="Related experience" skills={match.partialSkills} kind="partial" />
            <SkillChips label="Skills to add" skills={match.missingSkills} kind="missing" />

            <UnverifiedRulesNote rules={match.unverifiedRules ?? []} onOpenProfile={onOpenProfile} />

            <ConsentSection match={match} busy={busy} onDecide={onDecide} />

            {match.outcome === 'shortlisted' && <ShortlistCard match={match} />}
            {match.outcome === 'rejected' && <RejectionCard match={match} />}

            {!match.eligible && match.feedback && (
                <div className="mt-3 border-l-2 border-hairline pl-3">
                    <p className="text-xs text-ink-grey mb-0.5">How to improve</p>
                    <p className="text-sm text-ink whitespace-pre-line">{match.feedback}</p>
                </div>
            )}
        </div>
    );
}