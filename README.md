# AIRGen (VPS Edition)

AIRGen is an AI-assisted requirements generation service tailored for a self-hosted VPS. It blends deterministic QA with templated EARS-style drafts, persists curated requirements as Markdown, stores metadata/relationships in Neo4j, and exposes a Fastify API that can be consumed by any front-end or automation.

## Features

### Requirements Management
- **Draft generation** – Produces 1–5 candidate requirements from a need. Enable `useLlm` to let OpenAI (or future providers) synthesize additional drafts.
- **Deterministic QA** – Scores requirements against ISO/IEC/IEEE 29148 inspired checks.
- **Archive management** – Archive/unarchive requirements to hide them from default views without deletion. Works for individual requirements and groups.
- **Duplicate detection** – Identifies and helps fix duplicate requirements.

### Document Management
- **Document upload** – Support for Word, PDF, and other document formats.
- **Document parsing** – Extracts sections and content from uploaded documents.
- **Folder organization** – Organize documents in hierarchical folder structures.
- **Section management** – Create and manage document sections with requirement linking.

### Traceability & Linking
- **Trace links** – Create and manage trace relationships between requirements.
- **Linksets** – Organize related trace links into linksets for structured traceability.
- **Link suggestions** – AI-powered suggestions for potential trace links using graph queries.
- **Visual tracing** – Navigate and visualize requirement relationships.

### Architecture & Diagrams
- **Architecture diagrams** – Create and edit system architecture diagrams.
- **Block library** – Reusable architecture blocks and components.
- **Connectors** – Define relationships and data flows between blocks.
- **Visual workspace** – Interactive diagram canvas with ReactFlow.

### AI-Assisted Generation (AIRGen)
- **Conversational AI** – Chat-based interface for requirement generation.
- **Smart candidates** – AI generates requirement candidates from natural language.
- **Accept/Reject workflow** – Review and approve AI-generated requirements.
- **Context-aware** – Maintains project context for better suggestions.

### Data & Persistence
- **Graph database** – Requirements, projects, tenants, and baselines live in Neo4j for rich traceability queries.
- **Markdown-first storage** – Approved requirements stored as `workspace/<tenant>/<project>/requirements/*.md` with YAML front matter.
- **Baselining** – Snapshot requirement sets for release audits and version control.

### Deployment & Infrastructure
- **Docker-native** – Traefik + Neo4j + Fastify API + Redis compose stack for quick VPS deployment.
- **Multi-tenant** – Full tenant and project isolation with RBAC.
- **Authentication** – JWT-based authentication with role-based access control.

## Repository layout
```
airgen/
├─ backend/                  # Fastify API service
├─ packages/
│  └─ req-qa/                # Deterministic QA rules engine
├─ docs/                     # Architecture and ops guidance
├─ examples/                 # Sample braking-domain artifacts
├─ workspace/                # Runtime Markdown workspace (gitignored)
├─ docker-compose.dev.yml
├─ docker-compose.prod.yml
├─ pnpm-workspace.yaml
├─ package.json
└─ README.md
```

See `docs/ARCHITECTURE.md` for a detailed component and deployment walkthrough.

## Getting started (Docker)
```bash
cp env/development.env.example env/development.env   # Configure local secrets and ports
# Populate GRAPH_*/LLM_* values if using Neo4j auth and OpenAI
npm install -g corepack                              # Optional if corepack isn’t already enabled
corepack enable
pnpm install                                         # Installs workspace dependencies (once)
pnpm approve-builds                                  # Allow esbuild if prompted

# Launch the development stack
COMPOSE_PROJECT_NAME=airgen_dev \\
docker compose --env-file env/development.env \
  -f docker-compose.dev.yml up -d --build
# API reachable at http://localhost:18787/health
```

## Getting started (local dev without Docker)
```bash
# Requires Node.js 20+ and pnpm
pnpm install
pnpm -C packages/req-qa build
pnpm -C backend dev                # Fastify API at http://localhost:8787
pnpm -C frontend dev               # Vite dev server at http://localhost:5173 (proxying /api)
```

## Environment configuration

