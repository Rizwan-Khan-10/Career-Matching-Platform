/**
 * Display label of a resume's target role, e.g. "Backend · Java" (same text resume-service builds as `targetLabel`,
 * contract §4.9). Resumes are read through read-only SQL here, so the label is rebuilt from the taxonomy ids (§4.10).
 */
const TRACK_LABELS: Record<string, string> = {
    frontend: 'Frontend',
    backend: 'Backend',
    fullstack: 'Full-stack',
    mobile: 'Mobile',
    data_ml: 'Data / ML / AI',
    devops_cloud: 'DevOps / Cloud',
    qa: 'QA / Testing',
    other: 'Other',
};

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

export function targetLabel(trackId: string, stackId: string): string {
    const track = TRACK_LABELS[trackId] ?? trackId;
    if (trackId === 'other') return track;
    return `${track} · ${STACK_LABELS[stackId] ?? stackId}`;
}
