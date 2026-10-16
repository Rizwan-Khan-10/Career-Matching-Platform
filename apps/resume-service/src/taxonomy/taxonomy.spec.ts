import { buildTargetKey, getTargetRoles, isValidTarget, targetLabel } from './taxonomy';

describe('taxonomy', () => {
    it('accepts a stack that belongs to the track', () => {
        expect(isValidTarget('backend', 'java')).toBe(true);
        expect(isValidTarget('mobile', 'ios')).toBe(true);
    });

    it('rejects a stack that belongs to another track', () => {
        expect(isValidTarget('frontend', 'java')).toBe(false);
        expect(isValidTarget('qa', 'python')).toBe(false);
    });

    it('allows "other" stack in every track, including the "other" track', () => {
        expect(isValidTarget('backend', 'other')).toBe(true);
        expect(isValidTarget('other', 'other')).toBe(true);
        expect(isValidTarget('other', 'java')).toBe(false);
    });

    it('rejects an unknown track', () => {
        expect(isValidTarget('blockchain', 'other')).toBe(false);
    });

    it('builds the key and the display label', () => {
        expect(buildTargetKey('backend', 'java')).toBe('backend:java');
        expect(targetLabel('backend', 'java')).toBe('Backend · Java');
        expect(targetLabel('fullstack', 'dotnet')).toBe('Full-stack · .NET / C#');
        expect(targetLabel('other', 'other')).toBe('Other');
    });

    it('serves every track with labelled stacks', () => {
        const { tracks } = getTargetRoles();
        expect(tracks.map((t) => t.id)).toEqual(['frontend', 'backend', 'fullstack', 'mobile', 'data_ml', 'devops_cloud', 'qa', 'other']);
        const backend = tracks.find((t) => t.id === 'backend')!;
        expect(backend.stacks).toContainEqual({ id: 'java', label: 'Java' });
        expect(tracks.find((t) => t.id === 'other')!.stacks).toEqual([]);
    });
});