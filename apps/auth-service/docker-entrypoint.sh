#!/bin/sh
# Apply this service's schema (same method as local: `prisma db push`), optionally create the first admin, then start the app.
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi
./node_modules/.bin/prisma db push

# SEED_ADMIN_ON_BOOT=true: create the admin + default settings (safe to repeat). A bad ADMIN_* value stops the
# container here with a clear message, before the app starts.
if [ "$SEED_ADMIN_ON_BOOT" = "true" ]; then
  echo "Seeding the first admin (SEED_ADMIN_ON_BOOT=true)"
  node dist/seed/run-seed.js
fi

# The seed already ran above, so main.ts must not run it a second time.
export SEED_ADMIN_ON_BOOT=false
exec node dist/main