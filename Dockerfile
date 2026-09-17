# Multi-stage build for Olist Analytics Studio
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
RUN apk add --no-cache curl unzip coreutils
WORKDIR /app

# Install all dependencies first for caching
FROM base AS deps
COPY . .
ENV CI=true
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build all packages
FROM deps AS build
RUN pnpm --filter @olist/contracts build
RUN pnpm --filter @olist/mcp build
RUN pnpm --filter @olist/api build
RUN pnpm --filter @olist/ingest build
RUN pnpm --filter @olist/web build

# Ingest runtime
FROM base AS ingest
COPY --from=build /app /app
WORKDIR /app/apps/ingest
CMD ["node", "dist/index.js"]

# API runtime
FROM base AS api
COPY --from=build /app /app
WORKDIR /app/apps/api
USER node
CMD ["node", "dist/server.js"]
