/* eslint-disable */
/**
 * Manual end-to-end check against a RUNNING gateway + Redis (no notification-service needed):
 *   pnpm --filter websocket-gateway start:dev          (terminal 1, with JWT_SECRET set)
 *   JWT_SECRET=<same value> pnpm --filter websocket-gateway smoke      (terminal 2)
 *
 * Connects two users with real socket.io clients, publishes events with XADD exactly like the producers do and checks
 * that every event reaches the right user only. `socket.io-client` and `ioredis` come from the workspace.
 */
const crypto = require('node:crypto');
const { io } = require('socket.io-client');
const Redis = require('ioredis');

const WS_URL = process.env.WS_URL || 'http://localhost:3007';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
    console.error('JWT_SECRET is required (the same value the gateway uses)');
    process.exit(2);
}

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
function token(sub, secret = SECRET) {
    const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'APPLICANT', exp: Math.floor(Date.now() / 1000) + 600 })}`;
    return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EVENTS = ['notification.created', 'candidate.shortlisted', 'candidate.rejected', 'company.status.changed', 'job.approval.changed', 'prep.ready', 'rejection-feedback.ready'];

function connect(userId, jwt = token(userId)) {
    const socket = io(WS_URL, { path: '/socket.io', auth: { token: jwt }, transports: ['websocket'], reconnection: false });
    const received = [];
    EVENTS.forEach((event) => socket.on(event, (payload) => received.push({ event, payload })));
    const connected = new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
    return { socket, received, connected };
}

(async () => {
    const redis = new Redis(REDIS_URL);
    const run = crypto.randomUUID().slice(0, 8);
    const [A, B] = [`smoke-a-${run}`, `smoke-b-${run}`];
    const failures = [];
    const expect = (ok, message) => {
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
        if (!ok) failures.push(message);
    };
    const publish = (stream, data) => redis.xadd(stream, 'MAXLEN', '~', 10000, '*', 'data', JSON.stringify(data));

    const a1 = connect(A);
    const a2 = connect(A); // second tab of the same user
    const b = connect(B);
    await Promise.all([a1.connected, a2.connected, b.connected]);

    const notification = { id: `n-${run}`, type: 'resume_ready', title: 'Review and confirm your resume', body: '', data: null, readAt: null, createdAt: new Date().toISOString() };
    await publish('notification.created', { userId: A, notification, requestId: run });
    await publish('candidate.shortlisted', { matchId: 'm1', applicantId: B, companyId: 'c-1', jobRoleId: 'r1', roleTitle: 'Backend', companyName: 'Acme', shortlist: { roundName: 'Round 1', mode: 'online' } });
    await publish('candidate.rejected', { matchId: 'm2', applicantId: A, companyId: 'c-1', jobRoleId: 'r1', roleTitle: 'Backend', reasonCategory: 'skills_gap', message: 'Thank you' });
    await publish('job.approval.changed', { companyId: B, jobPostingId: 'j1', status: 'approved' });
    await wait(1500);

    const only = (who, event) => who.received.filter((r) => r.event === event);
    expect(only(a1, 'notification.created').length === 1 && only(a1, 'notification.created')[0].payload.notification.id === notification.id, 'notification.created reaches the owner (tab 1)');
    expect(only(a2, 'notification.created').length === 1, 'notification.created reaches the owner (tab 2)');
    expect(only(b, 'notification.created').length === 0, 'notification.created does not reach another user');
    expect(only(b, 'candidate.shortlisted').length === 1 && only(a1, 'candidate.shortlisted').length === 0, 'candidate.shortlisted goes to its applicant only');
    expect(only(a1, 'candidate.rejected').length === 1 && !('reasonCategory' in only(a1, 'candidate.rejected')[0].payload), 'candidate.rejected reaches the applicant without reasonCategory');
    expect(only(b, 'job.approval.changed').length === 1 && only(a1, 'job.approval.changed').length === 0, 'job.approval.changed goes to the company only');

    const bad = connect('intruder', token('intruder', 'some-other-secret'));
    const refused = await Promise.race([
        new Promise((resolve) => bad.socket.once('disconnect', () => resolve(true))),
        wait(3000).then(() => false),
    ]);
    expect(refused, 'a token signed with another secret is disconnected');

    [a1, a2, b, bad].forEach((c) => c.socket.disconnect());
    redis.disconnect();
    console.log(failures.length === 0 ? '\nALL OK' : `\n${failures.length} check(s) failed`);
    process.exit(failures.length === 0 ? 0 : 1);
})().catch((err) => {
    console.error('smoke test crashed:', err.message);
    process.exit(1);
});