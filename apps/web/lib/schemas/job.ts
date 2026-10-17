import { z } from 'zod';

export const jobRoleSchema = z.object({
  title: z.string().min(1, 'Role title is required'),
  description: z.string().optional(),
  requirements: z.string().optional(),
});

export type JobRoleValues = z.infer<typeof jobRoleSchema>;

