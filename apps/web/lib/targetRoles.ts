import type { TargetRoles } from '@/types/targetRoles';

// fallback labels in case the API sends plain stack ids
export const STACK_LABELS: Record<string, string> = {
  java: 'Java',
  python: 'Python',
  javascript: 'JavaScript / TypeScript (Node, React…)',
  dotnet: '.NET / C#',
  go: 'Go',
  php: 'PHP',
  ruby: 'Ruby',
  android: 'Android',
  ios: 'iOS',
  cross_platform: 'Cross-platform',
  data_analyst: 'Data analyst',
  data_engineer: 'Data engineer',
  ml_ai: 'ML / AI',
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'Google Cloud',
  general: 'General',
  manual: 'Manual testing',
  automation: 'Test automation',
  other: 'Other',
};

export function stackLabel(id: string): string {
  return STACK_LABELS[id] ?? id.replace(/_/g, ' ');
}

// fallback labels for tracks (the API sends labels too)
export const TRACK_LABELS: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Full-stack',
  mobile: 'Mobile',
  data_ml: 'Data / ML / AI',
  devops_cloud: 'DevOps / Cloud',
  qa: 'QA / Testing',
  other: 'Other',
};

export function trackLabel(id: string): string {
  return TRACK_LABELS[id] ?? id.replace(/_/g, ' ');
}

type RawStack = string | { id: string; label?: string };
interface RawTaxonomy {
  tracks?: { id: string; label?: string; stacks?: RawStack[] }[];
}

/** Accepts stacks as plain ids or as { id, label } objects. */
export function normalizeTargetRoles(raw: RawTaxonomy): TargetRoles {
  return {
    tracks: (raw.tracks ?? []).map((t) => ({
      id: t.id,
      label: t.label ?? t.id,
      stacks: (t.stacks ?? []).map((s) =>
        typeof s === 'string' ? { id: s, label: stackLabel(s) } : { id: s.id, label: s.label ?? stackLabel(s.id) },
      ),
    })),
  };
}