# AIRGen Architecture & Deployment Plan

## Mission
AIRGen helps engineering teams move from stakeholder needs to compliant, testable requirements. The service runs on a VPS, drafts content with AI assistance, validates it deterministically, persists Markdown as the system of record, and now indexes relationships in a graph database for rich traceability.

## Components
1. **Fastify API (`backend/`)** – HTTP interface for drafting, QA, baselines, storage, and link suggestions. Written in TypeScript.
2. **Deterministic QA engine (`packages/req-qa`)** – pure TypeScript rules aligned to ISO/IEC/IEEE 29148 + EARS. Provides scoring/suggestions without hitting an LLM.
3. **Background Workers (`backend/src/workers/`)** – Long-running background tasks for bulk operations:
   - **QA Scorer Worker** – Automatically scores all requirements in a project. Runs as a singleton to prevent duplicate processing. Exposes status API for progress monitoring.
4. **Markdown workspace** – requirements live under `workspace/<tenant>/<project>/requirements/`. Markdown remains the master copy for Git sync/export.
5. **Neo4j graph database** – primary metadata store. Tenants, projects, requirements, and baselines are nodes with relationships for traceability queries (`Tenant-[:OWNS]->Project-[:CONTAINS]->Requirement`, `Baseline-[:SNAPSHOT_OF]->Requirement`).
6. **PostgreSQL (optional)** – reserved for future analytics/reporting workloads that prefer relational schemas. The current code path uses Neo4j for operational metadata.
7. **Redis** – rate-limiting cache and short-lived generation/session state.
8. **Traefik** – reverse proxy + TLS termination. Routes `/api/*` traffic to the Fastify service and optionally exposes the dashboard at `/traefik`.

## Persistence & Data Flow
1. Client calls `/draft`.
   - Heuristic drafts are assembled locally using EARS templates.
   - If `useLlm=true` and an LLM provider is configured, OpenAI (or future providers) generates additional drafts that are re-scored by the deterministic QA engine.
2. Client chooses a draft and optionally calls `/qa` to re-run deterministic checks.
3. Client saves the requirement via `/requirements`.
   - Metadata is written to Neo4j in a single transaction (unique `REQ-` reference, slugged tenant/project, QA metadata, tags).
   - Markdown is rendered with YAML front matter and persisted on disk.
4. Requirements can be archived via `/requirements/:tenant/:project/archive` or unarchived via `/unarchive`.
   - Archived requirements are flagged with `archived: true` in Neo4j but remain in the database and on disk.
   - All list/search queries filter out archived requirements by default, effectively hiding them from normal views.
   - Archive operations support batch processing (multiple requirements at once).
5. `/baseline` snapshots the current set of requirements for a project by creating a `Baseline` node linked to each requirement (`Baseline-[:SNAPSHOT_OF]->Requirement`).
6. `/link/suggest` performs a graph query (`CONTAINS` relationship + text match) to propose potential trace links.

## Graph Schema Highlights
- `(:Tenant {slug})-[:OWNS]->(:Project {slug})`
- `(:Project)-[:CONTAINS]->(:Requirement {ref, title, path, qaScore, archived, ...})`
- `(:Project)-[:HAS_BASELINE]->(:Baseline {ref, requirementRefs[]})`
- `(:Baseline)-[:SNAPSHOT_OF]->(:Requirement)`

Requirements support soft-delete (`deleted: true`) and archive (`archived: true`) flags. List queries filter both by default.

This structure allows future expansion for needs, risks, or test cases as additional node labels with contextual relationships.

## Diagram-Specific Persistence
- Architecture blocks continue to be defined once, but their placement inside a given diagram now carries `rel.portOverrides` JSON on the `HAS_BLOCK` relationship. Each override maps a port ID to diagram-local properties (edge, offset, hidden, visibility of labels, and label offsets). This keeps shared blocks reusable while allowing each diagram to expose only the ports it needs.
- Hidden ports remain part of the ReactFlow graph and the backend metadata so existing connectors stay valid. The canvas suppresses their handles entirely and surfaces a badge within the block summarising how many ports are hidden in the current diagram.
- Connector labels can be dragged to new positions; the resulting `labelOffsetX/Y` persist per diagram on the connector node so documentation callouts do not collide when reused elsewhere.
- The ReactFlow integration reads both the definition ports and any overrides, feeding the merged result through `useArchitecture`/`useInterface` hooks. PATCHing `/architecture/blocks/:blockId` with a `portOverrides` payload or `/architecture/connectors/:connectorId` with `labelOffsetX/Y` updates the stored overrides.

## LLM Gateway
- `LLM_PROVIDER=openai` enables the OpenAI SDK.
- `LLM_API_KEY`/`OPENAI_API_KEY`, `LLM_MODEL`, and `LLM_BASE_URL` tune the provider.
- `/draft` accepts `useLlm: true`, returning `source: "llm"` drafts ahead of heuristic ones. Errors are surfaced in the response metadata while heuristics continue to run.
- Extensible architecture: add new providers in `backend/src/services/llm.ts` by branching on `config.llm.provider`.

