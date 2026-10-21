'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/admin/Pill';
import { ACADEMIC_LABELS, type AcademicField } from '@/lib/academic';
import { useOpenResume } from '@/lib/hooks/useOpenResume';
import type { PeopleViewer } from '@/lib/hooks/useStagePeople';
import type { PersonRowData } from '@/types/stats';

const MAX_CHIPS = 3;

function statusBadge(p: PersonRowData): { label: string; tone: 'success' | 'danger' | 'accent' | 'muted'; at: string | null } {
    if (p.decision === 'shortlisted') return { label: 'Shortlisted', tone: 'success', at: p.decidedAt };
    if (p.decision === 'rejected') return { label: 'Rejected', tone: 'danger', at: p.decidedAt };
    if (p.approvedAt) return { label: 'Applied', tone: 'accent', at: p.approvedAt };
    if (p.eligible === true) return { label: 'Matched', tone: 'muted', at: p.scannedAt };
    if (p.eligible === false) return { label: 'Scanned, not eligible', tone: 'muted', at: p.scannedAt };
    return { label: 'Resume parsed', tone: 'muted', at: p.resume.parsedAt };
}

function Timeline({ p }: { p: PersonRowData }) {
    const steps = [
        { label: 'Scanned', at: p.scannedAt },
        { label: 'Approved sharing', at: p.approvedAt },
        { label: p.decision === 'rejected' ? 'Rejected' : 'Shortlisted', at: p.decidedAt },
    ].filter((s) => s.at);
    if (steps.length === 0) return null;
    return (
        <p className="text-xs text-ink-grey mt-2">
            {steps.map((s, i) => (
                <span key={s.label}>
                    {i > 0 && ' → '}
                    {s.label} <span title={new Date(s.at!).toLocaleString()}>{timeAgo(s.at!)}</span>
                </span>
            ))}
        </p>
    );
}

export function PersonRow({ person: p, viewer, showRole }: { person: PersonRowData; viewer: PeopleViewer; showRole: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const resume = useOpenResume();
    const name = p.name?.trim() || (p.email ? `Unnamed (${p.email.split('@')[0]})` : 'Unnamed applicant');
    const badge = statusBadge(p);
    const details = [
        p.branch && p.branch !== 'Unknown' ? p.branch : null,
        p.cgpa != null ? `CGPA ${p.cgpa}` : null,
        p.passingYear != null ? String(p.passingYear) : null,
    ].filter(Boolean);
    const unverified = p.unverifiedRules.filter((r): r is AcademicField => r in ACADEMIC_LABELS);

    return (
        <div className="border-b border-hairline last:border-0">
            <div className="flex items-start gap-3 px-4 py-3">
                <Avatar name={name} size={36} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-ink truncate">{name}</p>
                        <Pill tone={badge.tone}>{badge.label}</Pill>
                        {badge.at && <span className="text-xs text-ink-grey">{timeAgo(badge.at)}</span>}
                    </div>
                    {viewer === 'admin' && p.email && <p className="text-xs text-ink-grey truncate">{p.email}</p>}
                    <p className="text-xs text-ink-grey">
                        {details.length > 0 ? details.join(' · ') : 'No academic details yet'}
                        {showRole && p.roleTitle && ` · ${p.roleTitle}${viewer === 'admin' && p.companyName ? ` at ${p.companyName}` : ''}`}
                    </p>
                    {p.matchedSkills.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {p.matchedSkills.slice(0, MAX_CHIPS).map((s) => (
                                <span key={s} className="bg-success-soft text-success text-xs font-medium px-2 py-0.5 rounded-full">{s}</span>
                            ))}
                            {p.matchedSkills.length > MAX_CHIPS && (
                                <span className="text-xs text-ink-grey self-center">+{p.matchedSkills.length - MAX_CHIPS}</span>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    {p.score != null && (
                        <span className="text-xs font-mono text-success bg-success-soft px-2.5 py-1 rounded-full">{Math.round(p.score * 100)}%</span>
                    )}
                    {p.resume.hasPdf && p.resume.resumeId ? (
                        <button
                            type="button"
                            disabled={resume.pending}
                            onClick={() => resume.open(p.resume.resumeId!)}
                            className="text-xs font-medium px-3 py-1.5 rounded-full bg-accent text-white disabled:opacity-50"
                        >
                            View resume
                        </button>
                    ) : (
                        <span className="text-xs text-ink-grey">Resume not shared yet</span>
                    )}
                </div>
            </div>

            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex items-center gap-1 text-xs text-ink-grey hover:text-ink px-4 pb-2 ml-12 transition-colors"
            >
                <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Hide details' : 'Show details'}
            </button>

            {expanded && (
                <div className="px-4 pb-4 ml-12 text-xs text-ink-grey space-y-2">
                    {(p.headline || p.location) && <p>{[p.headline, p.location].filter(Boolean).join(' · ')}</p>}
                    {viewer === 'admin' && p.phone && <p>Phone: {p.phone}</p>}
                    {p.backlogs != null && <p>{p.backlogs === 0 ? 'No backlogs' : `${p.backlogs} backlog${p.backlogs === 1 ? '' : 's'}`}{p.academicVerified ? ' · verified by admin' : ''}</p>}
                    {p.resume.targetLabel && <p>Resume for: <span className="text-ink">{p.resume.targetLabel}</span></p>}
                    {p.matchedSkills.length > 0 && <p>Matched: <span className="text-ink">{p.matchedSkills.join(', ')}</span></p>}
                    {p.missingSkills.length > 0 && <p>Missing: <span className="text-ink">{p.missingSkills.join(', ')}</span></p>}
                    {unverified.length > 0 && <p>Not verified, so not applied: {unverified.map((r) => ACADEMIC_LABELS[r]).join(', ')}</p>}
                    {p.decision === 'rejected' && (p.rejectReason || p.rejectMessage) && (
                        <p>Reject reason: <span className="text-ink">{[p.rejectReason?.replace(/_/g, ' '), p.rejectMessage].filter(Boolean).join(' · ')}</span></p>
                    )}
                    <Timeline p={p} />
                    {!p.resume.hasPdf && p.resume.summary && (
                        <div className="border border-hairline rounded-lg p-3 bg-paper">
                            <p className="font-medium text-ink mb-1">From the parsed resume</p>
                            {p.resume.summary.education && <p>Education: {p.resume.summary.education}</p>}
                            {p.resume.summary.skills.length > 0 && <p>Skills: {p.resume.summary.skills.join(', ')}</p>}
                            {p.resume.summary.projects.length > 0 && <p>Projects: {p.resume.summary.projects.join(', ')}</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
