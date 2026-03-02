# SysML Developer Setup Checklist

**Status:** Phase 0 draft  
**Audience:** Backend + frontend engineers onboarding to the SysML v2 integration  
**Last Updated:** 2025-10-26

This checklist supplements the main `README.md` and focuses on tooling and workflows required to contribute to the new SysML stack.

---

## 1. Prerequisites

- Node.js 20.x (use `volta` or `nvm` to match repo `.nvmrc`).
- `pnpm` ≥ 9.12 (`corepack enable` or `npm install -g pnpm`).
- Docker (for Neo4j + Redis containers in dev).
- Git LFS (optional but recommended for diagram exports).
- Access to shared `.env` secrets: request from platform engineering (`env/.local/sysml.env`).

---

## 2. Workspace Bootstrapping

```bash
# Install dependencies
pnpm install

# Start shared services (Neo4j, Redis)
docker compose -f infra/docker-compose.sysml.yml up -d

# Backend dev server
pnpm -C backend dev

# Frontend dev server
pnpm -C frontend dev
```

> **Note:** The SysML compose file only runs Neo4j + Redis. Start the main `docker-compose.dev.yml` stack if you need Postgres or the REST API locally.

---

## 3. Environment Variables

Create `env/.local/sysml.env` (ignored by Git) with:

```
NEO4J_USER=neo4j
NEO4J_PASSWORD=local-dev-password
NEO4J_URL=bolt://localhost:7687
NEO4J_DATABASE=airgen
SYSML_BETA_ENABLED=true
SYSML_AI_ASSIST_ENABLED=false
SYSML_DEFAULT_VIEWPOINTS=bdd,ibd,req
SYSML_SEED_TENANT=demo
SYSML_SEED_PROJECT=sysml-eval
```

Load it by sourcing `scripts/export-env.sh env/.local/sysml.env` before running backend commands, or add entries to `.env.development`.

---

## 4. Seed Data & Fixtures

- Run the SysML migration script to ensure constraints (add `--seed` for sample data):
  ```bash
  pnpm -C backend exec tsx scripts/migrate-add-sysml.ts --seed
  ```
  With `--seed` it creates demo packages and viewpoints for the tenant/project in `SYSML_SEED_TENANT` / `SYSML_SEED_PROJECT` (defaults: `demo` / `sysml-eval`).
- To populate UI fixtures, execute:
  ```bash
  pnpm -C backend exec tsx src/scripts/seed-sysml-fixtures.ts --tenant demo --project sysml-eval
  ```
  Adjust `--tenant` / `--project` as needed; by default the script seeds `demo/sysml-eval` with a package, two blocks, their relationship, and a diagram.
- Frontend Storybook stories will live under `frontend/src/components/sysml/__stories__` (to be created); use `pnpm -C frontend storybook`.

---

## 5. Testing

- **Unit/integration (backend):**
  ```bash
  pnpm -C backend test --filter sysml
  pnpm -C backend test:integration -- --suite sysml
  ```
  Tests leverage Testcontainers’ Neo4j image with SysML labels seeded.
- **Frontend unit/UI:**
  ```bash
  pnpm -C frontend test --run sysml
  pnpm -C frontend e2e --grep "@sysml"
  ```
  Playwright project `sysml` (to be added) will target `/sysml-models`.
- **Smoke pipeline:** Add `sysml-smoke.yml` to GitHub Actions once backend + frontend endpoints are stable (Phase 1 exit criteria).

---

## 6. Telemetry & Feature Flags

- SysML routes emit metrics under `sysml_*` namespace; ensure `PROMETHEUS_ENABLED=true` locally if you need dashboards.
- Feature flags are environment-driven (`SYSML_BETA_ENABLED`, `SYSML_AI_ASSIST_ENABLED`). Update `backend/src/config.ts` defaults and corresponding frontend feature-flag checks when introducing new toggles.

---

## 7. Code Structure Reference

- Backend services: `backend/src/services/graph/sysml/` (new).
- Backend routes: `backend/src/routes/sysml/` (new).
- Shared types: `backend/src/services/graph/sysml/types.ts` (mirrors frontend types in `frontend/src/types/sysml.ts`).
- Frontend components: `frontend/src/components/sysml/` (diagrams, editors).
- Hooks: `frontend/src/hooks/useSysMLApi.ts`, `frontend/src/hooks/useSysMLUndo.ts`.

During Phase 0 we stub these directories with placeholder exports so other teams can branch against them without build failures.

---

## 8. Developer Workflow Checklist

- [ ] Pull latest `master`, run `pnpm install`, ensure no lockfile drift.
- [ ] Start Neo4j/Redis containers.
- [ ] Start backend (`pnpm -C backend dev`) and frontend (`pnpm -C frontend dev`) in separate terminals.
- [ ] Verify `/sysml-models` route shows feature flag gate page (placeholder).
- [ ] Run backend + frontend lint (`pnpm -C backend lint`, `pnpm -C frontend lint`).
- [ ] Run targeted tests before pushing.
- [ ] Capture any schema/contract changes in accompanying docs (`docs/sysml-schema.md`, `docs/api-sysml-draft.md`).

---

## 9. Outstanding Tasks

- Finalize Docker compose file for isolated SysML services.
- Add seed scripts + fixtures referenced above.
- Document Neo4j browser helper queries for debugging.
- Provide sample Postman collection covering draft API.
