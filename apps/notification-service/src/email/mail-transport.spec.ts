import { isTransientMailError, MailPayload, MailTransport, withFallback } from './mail-transport';

const mail: MailPayload = { to: 'real@user.test', subject: 'Hello', html: '<p>body</p>' };

function fake(impl: (p: MailPayload) => Promise<void>) {
  const send = jest.fn(impl);
  const t: MailTransport = { name: 'fake', send };
  return { t, send };
}

describe('withFallback', () => {
  it('sends to the real recipient and never touches the fallback when it works', async () => {
    const { t, send } = fake(async () => undefined);
    await withFallback(t, 'dev@me.test').send(mail);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(mail);
  });

  it('falls back (with original recipient + reason) when the real recipient is refused', async () => {
    const { t, send } = fake(async (p) => {
      if (p.to === 'real@user.test') throw Object.assign(new Error('550 5.1.1 user unknown <b>'), { responseCode: 550 });
    });
    await withFallback(t, 'dev@me.test').send(mail);
    expect(send).toHaveBeenCalledTimes(2);
    const second = send.mock.calls[1][0];
    expect(second.to).toBe('dev@me.test');
    expect(second.subject).toBe('[failed for: real@user.test] Hello');
    expect(second.html).toContain('real@user.test');
    expect(second.html).toContain('550 5.1.1 user unknown &lt;b&gt;'); // reason is escaped
    expect(second.html).toContain('<p>body</p>');
  });

  it('does NOT fall back on transient errors - they are re-thrown so BullMQ retries the real recipient', async () => {
    const { t, send } = fake(async () => {
      throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    });
    await expect(withFallback(t, 'dev@me.test').send(mail)).rejects.toThrow('timeout');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('throws when the fallback inbox fails too', async () => {
    const { t, send } = fake(async () => {
      throw new Error('rejected');
    });
    await expect(withFallback(t, 'dev@me.test').send(mail)).rejects.toThrow('rejected');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a mail already addressed to the fallback inbox is sent once, unchanged', async () => {
    const { t, send } = fake(async () => undefined);
    await withFallback(t, 'DEV@me.test').send({ ...mail, to: 'dev@me.test' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('isTransientMailError', () => {
  it('classifies', () => {
    expect(isTransientMailError(Object.assign(new Error('x'), { transient: true }))).toBe(true);
    expect(isTransientMailError(Object.assign(new Error('x'), { responseCode: 451 }))).toBe(true);
    expect(isTransientMailError(Object.assign(new Error('x'), { code: 'ECONNECTION' }))).toBe(true);
    expect(isTransientMailError(Object.assign(new Error('x'), { responseCode: 550 }))).toBe(false);
    expect(isTransientMailError(new Error('validation_error'))).toBe(false);
  });
});
