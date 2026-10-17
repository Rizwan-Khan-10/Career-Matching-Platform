import { z } from 'zod';

// the note is optional; the company sees it in the "job rejected" notification
export const rejectJobSchema = z.object({
  note: z.string().trim().max(500, 'Keep it under 500 characters'),
});
export type RejectJobValues = z.infer<typeof rejectJobSchema>;