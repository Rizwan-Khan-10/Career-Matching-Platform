import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { GoogleTokenVerifier } from './google-token-verifier';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const ticket = (payload: Record<string, unknown> | undefined) => ({ getPayload: () => payload });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = 'client-123.apps.googleusercontent.com';
});

describe('GoogleTokenVerifier', () => {
  it('returns the profile and checks the token against OUR client id', async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: 'g1', email: 'a@b.com', email_verified: true }));
    const profile = await new GoogleTokenVerifier().verify('tok');

    expect(profile).toEqual({ sub: 'g1', email: 'a@b.com', emailVerified: true });
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'tok', audience: 'client-123.apps.googleusercontent.com' });
  });

  it('reports email_verified=false as false', async () => {
    verifyIdToken.mockResolvedValue(ticket({ sub: 'g1', email: 'a@b.com', email_verified: false }));
    expect((await new GoogleTokenVerifier().verify('tok')).emailVerified).toBe(false);
  });

  it('refuses a bad token (wrong audience, bad signature, expired: the library throws)', async () => {
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));
    await expect(new GoogleTokenVerifier().verify('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a token without sub or email', async () => {
    verifyIdToken.mockResolvedValue(ticket({ email: 'a@b.com' }));
    await expect(new GoogleTokenVerifier().verify('tok')).rejects.toBeInstanceOf(UnauthorizedException);
    verifyIdToken.mockResolvedValue(ticket(undefined));
    await expect(new GoogleTokenVerifier().verify('tok')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 503 when GOOGLE_CLIENT_ID is not set', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    await expect(new GoogleTokenVerifier().verify('tok')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});