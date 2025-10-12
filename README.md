# AIRGen (VPS Edition)

AIRGen is an AI-assisted requirements generation service tailored for a self-hosted VPS. It blends deterministic QA with templated EARS-style drafts, persists curated requirements as Markdown, stores metadata/relationships in Neo4j, and exposes a Fastify API that can be consumed by any front-end or automation.

## Features

### Requirements Management
- **Draft generation** – Produces 1–5 candidate requirements from a need. Enable `useLlm` to let OpenAI (or future providers) synthesize additional drafts.
- **Deterministic QA** – Scores requirements against ISO/IEC/IEEE 29148 inspired checks.
- **Background QA worker** – Automatically score all requirements in a project using the background QA scorer worker. Monitor progress in real-time from the dashboard.
- **QA metrics dashboard** – View quality score distribution (excellent, good, needs work, unscored) for all requirements in your project.
- **Archive management** – Archive/unarchive requirements to hide them from default views without deletion. Works for individual requirements and groups.
- **Duplicate detection** – Identifies and helps fix duplicate requirements.
- **Inline editing** – Edit requirement fields directly in the table view with double-click activation.
- **Custom attributes** – Extensible attribute system for project-specific metadata (foundation in place for basic attributes).
- **Version history** – Track changes, diff versions, and restore previous states with full audit trail.

### Document Management
- **Document upload** – Support for Word, PDF, and other document formats.
- **Document parsing** – Extracts sections and content from uploaded documents.
- **Folder organization** – Organize documents in hierarchical folder structures.
- **Section management** – Create and manage document sections with requirement linking.
- **Markdown editor** – Edit structured documents in markdown format with live Neo4j data as source of truth.
- **Optimized queries** – Batched Neo4j queries reduce API calls by ~97% for document loading.

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
- **Floating diagram windows** – Pop out diagrams into resizable, draggable floating windows for multi-diagram workflows.
- **Independent viewports** – Each diagram tab maintains its own zoom and pan state for efficient navigation.
- **Per-diagram port layouts** – Hide or reposition ports on a per-diagram basis; hidden ports stay connected while a badge inside the block shows how many are hidden.
- **Repositionable connector labels** – Drag connector labels to stash per-diagram offsets so documentation callouts stay readable without affecting other views.
- **Diagram snapshots** – Capture and upload diagram screenshots directly to the document manager from floating windows.

### AI-Assisted Generation (AIRGen)
- **Conversational AI** – Chat-based interface for requirement generation.
- **Smart candidates** – AI generates requirement candidates from natural language.
- **Accept/Reject workflow** – Review and approve AI-generated requirements.
- **Context-aware** – Maintains project context for better suggestions.

### Data & Persistence
- **Neo4j single source of truth** – All data (requirements, projects, tenants, documents, trace links, baselines, version history) stored in Neo4j graph database.
- **On-demand markdown export** – Export service generates markdown from Neo4j when needed (no persistent markdown files).
- **Complete version history** – Immutable version snapshots for all entities including lifecycle operations (create, update, archive, delete, restore).
- **Baselining** – Point-in-time project snapshots linking to version nodes, fully preserved in Neo4j backups.

### Authentication & Security
- **Production-grade authentication** – Argon2id password hashing with automatic legacy migration from SHA256/scrypt.
- **Session management** – Short-lived JWT access tokens (15 min) + httpOnly refresh tokens (7 days) with automatic rotation.
- **Two-factor authentication (2FA)** – TOTP with encrypted secrets and hashed backup codes. Compatible with Google Authenticator, Authy, 1Password, and other RFC 6238 apps.
- **Email verification** – Token-based email verification with secure token generation and expiry.
- **Password reset** – Secure token-based password reset with automatic session revocation.
- **Security middleware** – Helmet (CSP, HSTS), rate limiting (global + auth-specific), CORS allowlisting, Zod input validation.
- **Observability** – Structured auth event logging, health endpoints (/healthz, /readyz, /health), request correlation with X-Request-ID headers.
- **Environment separation** – Development, staging, production configurations with fail-fast validation for production secrets.

### Deployment & Infrastructure
- **Docker-native** – Traefik + Neo4j + Fastify API + Redis compose stack for quick VPS deployment.
- **Multi-tenant** – Full tenant and project isolation with RBAC.
- **Automated backups** – Daily incremental and weekly full backups with encrypted remote storage, 12-week retention, and one-command restore.
- **Optimized container builds** – Multi-stage backend Dockerfile leverages pnpm deploy and requires Docker BuildKit with the `docker-buildx` plugin (already installed in production). Run builds with `DOCKER_BUILDKIT=1 docker build ...` or enable BuildKit daemon-wide for best caching.

