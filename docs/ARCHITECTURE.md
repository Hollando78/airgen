# AIRGen Architecture & Deployment Plan

## Mission
AIRGen helps engineering teams move from stakeholder needs to compliant, testable requirements. The service runs on a VPS, drafts content with AI assistance, validates it deterministically, persists Markdown as the system of record, and now indexes relationships in a graph database for rich traceability.

## Components
1. **Fastify API (`backend/`)** – HTTP interface for drafting, QA, baselines, storage, and link suggestions. Written in TypeScript.
2. **Deterministic QA engine (`packages/req-qa`)** – pure TypeScript rules aligned to ISO/IEC/IEEE 29148 + EARS. Provides scoring/suggestions without hitting an LLM.
3. **Markdown workspace** – requirements live under `workspace/<tenant>/<project>/requirements/`. Markdown remains the master copy for Git sync/export.
4. **Neo4j graph database** – primary metadata store. Tenants, projects, requirements, and baselines are nodes with relationships for traceability queries (`Tenant-[:OWNS]->Project-[:CONTAINS]->Requirement`, `Baseline-[:SNAPSHOT_OF]->Requirement`).
5. **PostgreSQL (optional)** – reserved for future analytics/reporting workloads that prefer relational schemas. The current code path uses Neo4j for operational metadata.
6. **Redis** – rate-limiting cache and short-lived generation/session state.
7. **Traefik** – reverse proxy + TLS termination. Routes `/api/*` traffic to the Fastify service and optionally exposes the dashboard at `/traefik`.

## Persistence & Data Flow
1. Client calls `/draft`.
   - Heuristic drafts are assembled locally using EARS templates.
   - If `useLlm=true` and an LLM provider is configured, OpenAI (or future providers) generates additional drafts that are re-scored by the deterministic QA engine.
2. Client chooses a draft and optionally calls `/qa` to re-run deterministic checks.
3. Client saves the requirement via `/requirements`.
   - Metadata is written to Neo4j in a single transaction (unique `REQ-` reference, slugged tenant/project, QA metadata, tags).
   - Markdown is rendered with YAML front matter and persisted on disk.
4. `/baseline` snapshots the current set of requirements for a project by creating a `Baseline` node linked to each requirement (`Baseline-[:SNAPSHOT_OF]->Requirement`).
5. `/link/suggest` performs a graph query (`CONTAINS` relationship + text match) to propose potential trace links.

## Graph Schema Highlights
- `(:Tenant {slug})-[:OWNS]->(:Project {slug})`
- `(:Project)-[:CONTAINS]->(:Requirement {ref, title, path, qaScore, ...})`
- `(:Project)-[:HAS_BASELINE]->(:Baseline {ref, requirementRefs[]})`
- `(:Baseline)-[:SNAPSHOT_OF]->(:Requirement)`

This structure allows future expansion for needs, risks, or test cases as additional node labels with contextual relationships.

## LLM Gateway
- `LLM_PROVIDER=openai` enables the OpenAI SDK.
- `LLM_API_KEY`/`OPENAI_API_KEY`, `LLM_MODEL`, and `LLM_BASE_URL` tune the provider.
- `/draft` accepts `useLlm: true`, returning `source: "llm"` drafts ahead of heuristic ones. Errors are surfaced in the response metadata while heuristics continue to run.
- Extensible architecture: add new providers in `backend/src/services/llm.ts` by branching on `config.llm.provider`.

## Deployment (VPS)
1. Copy `.env.example` to `.env` and populate:
   - Traefik ports/hostnames
   - Neo4j credentials (`GRAPH_*`), optionally Postgres/Redis if exposing externally
   - LLM credentials if using OpenAI or another provider
2. Ensure Docker Engine and Compose are installed.
3. Launch stack: `docker compose up -d --build`.
   - Persists Neo4j data in `neo4jdata`, Postgres in `pgdata`, Markdown workspace in `./workspace`.
4. Monitor at `/api/health` and (optionally) `/traefik`.

## Operations & Observability
- Fastify logs JSON to stdout; aggregate with Loki/ELK.
- Neo4j and Redis expose metrics; pair with Prometheus exporters if needed.
- `pnpm approve-builds` allows esbuild (used by dependencies such as OpenAI) to run native build scripts inside secured environments.
- Schedule backups for `workspace/`, `neo4jdata`, and any Postgres volume.

## Security Considerations
- Rotate `API_JWT_SECRET`, Neo4j credentials, and LLM API keys regularly.
- Restrict Traefik dashboard via auth or firewall rules.
- Enable TLS in Traefik and, if needed, encrypted Bolt connections (`GRAPH_ENCRYPTED=true`).
- Store secrets in a vault/manager instead of plain `.env` on shared hosts.

## Authentication & Authorization Roadmap
- A dedicated Fastify auth plugin now wraps `@fastify/jwt`, attaches a normalized `request.currentUser`, and exposes `app.authenticate` for protected routes while keeping `app.optionalAuthenticate` for public flows. This makes it straightforward to ratchet up enforcement route-by-route once account onboarding is complete.
- User principals are expected to arrive via JWTs (OIDC, Auth0, etc.). The payload should include `sub`, `email`, and optional role/tenant claims (`roles`, `tenantSlugs`) so authorization checks can be done without extra hops.
- Multi-tenant scoping will align with Neo4j tenant slugs. Once account management lands, guarded routes can validate that `request.currentUser.tenantSlugs` contains the tenant in the request path before continuing.
- Future work: add a `/auth/login` exchange (for password or device code flows if needed), persist users/roles/refresh tokens in Neo4j or Postgres, and emit audit events for requirement mutations.

## Roadmap Ideas
- Add nodes for Needs/Tests and create automated `[:VERIFIES]` or `[:SATISFIES]` relationships.
- Incorporate vector search (pgvector/Qdrant) for semantic linking.
- Build a front-end client or CLI that consumes the API and renders Markdown + graph context.
- Expand automated tests (`node --test`, `vitest`) covering graph persistence and LLM fallback flows.
