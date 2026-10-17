import type { ShortlistFormValues, RejectFormValues } from '@/lib/schemas/decision';
import type { RejectReasonCategory, ShortlistInfo, ShortlistMode } from '@/types/match';

// contract 5.6: body of PATCH /matches/:id/decision
export type DecisionBody =
    | { decision: 'shortlisted'; shortlist: ShortlistInfo }
    | { decision: 'rejected'; rejection: { reasonCategory: RejectReasonCategory; message?: string } }
    | { decision: null };

export const MODE_OPTIONS: { value: ShortlistMode; label: string }[] = [
    { value: 'online', label: 'Online (video call)' },
    { value: 'offline', label: 'In person' },
    { value: 'phone', label: 'Phone call' },
];

// aiFeedback: for these reasons the feedback-agent also writes improvement tips for the candidate (spec 9.6)
export const REJECT_REASONS: { value: RejectReasonCategory; label: string; aiFeedback: boolean }[] = [
    { value: 'skills_gap', label: 'Skills gap', aiFeedback: true },
    { value: 'experience', label: 'Not enough experience', aiFeedback: true },
    { value: 'resume_quality', label: 'Resume quality', aiFeedback: true },
    { value: 'position_filled', label: 'Position already filled', aiFeedback: false },
    { value: 'other', label: 'Other', aiFeedback: false },
];

export const modeLabel = (mode: ShortlistMode) => MODE_OPTIONS.find((m) => m.value === mode)?.label ?? mode;
export const reasonLabel = (reason: RejectReasonCategory) =>
    REJECT_REASONS.find((r) => r.value === reason)?.label ?? reason;

export function formatWhen(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

/** ISO string -> value for <input type="datetime-local"> (local time, no seconds). */
export function toLocalInput(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Empty optional fields are left out. Link only goes with an online round, address only with an in-person one. */
export function toShortlistBody(v: ShortlistFormValues): DecisionBody {
    const shortlist: ShortlistInfo = { roundName: v.roundName, mode: v.mode };
    if (v.scheduledAt) shortlist.scheduledAt = new Date(v.scheduledAt).toISOString();
    if (v.bring) shortlist.bring = v.bring;
    if (v.mode === 'online' && v.link) shortlist.link = v.link;
    if (v.mode === 'offline' && v.address) shortlist.address = v.address;
    if (v.note) shortlist.note = v.note;
    return { decision: 'shortlisted', shortlist };
}

export function toRejectBody(v: RejectFormValues): DecisionBody {
    return {
        decision: 'rejected',
        rejection: { reasonCategory: v.reasonCategory, ...(v.message ? { message: v.message } : {}) },
    };
}