#!/bin/sh
# Apply this service's schema (same method as local: `prisma db push`), then start the app.
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi
./node_modules/.bin/prisma db push
exec node dist/main