#!/usr/bin/env node
/**
 * Test-data tool for the shared Postgres + Redis (it resets the data of ALL services, because they share one DB + one Redis).
 * Put it anywhere in the repo and run it with node, e.g.  node apps/data-tool.cjs status
 *
 *   node data-tool.cjs status                              what is in the system right now (read-only)
 *   node data-tool.cjs reset                               DRY RUN: shows what would be deleted
 *   node data-tool.cjs reset --execute                     really deletes (asks you to type RESET). Keeps user accounts.
 *   node data-tool.cjs reset --execute --include-users     also deletes accounts + profiles + login sessions
 *
 * Deletes DATA only, never tables/schema (TRUNCATE). STOP ALL SERVICES BEFORE `reset --execute` (consumers crash on deleted
 * streams) and start them again afterwards. Cloudinary files are not touched.
 */
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const { createRequire } = require('node:module');

const args = process.argv.slice(2);
const cmd = args[0] || 'status';

// This file can live ANYWHERE in the repo (apps/, scripts/, apps/matching-results-service/scripts/ ...). It borrows the
// dependencies (pg, ioredis, dotenv) and the .env from apps/matching-results-service, so that service needs `pnpm install`.
function findServiceDir() {
  const here = __dirname;
  const candidates = [
    path.join(here, '..'), here,
    path.join(here, 'matching-results-service'), path.join(here, 'apps', 'matching-results-service'),
    path.join(here, '..', 'matching-results-service'), path.join(here, '..', 'apps', 'matching-results-service'),
  ];
  return candidates.find((d) => fs.existsSync(path.join(d, 'package.json')) && fs.existsSync(path.join(d, 'node_modules', 'pg')));
}
const SERVICE_DIR = findServiceDir();
if (!SERVICE_DIR) { console.error('Could not find apps/matching-results-service with node_modules. Run `pnpm install` there first.'); process.exit(1); }
const envFlag = args.indexOf('--env');
const ENV_FILE = envFlag >= 0 ? path.resolve(args[envFlag + 1]) : path.join(SERVICE_DIR, '.env');   // --env <file> to use another .env
const req = createRequire(path.join(SERVICE_DIR, 'package.json'));
req('dotenv').config({ path: ENV_FILE });
const { Client } = req('pg');
const RedisModule = req('ioredis');
const Redis = RedisModule.default || RedisModule.Redis || RedisModule;

const EXECUTE = args.includes('--execute');
const INCLUDE_USERS = args.includes('--include-users');

const PIPELINE_TABLES = [
  ['matches_service', 'Match'], ['matches_service', 'RoleScan'],
  ['jobs_service', 'JobRole'], ['jobs_service', 'JobPosting'],
  ['resumes_service', 'Resume'],
  ['chat_service', 'ChatMessage'], ['chat_service', 'ChatConversation'],
  ['public', 'resume_embeddings'], ['public', 'job_role_embeddings'],
];
const USER_TABLES = [['auth_service', 'User'], ['users_service', 'ApplicantProfile'], ['users_service', 'CompanyProfile']];
const STREAMS = ['resume.uploaded', 'resume.updated', 'resume.parsed', 'jd.uploaded', 'jd.extracted', 'job.role.deleted', 'job.stopped',
  'match.computed', 'match.scanned', 'match.approved', 'feedback.ready', 'resume.pdf.ready', 'resume.pdf.failed', 'candidate.ready'];
const KEY_PATTERNS = ['bull:email-queue:*'];
const USER_KEY_PATTERNS = ['refresh:*', 'reset:*', 'login-attempts:*'];

const q = (s, t) => `"${s}"."${t}"`;
const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const hostOf = (url) => { try { return new URL(url).host; } catch { return '(unreadable url)'; } };

async function existing(pg, tables) {
  const out = [];
  for (const [s, t] of tables) {
    const r = await pg.query('SELECT to_regclass($1) AS oid', [`${q(s, t)}`]);
    out.push({ s, t, exists: !!r.rows[0].oid });
  }
  return out;
}
async function count(pg, s, t) { return Number((await pg.query(`SELECT count(*)::int AS n FROM ${q(s, t)}`)).rows[0].n); }
async function scanKeys(redis, pattern) {
  const found = []; let cursor = '0';
  do { const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500); cursor = next; found.push(...keys); } while (cursor !== '0');
  return found;
}

