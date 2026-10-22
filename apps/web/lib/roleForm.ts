import type { JobRoleRequirements, RoleLevel } from '@/types/job';

export const LEVEL_LABELS: Record<RoleLevel, string> = {
    fresher: 'Fresher',
    experienced: 'Experienced',
    any: 'Any level',
};

// everything the role form edits, as plain strings/arrays (numbers stay text until save)
export interface RoleFormState {
    title: string;
    skills: string[];
    preferred: string[];
    minExperienceYears: string;
    maxExperienceYears: string; // '' = no upper limit
    strictMinExperience: boolean;
    qualifications: string;
    level: string; // '' = not set
    track: string; // '' = no filter
    stacks: string[];
    minCgpa: string;
    allowedBranches: string[];
    passingYears: string; // "2026, 2027"
    maxBacklogs: string;
}

const text = (value: number | null | undefined) => (value != null ? String(value) : '');

export function toFormState(initial?: {
    title: string;
    requirements: JobRoleRequirements | null;
}): RoleFormState {
    const r = initial?.requirements;
    return {
        title: initial?.title ?? '',
        skills: r?.requiredSkills ?? [],
        preferred: r?.preferredSkills ?? [],
        minExperienceYears: text(r?.minExperienceYears),
        maxExperienceYears: text(r?.maxExperienceYears),
        strictMinExperience: r?.strictMinExperience === true,
        qualifications: r?.qualifications ?? '',
        level: r?.level ?? '',
        track: r?.track ?? '',
        stacks: r?.stacks ?? [],
        minCgpa: text(r?.minCgpa),
        allowedBranches: r?.allowedBranches ?? [],
        passingYears: (r?.passingYears ?? []).join(', '),
        maxBacklogs: text(r?.maxBacklogs),
    };
}

/** Pre-filled (never forced) when a company picks "Fresher": fresher roles rarely want more than ~1 year. */
export const FRESHER_DEFAULT_MAX_YEARS = 1;
/** Above this a "Fresher" role is probably a mistake: the form shows a warning, not an error. */
export const FRESHER_MAX_WARNING_YEARS = 5;

/** Level changed: for Fresher, pre-fill the max experience when the company left it empty. */
export function onLevelChange(form: RoleFormState, level: string): Partial<RoleFormState> {
    if (level === 'fresher' && form.maxExperienceYears.trim() === '') {
        return { level, maxExperienceYears: String(FRESHER_DEFAULT_MAX_YEARS) };
    }
    return { level };
}

/** Soft warnings (do not block saving). */
export function experienceWarning(form: RoleFormState): string | null {
    const max = form.maxExperienceYears.trim() === '' ? null : Number(form.maxExperienceYears);
    if (form.level === 'fresher' && max != null && max > FRESHER_MAX_WARNING_YEARS) {
        return `A fresher role with up to ${max} years of experience is unusual. Pick "Experienced" if that is what you want.`;
    }
    return null;
}

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

/**
 * Contract 4.1 payload. Empty fields are sent as null (not undefined) so that clearing a rule
 * really removes it on the server. `stacks: []` (track chosen, no stack) means "any stack in this track".
 */
export function toPayload(form: RoleFormState) {
    const years = form.passingYears
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
    const hasStackFilter = form.track !== '' && form.track !== 'other';

    return {
        title: form.title.trim(),
        requiredSkills: form.skills,
        preferredSkills: form.preferred,
        minExperienceYears: numberOrNull(form.minExperienceYears),
        maxExperienceYears: numberOrNull(form.maxExperienceYears),
        // only meaningful with a minimum; null = "not set" so clearing it really removes it
        strictMinExperience: form.strictMinExperience && form.minExperienceYears.trim() !== '' ? true : null,
        qualifications: form.qualifications.trim() || null,
        level: form.level || null,
        track: form.track || null,
        stacks: hasStackFilter ? form.stacks : null,
        minCgpa: numberOrNull(form.minCgpa),
        allowedBranches: form.allowedBranches.length > 0 ? form.allowedBranches : null,
        passingYears: years.length > 0 ? years : null,
        maxBacklogs: numberOrNull(form.maxBacklogs),
    };
}

/** Short lines for the role card, e.g. ["Min CGPA 7", "Batch: 2026, 2027", "No backlogs"]. */
export function describeRules(req: JobRoleRequirements | null | undefined): string[] {
    if (!req) return [];
    const rules: string[] = [];
    if (req.minCgpa != null) rules.push(`Min CGPA ${req.minCgpa}`);
    if (req.allowedBranches?.length) rules.push(`Branches: ${req.allowedBranches.join(', ')}`);
    if (req.passingYears?.length) rules.push(`Batch: ${req.passingYears.join(', ')}`);
    if (req.maxBacklogs != null) {
        rules.push(req.maxBacklogs === 0 ? 'No backlogs' : `Max ${req.maxBacklogs} backlog${req.maxBacklogs === 1 ? '' : 's'}`);
    }
    return rules;
}

/** "2-4 yrs experience", "2+ yrs experience", "Up to 1 yr experience"; null when neither bound is set. */
export function describeExperience(req: JobRoleRequirements | null | undefined): string | null {
    const min = req?.minExperienceYears ?? null;
    const max = req?.maxExperienceYears ?? null;
    const yrs = (n: number) => `${n} ${n === 1 ? 'yr' : 'yrs'}`;
    let text: string;
    if (min != null && max != null) text = min === max ? `${yrs(min)} experience` : `${min}-${max} yrs experience`;
    else if (min != null) text = `${min}+ yrs experience`;
    else if (max != null) text = `Up to ${yrs(max)} experience`;
    else return null;
    return min != null && min > 0 && req?.strictMinExperience ? `${text} (minimum required)` : text;
}
