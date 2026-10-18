# syntax=docker/dockerfile:1
# Build context = REPOSITORY ROOT (the pnpm lockfile lives there):
#   docker build -f apps/auth-service/Dockerfile -t auth-service .
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION=10.34.7
# openssl: Prisma engines need it on -slim images
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo

# ---- build: install (frozen lockfile), prisma generate, nest build -------------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/auth-service/package.json apps/auth-service/
RUN pnpm install --frozen-lockfile --filter auth-service...
COPY apps/auth-service apps/auth-service
WORKDIR /repo/apps/auth-service
# generate does not connect to the database; prisma.config.ts only needs the variable to exist
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm exec prisma generate \
 && pnpm exec nest build

# ---- runtime: compiled app + prisma CLI (the entrypoint applies the schema, same as `prisma db push` locally) ----
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /repo/apps/auth-service
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/auth-service/node_modules ./node_modules
COPY --from=build /repo/apps/auth-service/dist ./dist
COPY --from=build /repo/apps/auth-service/prisma ./prisma
COPY --from=build /repo/apps/auth-service/prisma.config.ts /repo/apps/auth-service/package.json ./
COPY apps/auth-service/docker-entrypoint.sh ./docker-entrypoint.sh
# strip Windows line endings (a checkout with autocrlf would otherwise break the script), then make it executable
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod 755 docker-entrypoint.sh
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]