import { z } from 'zod';

export const applicantProfileSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().optional(),
    education: z.string().optional(),
    headline: z.string().max(100, 'Keep it under 100 characters').optional(),
    location: z.string().max(100).optional(),
    linkedinUrl: z
        .union([z.string().url('Enter a valid URL'), z.literal('')])
        .optional(),
});
export type ApplicantProfileValues = z.infer<typeof applicantProfileSchema>;

export const companyProfileSchema = z.object({
    name: z.string().min(1, 'Company name is required'),
    industry: z.string().optional(),
    contact: z.string().optional(),
    website: z
        .union([z.string().url('Enter a valid URL'), z.literal('')])
        .optional(),
    location: z.string().max(100).optional(),
    description: z.string().max(500, 'Keep it under 500 characters').optional(),
});
export type CompanyProfileValues = z.infer<typeof companyProfileSchema>;