import { GATEWAY_STREAMS, publicPayload, recipientOf } from './gateway-events';

describe('gateway events', () => {
    it('listens to every stream of contract section 6 that has the websocket as a consumer', () => {
        for (const stream of [
            'resume.parsed', 'jd.extracted', 'match.computed', 'feedback.ready', 'candidate.ready',
            'candidate.shortlisted', 'candidate.rejected', 'prep.ready', 'rejection-feedback.ready',
            'company.status.changed', 'job.approval.changed', 'notification.created',
        ]) {
            expect(GATEWAY_STREAMS).toContain(stream);
        }
        expect(GATEWAY_STREAMS).toHaveLength(12);
    });

    it('routes by applicantId, then companyId, then userId', () => {
        expect(recipientOf({ applicantId: 'a1', companyId: 'c1' })).toBe('a1'); // candidate.shortlisted goes to the applicant
        expect(recipientOf({ companyId: 'c1', status: 'approved' })).toBe('c1');
        expect(recipientOf({ userId: 'u1', notification: {} })).toBe('u1');
        expect(recipientOf({ applicantId: '', companyId: 'c1' })).toBe('c1');
        expect(recipientOf({ applicantId: 42, userId: 'u1' })).toBe('u1');
        expect(recipientOf({ matchId: 'm1' })).toBeUndefined();
    });

    it('never tells the applicant the internal rejection reason (contract 5.6)', () => {
        const data = { matchId: 'm1', applicantId: 'a1', reasonCategory: 'skills_gap', message: 'Thanks for applying' };
        expect(publicPayload('candidate.rejected', data)).toEqual({ matchId: 'm1', applicantId: 'a1', message: 'Thanks for applying' });
        expect(data.reasonCategory).toBe('skills_gap'); // the original object is untouched
    });

    it('leaves every other event as it is', () => {
        const data = { userId: 'u1', notification: { id: 'n1' } };
        expect(publicPayload('notification.created', data)).toBe(data);
    });
});