- `env/development.env.example` & `env/production.env.example` provide docker compose templates. Copy them to `env/development.env` or `env/production.env` and adjust secrets before running `docker compose --env-file env/<env>.env ...`.
- `deploy-production.sh` now consumes the same environment file via the `ENV_FILE` variable (defaults to `env/production.env`).
- The backend loads environment-specific dotenv files via `API_ENV`. Place settings in `backend/.env.development` or `backend/.env.production` (templates live alongside them) when running the service directly.
- The frontend follows Vite conventions. Copy `frontend/.env.development.example` or `frontend/.env.production.example` to `.env.development` / `.env.production` within the `frontend/` folder to inject build-time values such as `VITE_API_BASE_URL`.
- The Vite dev server now binds to `127.0.0.1` by default for VPN/SSH protected access. Override with `VITE_DEV_SERVER_HOST` only when you explicitly need remote access.
- To point the dev UI at a shared staging or production API, set `VITE_API_BASE_URL` (for static builds) or `API_PROXY_TARGET` (for the dev server) to the desired backend base URL.

### Running dev alongside production on the VPS
- Keep the `COMPOSE_PROJECT_NAME=airgen_dev` prefix when starting the dev stack so Docker creates separate volumes (`airgen_dev_pgdata_dev`, `airgen_dev_neo4jdata_dev`) instead of reusing production data.
- The development compose file binds to high ports by default (`Postgres 55432`, `Redis 36379`, `Neo4j 17687/17474`, `API 18787`). Adjust `env/development.env` if you need different values, then connect via SSH tunnel rather than exposing them publicly.
- The dev API mounts `workspace/dev/` inside the repo, keeping Markdown output and seeded users isolated from the production workspace.
- Leave the production “coming soon” stack running until launch; only run `deploy-production.sh` when you’re ready to replace Traefik/nginx with the full application.

## Frontend architecture
- **Shared diagram canvas** – Both Architecture and Interface workspaces now reuse a common `DiagramCanvas` and `useDiagramCanvasInteractions`. Each workspace supplies its own block presets, connector mapping, and palette metadata, while the shared canvas drives ReactFlow rendering, selection state, context menus, debounced persistence, and mini-map/query overlays.
- **Composable workspaces** – Route-level workspace components now just coordinate tenant/project context, floating document windows, palettes, and inspectors around the shared canvas, keeping each route lightweight.

## Key API endpoints

### Core & System
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| GET    | `/health`                                 | Health and environment details |
| GET    | `/tenants`                                | List tenants and project counts |
| POST   | `/tenants`                                | Create a new tenant |
| GET    | `/tenants/:tenant/projects`               | Projects for a tenant with requirement counts |
| POST   | `/tenants/:tenant/projects`               | Create a new project |

### Requirements & QA
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| POST   | `/draft`                                  | Generate candidate requirements (heuristic + optional LLM) |
| POST   | `/qa`                                     | Run deterministic QA |
| POST   | `/apply-fix`                              | Suggest edits for ambiguous phrases |
| POST   | `/requirements`                           | Create a requirement (Markdown + Neo4j metadata) |
| GET    | `/requirements/:tenant/:project`          | List stored requirements |
| GET    | `/requirements/:tenant/:project/:ref`     | Fetch requirement metadata + Markdown |
| PATCH  | `/requirements/:tenant/:project/:id`      | Update a requirement |
| DELETE | `/requirements/:tenant/:project/:id`      | Delete a requirement |
| POST   | `/requirements/:tenant/:project/archive`  | Archive requirements (hide from default views) |
| POST   | `/requirements/:tenant/:project/unarchive`| Unarchive requirements (restore to default views) |

### Documents & Sections
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| POST   | `/documents`                              | Create a document |
| GET    | `/documents/:tenant/:project`             | List documents |
| GET    | `/documents/:tenant/:project/:slug`       | Get document metadata |
| POST   | `/documents/upload`                       | Upload document file |
| PATCH  | `/documents/:tenant/:project/:slug`       | Update document |
| DELETE | `/documents/:tenant/:project/:slug`       | Delete document |
| POST   | `/folders`                                | Create a folder |
| GET    | `/folders/:tenant/:project`               | List folders |
| POST   | `/sections`                               | Create a section |
| GET    | `/sections/:tenant/:project/:docSlug`     | List sections |

