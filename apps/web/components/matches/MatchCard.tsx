'use client';

import { motion } from 'motion/react';
import { SkillChips } from '@/components/matches/SkillChips';
import { ConsentSection } from '@/components/matches/ConsentSection';
import { UnverifiedRulesNote } from '@/components/matches/UnverifiedRulesNote';
import { ShortlistCard } from '@/components/matches/ShortlistCard';
import { RejectionCard } from '@/components/matches/RejectionCard';
import type { Match } from '@/types/match';

function badgeFor(match: Match): { label: string; className: string } {
    if (match.outcome === 'shortlisted') return { label: 'Shortlisted', className: 'bg-success-soft text-success' };
    if (match.outcome === 'rejected') return { label: 'Not selected', className: 'bg-paper text-ink-grey border border-hairline' };
    return match.eligible
        ? { label: 'Eligible', className: 'bg-success-soft text-success' }
        : { label: 'Not eligible', className: 'bg-danger-soft text-danger' };
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
                    <p className="text-sm font-medium text-ink truncate">{match.roleTitle || `Role ${match.jobRoleId.slice(0, 8)}`}</p>
                    <p className="text-xs text-ink-grey truncate">
                        {match.companyName}
                        {match.companyIndustry ? ` · ${match.companyIndustry}` : ''}
                    </p>
                    <p className="text-xs text-ink-grey font-mono mt-0.5">Match: {Math.round(match.score * 100)}%</p>
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

            {match.reason && <p className="text-sm text-ink-grey mt-2">{match.reason}</p>}

            <SkillChips label="Skills you have" skills={match.matchedSkills} className="bg-success-soft text-success" />
            <SkillChips label="Related experience" skills={match.partialSkills} className="bg-accent-soft text-accent" />
            <SkillChips label="Skills to add" skills={match.missingSkills} className="bg-danger-soft text-danger" />

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