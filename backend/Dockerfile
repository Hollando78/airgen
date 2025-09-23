# Stage 1: Install workspace dependencies required for the backend service
FROM node:20-alpine AS deps
WORKDIR /workspace

# Copy root manifests that help pnpm resolve the monorepo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
COPY packages/req-qa/package.json packages/req-qa/

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN pnpm install --filter @airgen/backend... --frozen-lockfile

# Stage 2: Build TypeScript sources
FROM node:20-alpine AS build
WORKDIR /workspace

# Reuse pnpm store + dependencies from previous stage
COPY --from=deps /workspace/node_modules /workspace/node_modules
COPY --from=deps /root/.local/share/pnpm /root/.local/share/pnpm
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Copy the full repository context
COPY . .

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN pnpm -C packages/req-qa build && pnpm -C backend build

# Stage 3: Production runtime image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy workspace pieces needed at runtime
COPY --from=build /workspace/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /workspace/package.json ./package.json
COPY --from=build /workspace/backend ./backend
COPY --from=build /workspace/packages ./packages
COPY --from=build /root/.local/share/pnpm /root/.local/share/pnpm

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
RUN pnpm install --filter @airgen/backend... --prod --frozen-lockfile

WORKDIR /app/backend
EXPOSE 8787
CMD ["node", "dist/server.js"]
