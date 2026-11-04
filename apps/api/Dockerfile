# ============================================================================
# Project Atlas — API Production Dockerfile
# Multi-stage, non-root, minimal attack surface, built for production deployment
# ============================================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.4.2 --activate

# --- 1. Dependencies Stage ---
FROM base AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile

# --- 2. Build Stage ---
FROM dependencies AS builder
COPY . .
RUN pnpm --filter @atlas/database generate
RUN pnpm --filter @atlas/database build
RUN pnpm --filter @atlas/api build

# --- 3. Production Runtime Stage ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=3001
ENV NODE_PATH=/app/node_modules:/app/apps/api/node_modules
ENV TS_NODE_PROJECT=apps/api/tsconfig.json

# Run as non-root node user
USER node

COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/packages ./packages
COPY --chown=node:node --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node --from=builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node --from=builder /app/apps/api/tsconfig.json ./apps/api/tsconfig.json

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", "apps/api/dist/main.js"]

