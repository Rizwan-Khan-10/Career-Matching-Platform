export type RegistrationMode = 'open' | 'invite_only' | 'domain';

export interface RegistrationModeInfo {
  mode: RegistrationMode;
  allowedDomains: string[];
}