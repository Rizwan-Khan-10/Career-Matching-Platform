import techRoles from './tech-roles.json';

export interface TaxonomyTrack {
    id: string;
    label: string;
    stacks: string[];
}

/**
 * Copy of the shared taxonomy (contract 4.10). resume-service owns the original
 * (apps/resume-service/src/taxonomy/tech-roles.json): keep this file identical to it.
 */
export const TRACKS: TaxonomyTrack[] = techRoles.tracks;
export const TRACK_IDS: string[] = TRACKS.map((t) => t.id);
export const ALL_STACK_IDS: string[] = Array.from(new Set(TRACKS.flatMap((t) => t.stacks)));

/**
 * Cross-field rule for a role: every stack must belong to the role's track.
 * Returns a user-facing message, or null when the pair is fine.
 * track missing/null/"other" = no gating, so stacks make no sense there (contract 4.1).
 */
export function roleTargetError(track: unknown, stacks: unknown): string | null {
    const list = Array.isArray(stacks) ? (stacks as string[]) : [];
    if (list.length === 0) return null;
    if (track == null || track === '') return 'Choose a track before choosing stacks';

    const found = TRACKS.find((t) => t.id === track);
    if (!found) return `Unknown track "${String(track)}"`;
    if (found.stacks.length === 0) return `Stacks cannot be set for track "${found.id}"`;

    const bad = list.filter((s) => !found.stacks.includes(s));
    return bad.length ? `Stack "${bad[0]}" does not belong to track "${found.id}"` : null;
}