### Operational feature flags
- `ENABLE_ADMIN_ROUTES=true` – Opt-in switch that exposes admin routes (user management, requirements recovery) even in production. Defaults to `false` to keep the public surface minimal.
- `EMAIL_SYSTEM_BCC` – Defaults to `info@airgen.studio`; every system email (verification, reset, password changed) BCCs this address for auditing. Override or clear the value if you need a different compliance inbox.

## Repository layout
```
airgen/
├─ backend/                  # Fastify API service
├─ packages/
│  └─ req-qa/                # Deterministic QA rules engine
├─ docs/                     # Architecture and ops guidance
├─ scripts/                  # Automated backup and maintenance scripts
├─ examples/                 # Sample braking-domain artifacts
├─ workspace/                # Deprecated (legacy workspace, use export service instead)
├─ docker-compose.dev.yml
├─ docker-compose.prod.yml
├─ pnpm-workspace.yaml
├─ package.json
└─ README.md
```

See `docs/ARCHITECTURE.md` for a detailed component and deployment walkthrough.

## Documentation map

### Core Documentation
- **[Design Description Document](./DESIGN_DESCRIPTION.md)** – Comprehensive system design, architecture, and technical specifications.
- [Development guide](./DEVELOPMENT_GUIDE.md) – Local setup, contributor workflow, and day-to-day tasks.
- [Architecture](./docs/ARCHITECTURE.md) – Core services, data flow, and deployment topology.

### Neo4j Single-Source Architecture
- **[Neo4j Migration Complete](./docs/NEO4J-MIGRATION-COMPLETE.md)** – Complete migration summary, all 4 phases, lifecycle version tracking.
- **[Version History System](./docs/VERSION-HISTORY-SYSTEM.md)** – Complete audit trail, lifecycle tracking, compliance features.
- **[Baseline System Guide](./docs/BASELINE-SYSTEM-GUIDE.md)** – Point-in-time snapshots, baseline comparison, release management.
- [Export System Design](./docs/EXPORT-SYSTEM-DESIGN.md) – On-demand markdown generation from Neo4j.

### Authentication & Security
- **[Security Documentation](./docs/SECURITY.md)** – Complete security foundation guide: authentication, 2FA, sessions, security headers, observability.
- **[Security Test Checklist](./docs/SECURITY-TEST-CHECKLIST.md)** – Manual testing checklist for all security features.

### Backup & Operations
- **[Backup & Restore](./docs/BACKUP_RESTORE.md)** – Complete backup strategy, recovery procedures, and disaster recovery guide.
- **[Remote Backup Setup](./docs/REMOTE_BACKUP_SETUP.md)** – Step-by-step guide for configuring encrypted remote backup storage.
- [Observability](./OBSERVABILITY.md) – Metrics, health checks, and optional Sentry wiring.
- [Troubleshooting](./TROUBLESHOOTING.md) – Quick fixes for the most common developer issues.

### Testing & Quality
- [Testing overview](./TEST_SUMMARY.md) – Current automated coverage and outstanding gaps.
- [Test infrastructure](./TEST_INFRASTRUCTURE.md) – How integration and E2E test harnesses are wired.
- [E2E testing](./E2E_TESTING.md) – End-to-end testing with Playwright.

### Features & Enhancements
- [Custom Attributes Implementation](./CUSTOM_ATTRIBUTES_IMPLEMENTATION.md) – Guide for implementing extensible custom attributes on requirements.
- [Neo4j Improvements](./NEO4J_IMPROVEMENTS_SUMMARY.md) – Performance optimizations and security enhancements.

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
- **Shared diagram canvas** – Both Architecture and Interface workspaces reuse a common `DiagramCanvas` and `useDiagramCanvasInteractions`. Each workspace supplies its own block presets, connector mapping, and palette metadata, while the shared canvas now drives ReactFlow rendering, selection state, context menus, debounced persistence, per-diagram port overrides, connector label offsets, and mini-map/query overlays.
- **Composable workspaces** – Route-level workspace components now just coordinate tenant/project context, floating document windows, palettes, and inspectors around the shared canvas, keeping each route lightweight.
- **Floating windows system** – Documents and diagrams can be opened in floating windows via `FloatingDocumentsContext`. Windows are draggable, resizable, and support multiple simultaneous views for enhanced productivity.
- **Toast notifications** – Non-blocking notifications using Sonner library for success, error, and loading states, replacing browser dialogs.
- **Modal dialogs** – Radix UI Dialog components provide accessible, keyboard-friendly input dialogs for creating and renaming resources.

## Key API endpoints

