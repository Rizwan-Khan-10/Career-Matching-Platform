const env = (name: string, fallback: string) => process.env[name]?.trim() || fallback;

export const config = {
  baseUrl: env('E2E_BASE_URL', 'http://localhost').replace(/\/$/, ''),
  adminEmail: env('ADMIN_EMAIL', ''),
  adminPassword: env('ADMIN_PASSWORD', ''),
  redisUrl: env('E2E_REDIS_URL', env('REDIS_URL', 'redis://localhost:6379')),
  matchingAgentUrl: env('E2E_MATCHING_AGENT_URL', 'http://localhost:8003').replace(/\/$/, ''),
  internalApiKey: env('E2E_INTERNAL_API_KEY', env('INTERNAL_API_KEY', '')),
  waitMs: Number(env('E2E_WAIT_MS', '120000')),
  quietMs: Number(env('E2E_QUIET_MS', '10000')),
  password: 'E2e-Passw0rd!', // used by every test account
};

export function assertAdminCredentials() {
  if (!config.adminEmail || !config.adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required (put them in e2e/.env, they are the values `pnpm seed` uses)');
  }
}