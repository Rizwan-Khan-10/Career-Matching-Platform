import { api } from './http';
import { assertAdminCredentials } from './config';
import { TEST_DEFAULTS, applySettings, getSettings, type Settings } from './admin';
import { eventually } from './poll';

let original: Settings | undefined;

export async function setup() {
  assertAdminCredentials();
  await eventually('the stack answers through nginx', async () => (await api('/auth/registration-mode')).ok, {
    timeoutMs: 120_000,
    intervalMs: 3000,
  });
  original = await getSettings(); // put them back when the run is over
  await applySettings(TEST_DEFAULTS);
}

export async function teardown() {
  if (original) await applySettings(original);
}