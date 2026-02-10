# AIRGen Testing Strategy

This document defines the multi-layer testing approach for AIRGen and the
workstreams required to reach an industry-grade quality bar.

## Quick Reference

**Run tests locally:**
```bash
# Backend unit tests (fast, no Docker)
cd backend && pnpm test

# Backend container tests (requires Docker)
cd backend && pnpm test:integration

# Frontend tests
cd frontend && pnpm test

# E2E tests (requires Docker stack)
pnpm e2e
```

**Current status:** 12 unit test files with 288 passing tests (~17s), 3 container test files, all TypeScript compilation clean.

## Guiding Principles
- **Fast feedback**: unit suites must exercise core logic in <10 seconds.
- **Realistic integration**: cover graph persistence and queue flows against
  disposable containers, seeded from fixtures shared with Playwright.
- **Deterministic AI usage**: all LLM calls are mocked in tests; contract tests
  validate prompt/response formats before hitting production keys.
- **Shift-left resilience**: introduce regression checks for data migrations,
  baseline creation, and quality-score heuristics before release.

## Coverage Targets
| Layer                | Target | Tooling                          |
|----------------------|--------|----------------------------------|
| Core units           | 80%    | Vitest (Node/Happy DOM)          |
| Service integration  | 70%    | Vitest + Testcontainers          |
| API contract         | 100%   | Pact (Fastify)                   |
| UI workflows         | 8 critical flows | Playwright + seeded API |
| Regression smoke     | <5 min | pnpm test:smoke (select suites)  |

## Backend Roadmap
1. **Unit hardening (Week 1)**
   - Expand Vitest suites for heuristic generation, LLM failure modes, secure
     file access, and pagination helpers.
   - Capture fast fixtures in `src/__tests__/fixtures`.
2. **Neo4j integration (Week 2)**
   - Add `@testcontainers/neo4j` harness with `setupGraphTestEnvironment.ts`.
   - Seed tenants/projects via cypher fixtures; assert baseline lifecycle and
     requirement diffing.
   - Run in CI nightly; smoke subset on every PR with cached container layers.
3. **API contract testing (Week 3)**
   - Model consumer-driven contracts for `/requirements`, `/airgen`, and
     `/linksets`.
   - Fail build when response shape changes without pact update.
4. **Resilience and performance (Week 4)**
   - Stress test requirement generation throughput (worker pool saturation).
   - Add snapshots for migrations to detect accidental Cypher regressions.

## Frontend Roadmap
1. **Component coverage**
   - Add React Testing Library suites for tenant picker, AirGen forms, and
     candidate list interactions using MSW to stub API calls.
2. **Stateful hook testing**
   - Unit test `useTenantProject`, query caching, and optimistic updates.
3. **Critical Playwright flows**
   - Generate requirements, accept/reject candidates, manage baselines, edit
     documents.
   - Run chromium smoke on PR, full matrix nightly.

## Tooling & Automation

### Backend Test Commands (from /root/airgen/backend)
- `pnpm test` → Unit tests only (12 files, 288 tests, ~17s, no Docker needed)
- `pnpm test:watch` → Watch mode for unit tests
- `pnpm test:integration` → Container tests (3 files, requires Docker, 120s timeout)
- `pnpm test:integration:watch` → Watch mode for container tests
- `pnpm test:coverage` → Unit tests with coverage report
- `pnpm test:smoke` → Fast smoke tests (drafts + LLM, runs in-band)

### Frontend Test Commands (from /root/airgen/frontend)
- `pnpm test` → Vitest with Happy DOM
- `pnpm test:coverage` → Coverage report

### E2E Test Commands (from /root/airgen)
- `pnpm e2e` → Playwright with seeded fixtures (uses docker-compose)

### Current Test Status (as of 2025-10-11)
- ✅ **Unit tests**: 12 files, 288 passing tests, 17s runtime
- ✅ **Container tests**: 3 files (candidates.container.test.ts, diagram-candidates.container.test.ts, baseline.container.test.ts)
- ⚠️ **Integration**: Requires Docker, separated from unit tests for CI efficiency
- ⏳ **Coverage**: Tooling configured, baseline measurement pending

### GitHub Actions Strategy
- `backend-unit`: `pnpm -C backend test` on each PR (fast, no Docker)
- `backend-integration`: `pnpm -C backend test:integration` on nightly/release (requires Docker service)
- `frontend-unit`: `pnpm -C frontend test` on each PR
- `e2e`: `pnpm e2e` against seeded stack nightly + before release
- Enforce coverage thresholds via Vitest `coverage.all` once baselines are established

### Containerised Integration Tests

Container tests (`*.container.test.ts`) use Testcontainers for Neo4j integration testing. They are **automatically excluded** from the default `pnpm test` command to avoid Docker dependencies in CI and local development.

**Local execution:**
```bash
# Ensure Docker is running first
cd backend

# Run all container tests
pnpm test:integration

# Run specific container test
pnpm test:integration src/services/graph/__tests__/candidates.container.test.ts

# Watch mode for container tests
pnpm test:integration:watch
```

**Configuration:**
- Unit tests: `vitest.config.ts` excludes `**/*.container.test.ts` (10s timeout)
- Container tests: `vitest.integration.config.ts` includes only `**/*.container.test.ts` (120s timeout)

**CI setup:**
- Default test job: `pnpm -C backend test` (fast, no Docker)
- Separate integration job: `pnpm -C backend test:integration` (requires Docker service)
- Use GitHub-hosted Linux runners with `services: docker` for integration tests
- Container images add ~30s per suite once cached

## Immediate Next Steps
1. Land unit suites for requirement drafting and LLM generation (done in PR).
2. Scaffold Neo4j container harness and smoke baseline creation.
3. Backfill AirGen React tests with MSW-driven state assertions.
4. Wire separate CI jobs and surface reports in GitHub summary artifacts.

## Communication
- Publish weekly test status in `TEST_SUMMARY.md`.
- Track roadmap items in Jira with labels `qa-backend` / `qa-frontend`.
- Hold monthly failure review to adjust coverage and smoke selection.
