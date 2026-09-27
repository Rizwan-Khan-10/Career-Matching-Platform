import { z } from 'zod';

export const resumeProjectSchema = z.object({
    name: z.string().min(1, 'Project name is required'),
    description: z.string().min(1, 'Add a short description'),
});

export const updateResumeSchema = z.object({
    skills: z.array(z.string().min(1)).max(50, 'Keep it under 50 skills'),
    education: z.string().max(200, 'Keep it under 200 characters').optional(),
    cgpa: z
        .number({ error: 'Enter a number' })
        .min(0, 'CGPA can\'t be negative')
        .max(10, 'CGPA looks too high')
        .optional(),
    experienceYears: z
        .number({ error: 'Enter a number' })
        .min(0, 'Can\'t be negative')
        .max(60, 'That looks too high')
        .optional(),
    projects: z.array(resumeProjectSchema).max(20, 'Keep it under 20 projects'),
});

export type UpdateResumeValues = z.infer<typeof updateResumeSchema>;