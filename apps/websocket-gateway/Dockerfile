# syntax=docker/dockerfile:1
# Build context = REPOSITORY ROOT (the pnpm lockfile lives there):
#   docker build -f apps/websocket-gateway/Dockerfile -t websocket-gateway .
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION=10.34.7
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo

# ---- build: install (frozen lockfile), nest build (no database, so no prisma) ---------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/websocket-gateway/package.json apps/websocket-gateway/
RUN pnpm install --frozen-lockfile --filter websocket-gateway...
COPY apps/websocket-gateway apps/websocket-gateway
WORKDIR /repo/apps/websocket-gateway
RUN pnpm exec nest build

# ---- runtime ----------------------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3007
WORKDIR /repo/apps/websocket-gateway
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/websocket-gateway/node_modules ./node_modules
COPY --from=build /repo/apps/websocket-gateway/dist ./dist
COPY --from=build /repo/apps/websocket-gateway/package.json ./
USER node
EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3007)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]