export type RegistrationMode = 'open' | 'invite_only' | 'domain';

export interface RegistrationModeInfo {
  mode: RegistrationMode;
  allowedDomains: string[];
  /** false in college mode (invite_only / domain), or when GOOGLE_CLIENT_ID is not set on the server */
  googleEnabled: boolean;
  googleClientId: string | null;
}

export type Role = 'ADMIN' | 'COMPANY' | 'APPLICANT';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  role: Role;
  /** only present after a login with a recovery code */
  recoveryCodesLeft?: number;
}

/** Password was right but the account has 2FA: no tokens yet. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeId: string;
}

export type LoginResponse = TokenResponse | TwoFactorChallenge;

export function isTwoFactorChallenge(res: LoginResponse): res is TwoFactorChallenge {
  return 'twoFactorRequired' in res;
}

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
}

export interface TwoFactorSetup {
  otpauthUrl: string;
  secret: string;
}