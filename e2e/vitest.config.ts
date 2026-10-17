import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

// e2e/.env is optional; real environment variables win over it
const envFile = path.join(here, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  root: here,
  test: {
    include: ['tests/**/*.e2e.test.ts'],
    globalSetup: ['./src/globalSetup.ts'],
    // the checkpoints change global settings (registration mode, approvals): never run two files at once
    fileParallelism: false,
    // parsing and matching use LLM agents: every step may take minutes
    testTimeout: 5 * 60_000,
    hookTimeout: 5 * 60_000,
    reporters: ['verbose'],
  },
});