# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS base
WORKDIR /workspace

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

ARG PNPM_VERSION=10.17.1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
FROM base AS build

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/mcp-server/package.json packages/mcp-server/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --filter @airgen/mcp-server --frozen-lockfile

COPY packages/mcp-server/ packages/mcp-server/

RUN NODE_OPTIONS='--max-old-space-size=4096' pnpm -C packages/mcp-server build

# Prepare production bundle
RUN pnpm --filter @airgen/mcp-server deploy --prod --legacy /app

# ---------------------------------------------------------------------------
# Runtime stage — minimal image, no native deps needed
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/ .

EXPOSE 3100
CMD ["node", "dist/index.js"]
