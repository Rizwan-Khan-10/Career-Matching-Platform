import techRoles from './tech-roles.json';

export interface TaxonomyTrack {
    id: string;
    label: string;
    stacks: string[];
}

export interface TargetRolesResponse {
    tracks: { id: string; label: string; stacks: { id: string; label: string }[] }[];
}

/** Single source of truth: src/taxonomy/tech-roles.json (contract 4.10). */
export const TRACKS: TaxonomyTrack[] = techRoles.tracks;
export const TRACK_IDS: string[] = TRACKS.map((t) => t.id);
export const ALL_STACK_IDS: string[] = Array.from(new Set(TRACKS.flatMap((t) => t.stacks)));

const STACK_LABELS: Record<string, string> = {
    java: 'Java',
    python: 'Python',
    javascript: 'JavaScript / TypeScript (Node, React…)',
    dotnet: '.NET / C#',
    go: 'Go',
    php: 'PHP',
    ruby: 'Ruby',
    android: 'Android',
    ios: 'iOS',
    cross_platform: 'Cross-platform (Flutter, React Native…)',
    data_analyst: 'Data Analyst',
    data_engineer: 'Data Engineer',
    ml_ai: 'ML / AI',
    aws: 'AWS',
    azure: 'Azure',
    gcp: 'Google Cloud',
    general: 'General',
    manual: 'Manual testing',
    automation: 'Automation testing',
    other: 'Other',
};

export function stackLabel(stackId: string): string {
    return STACK_LABELS[stackId] ?? stackId;
}

function findTrack(trackId: string): TaxonomyTrack | undefined {
    return TRACKS.find((t) => t.id === trackId);
}

/** "other" is allowed as a stack in every track (applicant opts out of gating); otherwise the stack must belong to the track. */
export function isValidTarget(trackId: string, stackId: string): boolean {
    const track = findTrack(trackId);
    if (!track) return false;
    return stackId === 'other' || track.stacks.includes(stackId);
}

export function buildTargetKey(trackId: string, stackId: string): string {
    return `${trackId}:${stackId}`;
}

/** "Backend · Java"; the "other" track is just "Other". */
export function targetLabel(trackId: string, stackId: string): string {
    const track = findTrack(trackId);
    const trackName = track?.label ?? trackId;
    if (trackId === 'other') return trackName;
    return `${trackName} · ${stackLabel(stackId)}`;
}

export function getTargetRoles(): TargetRolesResponse {
    return {
        tracks: TRACKS.map((t) => ({
            id: t.id,
            label: t.label,
            stacks: t.stacks.map((s) => ({ id: s, label: stackLabel(s) })),
        })),
    };
}