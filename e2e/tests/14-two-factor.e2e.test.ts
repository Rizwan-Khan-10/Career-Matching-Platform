import { describe, expect, it } from 'vitest';
import { adminActor } from '../src/admin';
import { signup, type Actor } from '../src/actors';
import { api, ok } from '../src/http';
import { codeAfter, stepNow, totpForStep } from '../src/totp';

async function startLogin(user: Actor) {
  return ok(await api('/auth/login', { method: 'POST', json: { email: user.email, password: user.password } }), 'login');
}

/** setup + enable. Returns what the later steps need. `step` is the time step the enable code used. */
async function turnOnTwoFactor(user: Actor) {
  const setup = ok(await api('/auth/2fa/setup', { method: 'POST', token: user.token }), 'setup');
  expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);

  const step = stepNow();
  const enabled = ok(
    await api('/auth/2fa/enable', { method: 'POST', token: user.token, json: { code: totpForStep(setup.secret, step) } }),
    'enable',
  );
  expect(enabled.recoveryCodes).toHaveLength(10);
  return { secret: setup.secret as string, step, recoveryCodes: enabled.recoveryCodes as string[] };
}

describe('checkpoint 14: two-factor authentication', () => {
  it('login needs a code, a recovery code works once, then 2FA can be turned off', async () => {
    const user = await signup('APPLICANT', '2fa');
    const { secret, step, recoveryCodes } = await turnOnTwoFactor(user);

    // password alone no longer gives tokens
    const first = await startLogin(user);
    expect(first.twoFactorRequired).toBe(true);
    expect(first.accessToken).toBeUndefined();

    // a wrong code is refused
    const bad = await api('/auth/2fa/verify', { method: 'POST', json: { challengeId: first.challengeId, code: '000000' } });
    expect(bad.status).toBe(401);

    // a good code (from a later 30 s step: enable already used the current one)
    const code = await codeAfter(secret, step);
    const done = ok(await api('/auth/2fa/verify', { method: 'POST', json: { challengeId: first.challengeId, code } }), 'verify');
    expect(done.role).toBe('APPLICANT');
    expect(done.accessToken).toBeDefined();

    // the challenge works only once
    const reuse = await api('/auth/2fa/verify', { method: 'POST', json: { challengeId: first.challengeId, code } });
    expect(reuse.status).toBe(401);

    // a recovery code works once and tells how many are left
    const second = await startLogin(user);
    const viaRecovery = ok(
      await api('/auth/2fa/verify', { method: 'POST', json: { challengeId: second.challengeId, recoveryCode: recoveryCodes[0] } }),
      'verify with recovery code',
    );
    expect(viaRecovery.recoveryCodesLeft).toBe(9);

    const third = await startLogin(user);
    const again = await api('/auth/2fa/verify', { method: 'POST', json: { challengeId: third.challengeId, recoveryCode: recoveryCodes[0] } });
    expect(again.status).toBe(401);

    // turn it off with the password and another recovery code, then login is one step again
    const disabled = ok(
      await api('/auth/2fa/disable', {
        method: 'POST',
        token: viaRecovery.accessToken,
        json: { password: user.password, recoveryCode: recoveryCodes[1] },
      }),
      'disable',
    );
    expect(disabled.enabled).toBe(false);

    const plain = await startLogin(user);
    expect(plain.accessToken).toBeDefined();
    expect(plain.twoFactorRequired).toBeUndefined();
  });

  it('an admin can reset 2FA for a locked-out user, and only for users who have it', async () => {
    const admin = await adminActor();
    const user = await signup('APPLICANT', '2fa-reset');

    const notOn = await api(`/auth/admin/users/${user.userId}/2fa/reset`, { method: 'POST', token: admin.token });
    expect(notOn.status).toBe(400);

    await turnOnTwoFactor(user);
    expect((await startLogin(user)).twoFactorRequired).toBe(true);

    ok(await api(`/auth/admin/users/${user.userId}/2fa/reset`, { method: 'POST', token: admin.token }), 'admin reset');

    const after = await startLogin(user);
    expect(after.accessToken).toBeDefined();
  });
});