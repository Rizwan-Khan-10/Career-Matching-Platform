import { z } from 'zod';

export const jobRoleSchema = z.object({
    title: z.string().min(1, 'Role title is required'),
    requiredSkills: z.array(z.string().min(1)).max(50, 'Keep it under 50 skills'),
    preferredSkills: z.array(z.string().min(1)).max(30, 'Keep it under 30 skills').optional(),
    // null = "cleared by the user" (undefined would mean "leave unchanged" on the server)
    minExperienceYears: z
        .number({ error: 'Enter a number' })
        .min(0, "Can't be negative")
        .max(60, 'That looks too high')
        .nullable()
        .optional(),
    qualifications: z.string().max(300, 'Keep it under 300 characters').nullable().optional(),
});

export type JobRoleValues = z.infer<typeof jobRoleSchema>;