export const REGISTRATION_MODES = ['open', 'invite_only', 'domain'] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

export interface SystemSettings {
  registrationMode: RegistrationMode;
  allowedDomains: string[];
  companyApprovalRequired: boolean;
  jobApprovalRequired: boolean;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  registrationMode: 'open',
  allowedDomains: [],
  companyApprovalRequired: true,
  jobApprovalRequired: false,
};

/** "@College.edu " -> "college.edu" */
export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '');
}

/** Turns raw key/value rows into a complete, valid settings object (defaults fill any gap). */
export function normalizeSettings(raw: Record<string, unknown>): SystemSettings {
  const mode = raw.registrationMode;
  const domains = raw.allowedDomains;

  return {
    registrationMode: REGISTRATION_MODES.includes(mode as RegistrationMode)
      ? (mode as RegistrationMode)
      : DEFAULT_SETTINGS.registrationMode,
    allowedDomains: Array.isArray(domains)
      ? domains
          .filter((d): d is string => typeof d === 'string')
          .map(normalizeDomain)
          .filter((d) => d.length > 0)
      : [],
    companyApprovalRequired:
      typeof raw.companyApprovalRequired === 'boolean'
        ? raw.companyApprovalRequired
        : DEFAULT_SETTINGS.companyApprovalRequired,
    jobApprovalRequired:
      typeof raw.jobApprovalRequired === 'boolean'
        ? raw.jobApprovalRequired
        : DEFAULT_SETTINGS.jobApprovalRequired,
  };
}