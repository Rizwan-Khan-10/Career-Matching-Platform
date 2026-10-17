# syntax=docker/dockerfile:1
# Build context = REPOSITORY ROOT (the pnpm lockfile lives there):
#   docker build -f apps/web/Dockerfile -t web .
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION=10.34.7
RUN npm install -g pnpm@${PNPM_VERSION}
# apps/web/package.json names its own pnpm version ("packageManager"): do not let pnpm download and switch to it
ENV npm_config_manage_package_manager_versions=false \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo

# ---- build: install (frozen lockfile), next build ------------------------------------------------
FROM base AS build
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so they are build arguments
ARG NEXT_PUBLIC_API_URL=http://localhost
ARG NEXT_PUBLIC_WS_URL=http://localhost
ARG NEXT_PUBLIC_USE_MOCKS=false
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL} \
    NEXT_PUBLIC_USE_MOCKS=${NEXT_PUBLIC_USE_MOCKS}
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter web...
COPY apps/web apps/web
RUN pnpm --filter web run build

# ---- runtime: built app + node_modules, `next start` ---------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /repo/apps/web
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/web/node_modules ./node_modules
COPY --from=build /repo/apps/web/.next ./.next
COPY --from=build /repo/apps/web/public ./public
COPY --from=build /repo/apps/web/package.json /repo/apps/web/next.config.ts ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]