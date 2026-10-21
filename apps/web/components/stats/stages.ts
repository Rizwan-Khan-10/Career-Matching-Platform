import type { PeopleStage } from '@/types/stats';

export const STAGE_LABEL: Record<PeopleStage, string> = {
    parsed: 'Resumes parsed',
    scanned: 'Scanned',
    matched: 'Matched',
    applied: 'Applied',
    shortlisted: 'Shortlisted',
    rejected: 'Rejected',
};

/** What a company may open as a list; scanned / matched open the aggregate insights panel instead. */
export const COMPANY_LIST_STAGES: PeopleStage[] = ['applied', 'shortlisted', 'rejected'];

/** What the drawer is currently showing: set by a click on a number. */
export interface Drill {
    title: string;            // e.g. "Backend · Applied"
    filters: import('@/types/stats').PeopleFilters;
}
