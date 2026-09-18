import { z } from 'zod';

export const applicantProfileSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().optional(),
    education: z.string().optional(),
});
export type ApplicantProfileValues = z.infer<typeof applicantProfileSchema>;

export const companyProfileSchema = z.object({
    name: z.string().min(1, 'Company name is required'),
    industry: z.string().optional(),
    contact: z.string().optional(),
});
export type CompanyProfileValues = z.infer<typeof companyProfileSchema>;