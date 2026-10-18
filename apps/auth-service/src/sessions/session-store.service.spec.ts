import { FakeRedis } from '../../test/fake-redis';
import { REFRESH_TOKEN_TTL_SECONDS, SessionStore } from './session-store.service';

function build() {
  const fake = new FakeRedis();
  return { fake, store: new SessionStore({ client: fake } as any) };
}

describe('SessionStore', () => {
  it('stores one key per session with a 7-day expiry', async () => {
    const { fake, store } = build();
    await store.save('u1', 's1', 'token-1');

    expect(await store.get('u1', 's1')).toBe('token-1');
    expect(fake.ttls.get('refresh:u1:s1')).toBe(REFRESH_TOKEN_TTL_SECONDS);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(604800);
  });

  it('revoke removes only the given session', async () => {
    const { store } = build();
    await store.save('u1', 's1', 'a');
    await store.save('u1', 's2', 'b');

    await store.revoke('u1', 's1');

    expect(await store.get('u1', 's1')).toBeNull();
    expect(await store.get('u1', 's2')).toBe('b');
  });

  it('revokeAll removes every session of that user (across scan pages) and nothing else', async () => {
    const { fake, store } = build();
    for (const sid of ['s1', 's2', 's3', 's4', 's5']) await store.save('u1', sid, `t-${sid}`);
    await store.save('u2', 's1', 'other-user');
    fake.store.set('login-attempts:email:a@b.com', '3');

    await store.revokeAll('u1');

    for (const sid of ['s1', 's2', 's3', 's4', 's5']) expect(await store.get('u1', sid)).toBeNull();
    expect(await store.get('u2', 's1')).toBe('other-user');
    expect(fake.store.has('login-attempts:email:a@b.com')).toBe(true);
  });

  it('never throws when Redis is down', async () => {
    const broken = new SessionStore({
      client: {
        set: vi.fn().mockRejectedValue(new Error('down')),
        get: vi.fn().mockRejectedValue(new Error('down')),
        del: vi.fn().mockRejectedValue(new Error('down')),
        scan: vi.fn().mockRejectedValue(new Error('down')),
      },
    } as any);

    await expect(broken.save('u1', 's1', 't')).resolves.toBeUndefined();
    await expect(broken.get('u1', 's1')).resolves.toBeNull();
    await expect(broken.revoke('u1', 's1')).resolves.toBeUndefined();
    await expect(broken.revokeAll('u1')).resolves.toBeUndefined();
  });
});