### Traceability & Linking
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| POST   | `/link/suggest`                           | Suggest trace links |
| POST   | `/trace-links`                            | Create trace link |
| GET    | `/trace-links/:tenant/:project`           | List trace links |
| POST   | `/linksets/:tenant/:project`              | Create linkset |
| GET    | `/linksets/:tenant/:project`              | List linksets |
| POST   | `/linksets/:tenant/:project/:id/links`    | Add links to linkset |

### Baselines & Architecture
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| POST   | `/baseline`                               | Create a baseline snapshot |
| GET    | `/baselines/:tenant/:project`             | List baselines for a project |
| POST   | `/architecture/diagrams`                  | Create architecture diagram |
| GET    | `/architecture/diagrams/:tenant/:project` | List diagrams |
| POST   | `/architecture/blocks`                    | Create diagram block |
| POST   | `/architecture/connectors`                | Create diagram connector |

### AIRGen
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| POST   | `/airgen/chat`                            | AI-assisted requirement generation chat |
| GET    | `/airgen/candidates/:tenant/:project`     | List requirement candidates |
| POST   | `/airgen/candidates/:id/accept`           | Accept a candidate |
| POST   | `/airgen/candidates/:id/reject`           | Reject a candidate |

## Web UI frontend
- `pnpm -C frontend dev` launches a Vite dev server on http://localhost:5173 with a proxy to the Fastify API at `/api`.
- Set `VITE_API_BASE_URL` to override the proxy target when deploying the static build (`pnpm -C frontend build`).
- The UI covers tenant/project selection, draft generation (heuristics + optional LLM), QA, requirement persistence, baseline management, link suggestions, and token management for upcoming authentication flows.
- Development builds expose an admin workspace at `/admin/users` for seeding file-backed user accounts without touching production data. All UI routes now require authentication even in development, so create a dev account via the API or workspace file before logging in.
- Production builds only publish the static landing experience; the interactive console and admin tools stay behind a dev-only bundle path to keep the public surface minimal.

## Sample workflow
1. Draft requirement candidates (heuristic + LLM):
   ```bash
   curl -s -X POST http://localhost:8787/draft \
     -H 'Content-Type: application/json' \
     -d '{
           "need": "As a driver I want controlled deceleration when braking",
           "system": "The brake control unit",
           "trigger": "brake pedal force exceeds 50 N",
           "response": "command hydraulic pressure to achieve 6 m/s^2 deceleration",
           "constraint": "within 250 ms",
           "count": 3,
           "useLlm": true
         }'
   ```
2. Evaluate a candidate with `/qa` to gather scores and suggested fixes.
3. Persist the reviewed requirement via `/requirements`:
   ```bash
   curl -s -X POST http://localhost:8787/requirements \
     -H 'Content-Type: application/json' \
     -d '{
           "tenant": "default",
           "projectKey": "braking",
           "title": "Brake response time",
           "text": "When brake pedal force exceeds 50 N, the brake control unit shall command hydraulic pressure to achieve 6 m/s^2 deceleration within 250 ms.",
           "pattern": "event",
           "verification": "Test"
         }'
   ```
4. Call `/baseline` to freeze the current set when preparing for release.

Markdown output lands under `workspace/` so it can be mirrored to Git or other document stores, while Neo4j stores queryable metadata.

## LLM configuration
Set the following environment variables (see `.env.example`) to enable OpenAI-backed drafts:
```
LLM_PROVIDER=openai
LLM_API_KEY=<your-openai-api-key>
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.2
```
Optional: override `LLM_BASE_URL` for Azure/OpenAI-compatible gateways. Requests that set `"useLlm": true` will prepend LLM-generated drafts to the output while always preserving heuristic fallbacks.

## Troubleshooting

Having issues? Check **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** for solutions to common problems:

- **RBAC / 403 Forbidden errors** - Missing author role in dev users
- **Slow dev server startup** - Optional services causing delays
- **TypeScript build failures** - Import errors and module resolution
- **Service connectivity issues** - Port conflicts, Docker networking
- **Complete startup procedures** - How to run all services correctly

## Next steps
- Add additional node types (needs, tests, risks) and relationships inside Neo4j.
- Layer a front-end or CLI on top of the API and graph data.
- Extend `services/llm.ts` with more providers (Anthropic, local inference) and fine-grained prompts.
- Add automated tests (e.g., `node --test`, `vitest`) that cover graph writes and LLM error handling.