async function status(pg, redis) {
  console.log(c(36, '\n== Postgres'));
  for (const { s, t, exists } of await existing(pg, [...PIPELINE_TABLES, ...USER_TABLES])) console.log(`  ${(s + '.' + t).padEnd(36)} ${exists ? String(await count(pg, s, t)).padStart(6) : c(90, '  (no such table)')}`);

  const group = async (label, sql) => { try { const r = await pg.query(sql); console.log(`  ${label}: ${r.rows.map((x) => `${x.status}=${x.n}`).join('  ') || '-'}`); } catch (e) { console.log(`  ${label}: ${c(90, e.message)}`); } };
  console.log(c(36, '\n== Status'));
  await group('resumes     ', `SELECT status, count(*)::int n FROM ${q('resumes_service', 'Resume')} GROUP BY 1`);
  await group('job postings', `SELECT status, count(*)::int n FROM ${q('jobs_service', 'JobPosting')} GROUP BY 1`);

  console.log(c(36, '\n== Matches (newest first)'));
  try {
    const r = await pg.query(`SELECT u.email, m."roleTitle" AS role, m.eligible, m.score, m."applicantStatus" AS consent, (m.feedback IS NOT NULL) AS fb, m.reason
      FROM ${q('matches_service', 'Match')} m LEFT JOIN ${q('auth_service', 'User')} u ON u.id = m."applicantId" ORDER BY m."updatedAt" DESC LIMIT 40`);
    if (!r.rows.length) console.log('  (none yet)');
    for (const x of r.rows) console.log(`  ${(x.email || '?').slice(0, 28).padEnd(28)} ${(x.role || '?').slice(0, 24).padEnd(24)} ${(x.eligible ? c(32, 'ELIGIBLE ') : c(33, 'not elig.'))} ${Number(x.score).toFixed(3)}  ${x.consent.padEnd(8)} fb=${x.fb ? 'yes' : 'no '}  ${String(x.reason || '').slice(0, 90)}`);
    const sc = await pg.query(`SELECT "jobRoleId", count(*)::int scanned FROM ${q('matches_service', 'RoleScan')} GROUP BY 1`);
    console.log(`  role scans (candidates evaluated per role): ${sc.rows.map((x) => x.scanned).join(', ') || '-'}`);
  } catch (e) { console.log('  ' + c(90, e.message)); }

  console.log(c(36, '\n== Redis streams (len | consumer groups: pending messages, lag) | dead letters'));
  for (const s of STREAMS) {
    let len = 0, groups = [], dead = 0;
    try { len = await redis.xlen(s); } catch { /* no stream */ }
    try { groups = await redis.xinfo('GROUPS', s); } catch { /* no groups */ }
    try { dead = await redis.xlen(`${s}.dead`); } catch { /* none */ }
    const g = groups.map((row) => { const o = {}; for (let i = 0; i < row.length; i += 2) o[row[i]] = row[i + 1]; return `${o.name}: pending=${o.pending} lag=${o.lag ?? '?'}`; }).join(' ; ');
    console.log(`  ${s.padEnd(20)} ${String(len).padStart(4)} | ${g || c(90, 'no consumer group')} | ${dead ? c(31, 'DEAD=' + dead) : 'dead=0'}`);
    if (dead) { const last = await redis.xrevrange(`${s}.dead`, '+', '-', 'COUNT', 1); const f = last[0]?.[1] || []; const idx = f.indexOf('error'); console.log(c(31, `      last error: ${String(f[idx + 1] || '').slice(0, 200)}`)); }
  }
  console.log(c(90, '\n  pending>0 for a long time = a consumer is stuck/crashed. DEAD>0 = a message failed 3+ times (read the error above).'));
}

async function confirm(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question(prompt, res)); rl.close(); return answer.trim() === 'RESET';
}

async function reset(pg, redis) {
  const tables = [...PIPELINE_TABLES, ...(INCLUDE_USERS ? USER_TABLES : [])];
  const patterns = [...KEY_PATTERNS, ...(INCLUDE_USERS ? USER_KEY_PATTERNS : [])];
  const plan = await existing(pg, tables);
  console.log(c(36, `\n== ${EXECUTE ? 'RESET PLAN' : 'DRY RUN (nothing is deleted)'}   database: ${hostOf(process.env.DATABASE_URL)}   redis: ${hostOf(process.env.REDIS_URL)}`));
  console.log('Postgres tables to EMPTY (schema stays):');
  for (const p of plan) console.log(`  ${(p.s + '.' + p.t).padEnd(36)} ${p.exists ? String(await count(pg, p.s, p.t)).padStart(6) + ' rows' : c(90, 'missing, skipped')}`);
  if (!INCLUDE_USERS) console.log(c(32, '  KEPT: auth_service.User, users_service profiles (add --include-users to wipe them too)'));
  const keys = new Set();
  for (const s of STREAMS) for (const k of [s, `${s}.dead`]) if (await redis.exists(k)) keys.add(k);
  for (const pat of patterns) for (const k of await scanKeys(redis, pat)) keys.add(k);
  console.log(`Redis keys to delete: ${keys.size}` + (keys.size ? c(90, `  e.g. ${[...keys].slice(0, 5).join(', ')}`) : ''));

  if (!EXECUTE) { console.log(c(33, '\nDry run only. Add --execute to really delete (stop all services first).')); return; }
  console.log(c(31, '\nThis permanently deletes the data above. ALL SERVICES (Node + Python agents) MUST BE STOPPED.'));
  if (!(await confirm('Type RESET to continue: '))) { console.log('Cancelled, nothing deleted.'); return; }

  const live = plan.filter((p) => p.exists);
  if (live.length) await pg.query(`TRUNCATE TABLE ${live.map((p) => q(p.s, p.t)).join(', ')} RESTART IDENTITY CASCADE`);
  let deleted = 0; const list = [...keys];
  for (let i = 0; i < list.length; i += 200) deleted += await redis.unlink(...list.slice(i, i + 200));
  console.log(c(32, `\nDone: ${live.length} tables emptied, ${deleted} redis keys removed. Now START the services again (agents re-create their consumer groups).`));
}

(async () => {
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL) { console.error('DATABASE_URL / REDIS_URL missing (' + ENV_FILE + ')'); process.exit(1); }
  if (!['status', 'reset'].includes(cmd)) { console.error('usage: status | reset [--execute] [--include-users]'); process.exit(1); }
  const pg = new Client({ connectionString: process.env.DATABASE_URL }); await pg.connect();
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
  try { await (cmd === 'status' ? status(pg, redis) : reset(pg, redis)); } finally { await pg.end(); redis.disconnect(); }
})().catch((e) => { console.error(c(31, 'failed: ' + e.message)); process.exit(1); });