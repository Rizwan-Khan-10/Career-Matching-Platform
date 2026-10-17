import { z } from 'zod';

export const SHORTLIST_MODES = ['online', 'offline', 'phone'] as const;
export const REJECT_CATEGORIES = ['skills_gap', 'experience', 'resume_quality', 'position_filled', 'other'] as const;

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);

// contract 5.6: roundName + mode are required, everything else is optional ('' = left empty)
export const shortlistSchema = z.object({
    roundName: z.string().trim().min(1, 'Round name is required').max(100, 'Keep it under 100 characters'),
    mode: z.enum(SHORTLIST_MODES, { error: 'Choose how the round will be held' }),
    scheduledAt: z
        .string()
        .refine((v) => v === '' || !Number.isNaN(new Date(v).getTime()), 'Enter a valid date and time'),
    bring: text(500),
    link: text(500).refine((v) => v === '' || /^https?:\/\//i.test(v), 'Link must start with http:// or https://'),
    address: text(300),
    note: text(1000),
});
export type ShortlistFormValues = z.infer<typeof shortlistSchema>;

// reasonCategory is required, the message is optional (and is the only text the candidate sees)
export const rejectSchema = z.object({
    reasonCategory: z.enum(REJECT_CATEGORIES, { error: 'Choose a reason' }),
    message: text(500),
});
export type RejectFormValues = z.infer<typeof rejectSchema>;