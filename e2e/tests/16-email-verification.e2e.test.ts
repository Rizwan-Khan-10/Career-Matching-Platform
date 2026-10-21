import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_DEFAULTS, applySettings } from '../src/admin';
import { uniqueEmail } from '../src/actors';
import { config } from '../src/config';
import { api, ok } from '../src/http';
import { verificationToken } from '../src/redis';

const signupBody = (email: string, password = config.password, role = 'APPLICANT') => ({ email, password, role });
const loginBody = (email: string, password = config.password) => ({ email, password });

describe('checkpoint 16: email verification on sign-up', () => {
  beforeAll(() => applySettings({ registrationMode: 'open', emailVerificationRequired: true }));
  afterAll(() => applySettings(TEST_DEFAULTS));

  it('sign-up gives no tokens, login waits for the link, the link logs the user in once', async () => {
    const email = uniqueEmail('verify');
    const res = await api('/auth/signup', { method: 'POST', json: signupBody(email) });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ verificationRequired: true, email });

    // right password, not verified yet: the web app gets a code it can act on
    const early = await api('/auth/login', { method: 'POST', json: loginBody(email) });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe('EMAIL_NOT_VERIFIED');

    // a wrong password must not reveal that the account is waiting for verification
    const wrong = await api('/auth/login', { method: 'POST', json: loginBody(email, 'Wrong-Passw0rd!') });
    expect(wrong.status).toBe(401);

    const token = await verificationToken(email);
    const verified = ok(await api('/auth/verify-email', { method: 'POST', json: { token } }), 'verify-email');
    expect(verified.role).toBe('APPLICANT');
    expect(verified.accessToken).toBeDefined();

    // the profile exists now (it is created at verification, not at sign-up)
    ok(await api('/applicants/me', { token: verified.accessToken }), 'GET /applicants/me');

    // the link works once
    const again = await api('/auth/verify-email', { method: 'POST', json: { token } });
    expect(again.status).toBe(400);

    ok(await api('/auth/login', { method: 'POST', json: loginBody(email) }), 'login after verification');
  });

  it('signing up again on an unverified address takes it over: the first password stops working', async () => {
    const email = uniqueEmail('verify-takeover');
    ok(await api('/auth/signup', { method: 'POST', json: signupBody(email, `${config.password}-first`) }), 'first sign-up');
    const second = await api('/auth/signup', { method: 'POST', json: signupBody(email) });
    expect(second.status).toBe(201); // not a 409: nobody verified this address yet
    expect(second.body.verificationRequired).toBe(true);

    const token = await verificationToken(email);
    ok(await api('/auth/verify-email', { method: 'POST', json: { token } }), 'verify-email');

    ok(await api('/auth/login', { method: 'POST', json: loginBody(email) }), 'login with the second password');
    const old = await api('/auth/login', { method: 'POST', json: loginBody(email, `${config.password}-first`) });
    expect(old.status).toBe(401);

    // now it is a verified account: a third sign-up is the normal 409
    const third = await api('/auth/signup', { method: 'POST', json: signupBody(email) });
    expect(third.status).toBe(409);
  });

  it('resend gives a new link, the old one dies, and unknown addresses get the same answer', async () => {
    const email = uniqueEmail('verify-resend');
    ok(await api('/auth/signup', { method: 'POST', json: signupBody(email) }), 'sign-up');
    const first = await verificationToken(email);

    const resend = ok(await api('/auth/resend-verification', { method: 'POST', json: { email } }), 'resend');
    const unknown = ok(
      await api('/auth/resend-verification', { method: 'POST', json: { email: uniqueEmail('nobody') } }),
      'resend for an unknown address',
    );
    expect(unknown).toEqual(resend); // same answer: nothing about the address leaks

    const second = await verificationToken(email, first);
    expect(second).not.toBe(first);

    const old = await api('/auth/verify-email', { method: 'POST', json: { token: first } });
    expect(old.status).toBe(400);
    ok(await api('/auth/verify-email', { method: 'POST', json: { token: second } }), 'verify with the new link');
  });
});