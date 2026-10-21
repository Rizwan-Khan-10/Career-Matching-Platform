import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { PeopleFilters, PeoplePageData } from '@/types/stats';

export type PeopleViewer = 'admin' | 'company';

export interface PeopleParams extends PeopleFilters {
    q?: string;
    page?: number;
    limit?: number;
    sort?: 'score' | 'name' | 'date';
}

export const peopleUrl = (viewer: PeopleViewer) => (viewer === 'admin' ? '/stats/admin/people' : '/stats/company/people');

export const fetchPeople = (viewer: PeopleViewer, params: PeopleParams) =>
    apiClient.get<PeoplePageData>(peopleUrl(viewer), { params }).then((r) => r.data);

/** One page of the people behind a dashboard number. keepPreviousData: paging and typing do not flicker. */
export function useStagePeople(viewer: PeopleViewer, params: PeopleParams | null) {
    return useQuery<PeoplePageData>({
        queryKey: ['stagePeople', viewer, params],
        queryFn: () => fetchPeople(viewer, params as PeopleParams),
        enabled: params !== null,
        placeholderData: keepPreviousData,
    });
}
