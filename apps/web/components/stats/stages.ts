import type { PeopleStage } from '@/types/stats';

export const STAGE_LABEL: Record<PeopleStage, string> = {
    parsed: 'Resumes parsed',
    scanned: 'Scanned',
    matched: 'Matched',
    applied: 'Applied',
    shortlisted: 'Shortlisted',
    rejected: 'Rejected',
};

/** One plain sentence per stage, shown under table titles and in the funnel. */
export const STAGE_HELP: Record<PeopleStage, string> = {
    parsed: 'Resume was read successfully',
    scanned: 'Checked against a job role',
    matched: 'Resume fits the role\u2019s requirements',
    applied: 'Matched and approved sharing their resume',
    shortlisted: 'Recruiter shortlisted them',
    rejected: 'Recruiter rejected them',
};

/** What a company may open as a list; scanned / matched open the aggregate insights panel instead. */
export const COMPANY_LIST_STAGES: PeopleStage[] = ['applied', 'shortlisted', 'rejected'];

/** What the drawer is currently showing: set by a click on a number. */
export interface Drill {
    title: string;            // e.g. "Backend · Applied"
    filters: import('@/types/stats').PeopleFilters;
}
