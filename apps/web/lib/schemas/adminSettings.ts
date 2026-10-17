import { z } from 'zod';

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export const normalizeDomain = (value: string) => value.trim().toLowerCase().replace(/^@/, '');

/** Lower-cases, strips a leading "@", drops empties and duplicates. */
export function normalizeDomains(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeDomain).filter(Boolean)));
}

export const adminSettingsSchema = z
  .object({
    registrationMode: z.enum(['open', 'invite_only', 'domain'], { error: 'Choose a registration mode' }),
    allowedDomains: z.array(z.string()).max(50, 'Keep it under 50 domains'),
    companyApprovalRequired: z.boolean(),
    jobApprovalRequired: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const invalid = value.allowedDomains.filter((d) => !DOMAIN.test(d));
    if (invalid.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['allowedDomains'], message: `Not a valid domain: ${invalid.join(', ')}` });
    } else if (value.registrationMode === 'domain' && value.allowedDomains.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['allowedDomains'],
        message: 'Add at least one domain, or choose another mode',
      });
    }
  });

export type AdminSettingsValues = z.infer<typeof adminSettingsSchema>;