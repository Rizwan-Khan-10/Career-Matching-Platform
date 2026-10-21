import { z } from 'zod';

export const loginSchema = z.object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(1, 'Password is required'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
    email: z.email('Enter a valid email'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(72, 'Password must be at most 72 characters'),
    role: z.enum(['APPLICANT', 'COMPANY']),
});
export type SignupFormValues = z.infer<typeof signupSchema>;