## Deployment (VPS)
1. Copy `.env.example` to `.env` and populate:
   - Traefik ports/hostnames
   - `TRAEFIK_BASIC_AUTH_USERS` with the `htpasswd -nb <user> <password>` output so the public site requires credentials
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
- Traefik now enforces HTTP basic auth for both `/` and `/api`; rotate the credentials stored in `TRAEFIK_BASIC_AUTH_USERS` alongside other secrets.
- Enable TLS in Traefik and, if needed, encrypted Bolt connections (`GRAPH_ENCRYPTED=true`).
- Store secrets in a vault/manager instead of plain `.env` on shared hosts.

## Authentication & Authorization Roadmap
- A dedicated Fastify auth plugin now wraps `@fastify/jwt`, attaches a normalized `request.currentUser`, and exposes `app.authenticate` for protected routes while keeping `app.optionalAuthenticate` for public flows. This makes it straightforward to ratchet up enforcement route-by-route once account onboarding is complete.
- During development, `/api/dev/admin/users` provides a file-backed user registry (mirrored in `workspace/dev-users.json`) with a matching `/admin/users` React view for quick CRUD without touching production systems.
- Production builds of the React client ship only the static landing page; the interactive workspace routes are tree-shaken behind a dev-only `lazy()` import so no internal tooling ships to prod.
- User principals are expected to arrive via JWTs (OIDC, Auth0, etc.). The payload should include `sub`, `email`, and optional role/tenant claims (`roles`, `tenantSlugs`) so authorization checks can be done without extra hops.
- Multi-tenant scoping will align with Neo4j tenant slugs. Once account management lands, guarded routes can validate that `request.currentUser.tenantSlugs` contains the tenant in the request path before continuing.
- Future work: add a `/auth/login` exchange (for password or device code flows if needed), persist users/roles/refresh tokens in Neo4j or Postgres, and emit audit events for requirement mutations.

## Background Workers

### QA Scorer Worker
The QA scorer worker provides bulk quality analysis for all requirements in a project:

**Architecture:**
- Singleton pattern prevents duplicate scoring runs
- Runs asynchronously in the API process (no separate worker process needed)
- Tracks progress (processedCount, totalCount, currentRequirement)
- Surfaces errors without blocking the entire batch

**API Endpoints:**
- `POST /api/workers/qa-scorer/start?tenant=X&project=Y` – Starts scoring all requirements
- `POST /api/workers/qa-scorer/stop` – Stops the current run
- `GET /api/workers/qa-scorer/status` – Returns real-time status

**Status Response:**
```json
{
  "isRunning": true,
  "processedCount": 42,
  "totalCount": 85,
  "currentRequirement": "SRD-ARCH-017",
  "lastError": null,
  "startedAt": "2025-10-08T19:37:26.460Z",
  "completedAt": null
}
```

**Integration:**
- Dashboard displays QA metrics (excellent, good, needs work, unscored counts)
- Automatic query invalidation refreshes dashboard when worker completes
- Each requirement update persists qaScore, qaVerdict, and suggestions to Neo4j
- Manual refresh button available for immediate updates

**Implementation Details:**
- Worker code: `backend/src/workers/qa-scorer.ts`
- Routes: `backend/src/routes/workers.ts`
- Uses `@airgen/req-qa` package for deterministic scoring
- Updates requirements via `updateRequirement()` from requirements-crud
- Errors are logged but don't stop processing of remaining requirements

## Requirements Change Tracking

The system provides comprehensive version history and change tracking for all requirements and related entities:

**Implemented Features:**
- **RequirementVersion nodes** in Neo4j for complete version history
- **User tracking** (createdBy, updatedBy, changedBy) on all changes
- **Diff capabilities** to compare any two versions via API endpoints
- **Restore previous versions** with rollback support
- **Complete audit trail** for compliance and traceability
- **Content hash** (SHA-256) to detect drift between Neo4j and markdown files
- **Soft delete tracking** (deletedAt, deletedBy, restoredAt)
- **Version history** for documents, architecture blocks, connectors, diagrams, linksets, trace links, and document sections

**API Endpoints:**
- `GET /api/requirements/:tenant/:project/:id/history` - Get version history
- `GET /api/requirements/:tenant/:project/:id/diff?from=N&to=M` - Get diff between versions
- `POST /api/requirements/:tenant/:project/:id/restore/:versionNumber` - Restore to previous version

## Roadmap Ideas
- Add nodes for Needs/Tests and create automated `[:VERIFIES]` or `[:SATISFIES]` relationships.
- Incorporate vector search (pgvector/Qdrant) for semantic linking.
- Build a front-end client or CLI that consumes the API and renders Markdown + graph context.
- Expand automated tests (`node --test`, `vitest`) covering graph persistence and LLM fallback flows.
- Complete custom attributes schema management UI for project-specific metadata fields.
