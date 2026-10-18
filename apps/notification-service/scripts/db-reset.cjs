/**
 * Drops and recreates ONLY this service's schema (notifications_service); `prisma db push` then recreates the tables.
 * Run through `pnpm --filter notification-service db:reset`. Stop the service first.
 */
try {
  require('dotenv/config');
} catch {
  // dotenv is optional here: DATABASE_URL may come from the environment
}
const { Client } = require('pg');

const SCHEMA = 'notifications_service';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_RESET !== 'true') {
    console.error('Refusing to reset a production database (set ALLOW_DB_RESET=true if you really mean it)');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.query(`CREATE SCHEMA "${SCHEMA}"`);
    console.log(`Schema ${SCHEMA} dropped and recreated`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
