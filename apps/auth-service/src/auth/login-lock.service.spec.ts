import { FakeRedis } from '../../test/fake-redis';
import { LOGIN_LIMITS, LoginLockService } from './login-lock.service';

function build() {
  const fake = new FakeRedis();
  return { fake, lock: new LoginLockService({ client: fake } as any) };
}

const EMAIL = 'a@b.com';

describe('LoginLockService', () => {
  it('locks an email on one IP after 5 failures, but not on another IP', async () => {
    const { lock } = build();
    for (let i = 0; i < 4; i++) await lock.recordFailure(EMAIL, '1.1.1.1');
    expect(await lock.isLocked(EMAIL, '1.1.1.1')).toBe(false);

    await lock.recordFailure(EMAIL, '1.1.1.1');

    expect(await lock.isLocked(EMAIL, '1.1.1.1')).toBe(true);
    expect(await lock.isLocked(EMAIL, '2.2.2.2')).toBe(false);
  });

  it('does not lock other emails on the same IP', async () => {
    const { lock } = build();
    for (let i = 0; i < 5; i++) await lock.recordFailure(EMAIL, '1.1.1.1');
    expect(await lock.isLocked('other@b.com', '1.1.1.1')).toBe(false);
  });

  it('applies the per-email limit of 20 across many IPs', async () => {
    const { lock } = build();
    for (let i = 0; i < 19; i++) await lock.recordFailure(EMAIL, `10.0.0.${i}`);
    expect(await lock.isLocked(EMAIL, '9.9.9.9')).toBe(false);

    await lock.recordFailure(EMAIL, '10.0.0.99');

    expect(await lock.isLocked(EMAIL, '9.9.9.9')).toBe(true); // a brand-new IP is blocked too
  });

  it('sets a 5-minute window on the IP counter and 15 minutes on the email counter', async () => {
    const { fake, lock } = build();
    await lock.recordFailure(EMAIL, '1.1.1.1');

    expect(fake.ttls.get(`login-attempts:ip:${EMAIL}:1.1.1.1`)).toBe(LOGIN_LIMITS.perEmailAndIp.windowSeconds);
    expect(fake.ttls.get(`login-attempts:email:${EMAIL}`)).toBe(LOGIN_LIMITS.perEmail.windowSeconds);
    expect(LOGIN_LIMITS.perEmailAndIp.windowSeconds).toBe(300);
    expect(LOGIN_LIMITS.perEmail.windowSeconds).toBe(900);
  });

  it('repairs a counter that lost its expiry so a lock cannot last forever', async () => {
    const { fake, lock } = build();
    fake.store.set(`login-attempts:ip:${EMAIL}:1.1.1.1`, '3'); // no ttl
    await lock.recordFailure(EMAIL, '1.1.1.1');
    expect(fake.ttls.get(`login-attempts:ip:${EMAIL}:1.1.1.1`)).toBe(300);
  });

  it('clear() resets only the IP counter', async () => {
    const { fake, lock } = build();
    for (let i = 0; i < 5; i++) await lock.recordFailure(EMAIL, '1.1.1.1');
    await lock.clear(EMAIL, '1.1.1.1');

    expect(await lock.isLocked(EMAIL, '1.1.1.1')).toBe(false);
    expect(fake.store.get(`login-attempts:email:${EMAIL}`)).toBe('5');
  });

  it('does not lock (and does not throw) when Redis is down', async () => {
    const lock = new LoginLockService({
      client: {
        get: vi.fn().mockRejectedValue(new Error('down')),
        incr: vi.fn().mockRejectedValue(new Error('down')),
        del: vi.fn().mockRejectedValue(new Error('down')),
      },
    } as any);

    await expect(lock.recordFailure(EMAIL, '1.1.1.1')).resolves.toBeUndefined();
    expect(await lock.isLocked(EMAIL, '1.1.1.1')).toBe(false);
  });
});