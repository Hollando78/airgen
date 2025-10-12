# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS base
WORKDIR /workspace

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

ARG PNPM_VERSION=10.17.1
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# ---------------------------------------------------------------------------
# Build stage - install dependencies and compile sources
# ---------------------------------------------------------------------------
FROM base AS build

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
COPY packages/req-qa/package.json packages/req-qa/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --filter @airgen/backend... --frozen-lockfile

# Copy remaining source files
COPY . .

RUN pnpm -C packages/req-qa build
RUN pnpm -C backend build

# Prepare production bundle (node_modules + dist) in /app
RUN pnpm --filter @airgen/backend deploy --prod --legacy /app

# ---------------------------------------------------------------------------
# Runtime stage - minimal production image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Document preview dependencies
RUN apk add --no-cache \
    build-base \
    python3 \
    pkgconfig \
    cairo-dev \
    pango-dev \
    libjpeg-turbo-dev \
    giflib-dev \
    pixman-dev \
    libreoffice \
    poppler-utils \
    ttf-liberation \
    ttf-dejavu \
    fontconfig \
    && fc-cache -f

COPY --from=build /app/ .
COPY --from=build /workspace/backend/public ./public

EXPOSE 8787
CMD ["node", "dist/server.js"]
