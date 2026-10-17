import type { ApplicantProfile } from '@/types/profile';
import type { ParsedResumeData } from '@/types/resume';

export const ACADEMIC_FIELDS = ['cgpa', 'branch', 'passingYear', 'backlogs'] as const;
export type AcademicField = (typeof ACADEMIC_FIELDS)[number];
export type AcademicSource = 'verified' | 'resume' | 'self' | 'unknown';
export type AcademicValue = string | number;

export interface EffectiveField {
  value: AcademicValue | null;
  source: AcademicSource;
}

export const ACADEMIC_LABELS: Record<AcademicField, string> = {
  cgpa: 'CGPA',
  branch: 'Branch',
  passingYear: 'Passing year',
  backlogs: 'Backlogs',
};

function clean(field: AcademicField, value: AcademicValue | null | undefined): AcademicValue | null {
  if (value == null || value === '') return null;
  if (field === 'cgpa' && typeof value === 'number') {
    const onTenScale = value > 10 ? value / 10 : value; // a value above 10 is a percentage
    return Math.round(onTenScale * 100) / 100;
  }
  return value;
}

/** Contract 4.3: verified > resume (the one being evaluated) > self > unknown. */
export function effectiveAcademic(
  profile: ApplicantProfile | undefined,
  parsed: ParsedResumeData | null | undefined,
): Record<AcademicField, EffectiveField> {
  const result = {} as Record<AcademicField, EffectiveField>;
  for (const field of ACADEMIC_FIELDS) {
    const fromProfile = clean(field, profile?.[field]);
    const fromResume = clean(field, parsed?.[field]);
    if (profile?.academicVerified && fromProfile != null) result[field] = { value: fromProfile, source: 'verified' };
    else if (fromResume != null) result[field] = { value: fromResume, source: 'resume' };
    else if (fromProfile != null) result[field] = { value: fromProfile, source: 'self' };
    else result[field] = { value: null, source: 'unknown' };
  }
  return result;
}