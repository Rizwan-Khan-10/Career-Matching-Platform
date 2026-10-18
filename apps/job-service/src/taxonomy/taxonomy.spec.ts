import { ALL_STACK_IDS, TRACK_IDS, roleTargetError } from './taxonomy';

describe('taxonomy', () => {
    it('exposes the track and stack ids of contract 4.10', () => {
        expect(TRACK_IDS).toEqual(['frontend', 'backend', 'fullstack', 'mobile', 'data_ml', 'devops_cloud', 'qa', 'other']);
        expect(ALL_STACK_IDS).toEqual(expect.arrayContaining(['java', 'javascript', 'android', 'ml_ai', 'aws', 'manual', 'other']));
    });

    describe('roleTargetError', () => {
        it('accepts no stacks at all (any stack / no gating)', () => {
            expect(roleTargetError(undefined, undefined)).toBeNull();
            expect(roleTargetError(null, [])).toBeNull();
            expect(roleTargetError('backend', [])).toBeNull();
            expect(roleTargetError('other', null)).toBeNull();
        });

        it('accepts stacks that belong to the track', () => {
            expect(roleTargetError('backend', ['java', 'python'])).toBeNull();
            expect(roleTargetError('mobile', ['android'])).toBeNull();
        });

        it('rejects a stack of another track', () => {
            expect(roleTargetError('backend', ['android'])).toBe('Stack "android" does not belong to track "backend"');
            expect(roleTargetError('frontend', ['java'])).toMatch(/does not belong/);
        });

        it('rejects stacks without a track, and stacks for the "other" track', () => {
            expect(roleTargetError(null, ['java'])).toBe('Choose a track before choosing stacks');
            expect(roleTargetError('other', ['java'])).toBe('Stacks cannot be set for track "other"');
        });

        it('rejects an unknown track', () => {
            expect(roleTargetError('blockchain', ['java'])).toBe('Unknown track "blockchain"');
        });
    });
});
