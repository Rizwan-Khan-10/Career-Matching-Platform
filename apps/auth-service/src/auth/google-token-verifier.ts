import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string; // Google's stable id for the person
  email: string;
  emailVerified: boolean;
}

/** The Client ID is public (it is in the browser too). Null means Google sign-in is not set up. */
export function getGoogleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  /** Checks signature, expiry, issuer and that the token was made for OUR client id. */
  async verify(idToken: string): Promise<GoogleProfile> {
    const audience = getGoogleClientId();
    if (!audience) throw new ServiceUnavailableException('Google sign-in is not configured on the server');

    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) throw new Error('token has no sub or email');
      return { sub: payload.sub, email: payload.email, emailVerified: payload.email_verified === true };
    } catch {
      throw new UnauthorizedException('Invalid Google sign-in');
    }
  }
}