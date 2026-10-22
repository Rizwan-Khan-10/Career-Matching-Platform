import { z } from 'zod';

export const ROLE_LEVELS = ['fresher', 'experienced', 'any'] as const;

const YEAR_MESSAGE = 'Passing years must be numbers like 2026';

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
    maxExperienceYears: z
        .number({ error: 'Enter a number' })
        .min(0, "Can't be negative")
        .max(60, 'That looks too high')
        .nullable()
        .optional(),
    strictMinExperience: z.boolean().nullable().optional(),
    qualifications: z.string().max(300, 'Keep it under 300 characters').nullable().optional(),

    // contract 4.1: every rule below is optional; null = "rule not set"
    level: z.enum(ROLE_LEVELS).nullable().optional(),
    track: z.string().min(1).nullable().optional(),
    stacks: z.array(z.string().min(1)).max(10, 'Pick at most 10 stacks').nullable().optional(),
    minCgpa: z
        .number({ error: 'Enter a number like 7.5' })
        .min(0, "Can't be negative")
        .max(10, 'CGPA is out of 10')
        .nullable()
        .optional(),
    allowedBranches: z.array(z.string().min(1)).max(20, 'Keep it under 20 branches').nullable().optional(),
    passingYears: z
        .array(
            z
                .number({ error: YEAR_MESSAGE })
                .int(YEAR_MESSAGE)
                .min(2000, 'That year looks too old')
                .max(2100, 'That year looks too far ahead'),
        )
        .max(10, 'Keep it under 10 years')
        .nullable()
        .optional(),
    maxBacklogs: z
        .number({ error: 'Enter a whole number' })
        .int('Enter a whole number')
        .min(0, "Can't be negative")
        .max(50, 'That looks too high')
        .nullable()
        .optional(),
}).refine(
    (v) => v.minExperienceYears == null || v.maxExperienceYears == null || v.maxExperienceYears >= v.minExperienceYears,
    { path: ['maxExperienceYears'], message: 'Max experience cannot be below the minimum' },
);

export type JobRoleValues = z.infer<typeof jobRoleSchema>;