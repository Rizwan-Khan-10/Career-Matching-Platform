'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ShortlistMode } from '@/types/match';

/** What the company saved to be pre-filled in the shortlist form. Every field is optional; {} = nothing saved. */
export interface ShortlistDefaults {
    roundName?: string;
    mode?: ShortlistMode;
    link?: string;
    address?: string;
    bring?: string;
    note?: string;
}

export const SHORTLIST_DEFAULTS_KEY = ['shortlistDefaults'] as const;

/** The date and time is never saved: it is different for every candidate. */
export function pickDefaults(v: Partial<Record<keyof ShortlistDefaults, string | undefined>>): ShortlistDefaults {
    const out: ShortlistDefaults = {};
    if (v.roundName?.trim()) out.roundName = v.roundName.trim();
    if (v.mode) out.mode = v.mode as ShortlistMode;
    if (v.link?.trim()) out.link = v.link.trim();
    if (v.address?.trim()) out.address = v.address.trim();
    if (v.bring?.trim()) out.bring = v.bring.trim();
    if (v.note?.trim()) out.note = v.note.trim();
    return out;
}

export function useShortlistDefaults() {
    return useQuery<ShortlistDefaults>({
        queryKey: SHORTLIST_DEFAULTS_KEY,
        queryFn: () => apiClient.get('/companies/me/shortlist-defaults').then((r) => r.data),
    });
}

export function useSaveShortlistDefaults() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (defaults: ShortlistDefaults) =>
            apiClient.put('/companies/me/shortlist-defaults', defaults).then((r) => r.data as ShortlistDefaults),
        onSuccess: (saved) => queryClient.setQueryData(SHORTLIST_DEFAULTS_KEY, saved),
    });
}