### Authentication & Security
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| POST   | `/auth/login`                             | Login with email/password (returns JWT or MFA_REQUIRED) |
| POST   | `/auth/mfa-verify`                        | Verify 2FA code to complete login |
| POST   | `/auth/refresh`                           | Refresh access token using httpOnly cookie |
| POST   | `/auth/logout`                            | Logout current session |
| POST   | `/auth/logout-all`                        | Revoke all sessions for current user |
| GET    | `/auth/me`                                | Get current user info |
| POST   | `/auth/request-verification`              | Request email verification |
| POST   | `/auth/verify-email`                      | Verify email with token |
| POST   | `/auth/request-password-reset`            | Request password reset |
| POST   | `/auth/reset-password`                    | Reset password with token |
| POST   | `/mfa/totp/start`                         | Start 2FA setup (generate QR code) |
| POST   | `/mfa/totp/verify`                        | Verify TOTP code and enable 2FA |
| POST   | `/mfa/disable`                            | Disable 2FA (revokes all sessions) |
| GET    | `/mfa/status`                             | Get 2FA status and backup codes remaining |

### Core & System
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| GET    | `/healthz`                                | Liveness probe (Kubernetes-compatible) |
| GET    | `/readyz`                                 | Readiness probe (checks database connectivity) |
| GET    | `/health`                                 | Comprehensive health and environment details |
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

### Background Workers
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| POST   | `/workers/qa-scorer/start`                | Start background QA scoring for all requirements |
| POST   | `/workers/qa-scorer/stop`                 | Stop the QA scoring worker |
| GET    | `/workers/qa-scorer/status`               | Get worker status (running, progress, errors) |

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
| GET    | `/sections/:tenant/:project/:docSlug/full`| List sections with all relations (optimized) |

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
| PATCH  | `/architecture/blocks/:tenant/:project/:blockId` | Update block placement, styling, and per-diagram port overrides |
| PATCH  | `/architecture/connectors/:tenant/:project/:connectorId` | Update connector styling, documents, and label offsets |

`portOverrides` accepts a map of `{ [portId]: { edge?, offset?, hidden?, showLabel?, labelOffsetX?, labelOffsetY? } }` so individual diagrams can customise how a reused block exposes its ports without mutating the definition. Connector PATCH requests persist label offset drags per diagram alongside styling metadata.

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

### UI Features
- **Floating windows** – Open documents and diagrams in draggable, resizable floating windows. Right-click on document links or use the "Pop-out" action in diagrams to create floating views.
- **Diagram snapshots** – Capture high-resolution PNG snapshots of diagrams from floating windows. Click the camera icon in the floating diagram controls to automatically upload snapshots to the document manager.
- **Toast notifications** – Non-blocking success, error, and loading notifications appear in the top-right corner, providing feedback without interrupting workflow.
- **Modal dialogs** – Creating and renaming resources uses accessible modal dialogs with keyboard support (Enter to submit, Escape to cancel).
- **Per-diagram viewports** – Each diagram tab remembers its own zoom level and pan position, allowing quick navigation between different views.
- **Hidden port indicator** – When ports are hidden on a diagram, the parent block shows a counter badge so reviewers know connections still exist even if individual handles are suppressed.

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

All data is stored in Neo4j. Use the export service (`GET /export/:tenant/:project/markdown`) to generate markdown on demand for external documentation tools.

## LLM configuration
Set the following environment variables (see `.env.example`) to enable OpenAI-backed drafts:
```
LLM_PROVIDER=openai
LLM_API_KEY=<your-openai-api-key>
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.2
```
Optional: override `LLM_BASE_URL` for Azure/OpenAI-compatible gateways. Requests that set `"useLlm": true` will prepend LLM-generated drafts to the output while always preserving heuristic fallbacks.

## Backup & Recovery

AIRGen includes a comprehensive automated backup system to protect your critical data:

### Automated Backup Schedule
- **Daily backups** (2:00 AM) - Incremental backups with 7-day local retention
- **Weekly backups** (Sunday 3:00 AM) - Full backups with remote upload, 12-week retention
- **Automated verification** (2:30 AM) - Integrity checks and health monitoring

### What's Backed Up
- **Neo4j graph database** (PRIMARY - contains all data: requirements, documents, sections, version history, baselines, trace links, architecture diagrams)
- **Docker volumes** (secondary - application state and cache)
- **Workspace** (deprecated - legacy markdown files, no longer required)

### Quick Commands
```bash
# Manual backup
/root/airgen/scripts/backup-weekly.sh

# Restore from backup (with safety checks)
/root/airgen/scripts/backup-restore.sh /path/to/backup

# Verify backup integrity
/root/airgen/scripts/backup-verify.sh /path/to/backup

# Check remote backups
restic snapshots
```

### Remote Storage
Backups are encrypted and uploaded to remote storage (DigitalOcean Spaces, AWS S3, Backblaze B2, or SFTP) for disaster recovery. See **[Remote Backup Setup Guide](./docs/REMOTE_BACKUP_SETUP.md)** for configuration.

### Complete Documentation
- **[Backup & Restore Guide](./docs/BACKUP_RESTORE.md)** - Detailed recovery procedures, monitoring, and troubleshooting
- **[Remote Backup Setup](./docs/REMOTE_BACKUP_SETUP.md)** - Step-by-step remote storage configuration

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
