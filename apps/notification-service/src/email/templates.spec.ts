import { candidateReadyEmail, eligibleEmail, esc, passwordResetEmail, shortlistedEmail, emailVerificationEmail } from './templates';

const webUrl = 'http://web.test/';

describe('passwordResetEmail', () => {
  it('reset: 15-minute link with the token encoded', () => {
    const mail = passwordResetEmail({ webUrl, resetToken: 'a b&c' });
    expect(mail.subject).toBe('Reset your password');
    expect(mail.html).toContain('http://web.test/reset-password?token=a%20b%26c');
    expect(mail.html).toContain('15 minutes');
  });

  it('invite: says "set your password" and the link lives 7 days', () => {
    const mail = passwordResetEmail({ webUrl, resetToken: 't', invite: true });
    expect(mail.subject).toBe('You have been invited: set your password');
    expect(mail.html).toContain('Set your password');
    expect(mail.html).toContain('7 days');
    expect(mail.html).not.toContain('15 minutes');
  });
});

describe('emailVerificationEmail', () => {
  it('links to /verify-email with the encoded token and says 24 hours', () => {
    const mail = emailVerificationEmail({ webUrl, verifyToken: 'a b&c' });
    expect(mail.subject).toBe('Confirm your email address');
    expect(mail.html).toContain('http://web.test/verify-email?token=a%20b%26c');
    expect(mail.html).toContain('24 hours');
  });
});

describe('eligibleEmail', () => {
  it('names the role and points at the matches page', () => {
    const mail = eligibleEmail({ webUrl, roleTitle: 'Backend Dev' });
    expect(mail.subject).toBe('You are eligible for Backend Dev');
    expect(mail.html).toContain('http://web.test/applicant/matches');
  });

  it('works without a role title and escapes it when present', () => {
    expect(eligibleEmail({ webUrl }).subject).toBe('You are eligible for a role!');
    expect(eligibleEmail({ webUrl, roleTitle: '<img src=x onerror=1>' }).html).not.toContain('<img');
  });
});

describe('candidateReadyEmail', () => {
  it('shows the applicant, role and percent, and links to the role applicants page', () => {
    const mail = candidateReadyEmail({ webUrl, applicantName: 'Asha', roleTitle: 'Dev', score: 0.9, jobRoleId: 'r 1' });
    expect(mail.subject).toBe('New candidate ready for Dev');
    expect(mail.html).toContain('Asha');
    expect(mail.html).toContain('90% match');
    expect(mail.html).toContain('http://web.test/company/roles/r%201/applicants');
  });

  it('does not print NaN% when the score is missing', () => {
    const mail = candidateReadyEmail({ webUrl, applicantName: 'Asha', roleTitle: 'Dev' });
    expect(mail.html).not.toContain('%');
    expect(mail.html).toContain('http://web.test/company');
  });

  it('escapes the applicant name', () => {
    expect(candidateReadyEmail({ webUrl, applicantName: '<script>x</script>' }).html).not.toContain('<script>');
  });
});

describe('shortlistedEmail', () => {
  const shortlist = {
    roundName: 'Technical round 1',
    mode: 'online',
    scheduledAt: '2026-11-02T10:00:00.000Z',
    bring: 'ID card\nLaptop',
    link: 'https://meet.example.com/abc?x=1&y=2',
    address: '1 Main Street',
    note: 'Be on time <b>please</b>',
  };

  it('puts every shortlist field in the mail exactly as typed (escaped)', () => {
    const mail = shortlistedEmail({ webUrl, companyName: 'Acme', roleTitle: 'Dev', shortlist });
    expect(mail.subject).toBe('Acme shortlisted you for Dev');
    for (const value of ['Technical round 1', 'online', '2026-11-02T10:00:00.000Z', '1 Main Street']) expect(mail.html).toContain(value);
    expect(mail.html).toContain('ID card<br/>Laptop');
    expect(mail.html).toContain('Be on time &lt;b&gt;please&lt;/b&gt;');
    expect(mail.html).toContain('href="https://meet.example.com/abc?x=1&amp;y=2"');
  });

  it('never makes a clickable link out of a non-http(s) link', () => {
    const mail = shortlistedEmail({ webUrl, shortlist: { roundName: 'R', mode: 'online', link: 'javascript:alert(1)' } });
    expect(mail.html).not.toContain('href="javascript');
    expect(mail.html).toContain('javascript:alert(1)');
  });

  it('keeps the subject on one line', () => {
    const mail = shortlistedEmail({ webUrl, companyName: 'Acme\r\nBcc: x@y.z', roleTitle: 'Dev' });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('still works without any details', () => {
    const mail = shortlistedEmail({ webUrl, shortlist: null });
    expect(mail.subject).toBe('A company shortlisted you for a role');
    expect(mail.html).not.toContain('Details from the company');
  });
});

describe('esc', () => {
  it('escapes & < > "', () => {
    expect(esc(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });
});