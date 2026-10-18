/** Every stream the gateway pushes to browsers (contract section 6; the "ws" column). */
export const GATEWAY_STREAMS = [
    'resume.parsed',
    'jd.extracted',
    'match.computed',
    'feedback.ready',
    'candidate.ready',
    'candidate.shortlisted',
    'candidate.rejected',
    'prep.ready',
    'rejection-feedback.ready',
    'company.status.changed',
    'job.approval.changed',
    'notification.created',
] as const;

export type EventData = Record<string, unknown>;

/**
 * Who gets the event (contract section 6): `applicantId || companyId || userId`.
 * The order matters: candidate.shortlisted carries both applicantId and companyId, and it is for the applicant.
 * notification.created carries only `userId` (the owner of the notification).
 */
export function recipientOf(data: EventData): string | undefined {
    for (const key of ['applicantId', 'companyId', 'userId'] as const) {
        const value = data[key];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
}

/**
 * What the browser receives. Almost always the event as it is; the only exception is the internal rejection reason:
 * matching-results-service never shows `reasonCategory` to the applicant (contract 5.6), so the live push must not either.
 */
export function publicPayload(stream: string, data: EventData): EventData {
    if (stream !== 'candidate.rejected') return data;
    const copy = { ...data };
    delete copy.reasonCategory;
    return copy;
}