# AIRGen — AI-Powered Requirements Engineering Platform

AIRGen is a full-stack requirements management and systems engineering platform for regulated industries. It combines deterministic QA scoring with AI-powered drafting, maintains complete traceability through a Neo4j graph database, and provides modern tooling (web UI, CLI, Claude MCP server) for teams working on safety-critical systems.

**Available as:**
- **SaaS** — Production service at [airgen.studio](https://airgen.studio) for immediate access
- **Self-hosted** — Deploy on your own infrastructure for full data sovereignty
- **Managed hosting** — Custom enterprise deployments available

## Features

### Requirements Management
- **AI-assisted drafting** — Generate candidate requirements from natural language using heuristic + LLM pipelines
- **Deterministic QA scoring** — ISO/IEC/IEEE 29148 and EARS pattern analysis with 0–100 scoring
- **Background QA worker** — Automatically score all requirements in a project with real-time progress
- **Version history** — Immutable version snapshots with full audit trail (create, update, archive, delete, restore)
- **Inline editing** — Edit fields directly in the table view with double-click activation
- **Archive management** — Archive/unarchive requirements without deletion
- **Advanced filtering** — Filter by tags, document, section, EARS pattern, verification method, QA score range, and text search

### Document Management
- **Structured documents** — Native documents with sections and requirement linking
- **Surrogate documents** — Upload Word, PDF, and other formats with automatic parsing
- **Folder organization** — Hierarchical folder structures
- **Markdown editor** — Live editing with Neo4j as source of truth

### Traceability & Linking
- **Typed trace links** — satisfies, derives, verifies, implements, refines, conflicts
- **Linksets** — Organize related trace links into structured collections
- **AI-powered suggestions** — Graph-based link recommendations
- **Visual tracing** — Navigate and visualize requirement relationships

### Architecture Diagrams
- **Interactive canvas** — ReactFlow-based diagram editor with blocks, ports, and connectors
- **Block library** — Reusable architecture components
- **Floating windows** — Pop out diagrams into draggable, resizable windows
- **Per-diagram viewports** — Independent zoom/pan state per tab
- **Port overrides** — Hide or reposition ports per diagram without mutating definitions
- **Diagram snapshots** — Capture and upload screenshots to the document manager

### AI Visualization (Imagine)
- **Image generation** — Create concept images with AI from text prompts
- **Reimagine** — Iterate on generated images with new prompts
- **Save to documents** — Link generated images as surrogate documents

### Verification Engine
- **Verification activities** — Track test, analysis, inspection, and demonstration activities
- **Evidence management** — Attach evidence and documents to verification records
- **Compliance tracking** — Monitor verification status across requirements

### Baselines
- **Point-in-time snapshots** — Freeze current state for release management
- **Baseline comparison** — Diff between baselines to track changes
- **Full Neo4j preservation** — Baselines link to version nodes, preserved in backups

### Authentication & Security
- **Argon2id password hashing** with automatic legacy migration
- **JWT sessions** — Short-lived access tokens (15 min) + httpOnly refresh tokens (7 days)
- **Two-factor authentication** — TOTP with encrypted secrets and backup codes
- **Email verification & password reset** — Token-based with secure expiry
- **Security middleware** — Helmet, rate limiting, CORS, Zod input validation
- **Observability** — Structured logging, health endpoints, request correlation

### Deployment & Infrastructure
- **Docker-native** — Traefik + Neo4j + PostgreSQL + Redis + Fastify compose stack
- **Multi-tenant** — Full tenant and project isolation
- **Automated backups** — Daily incremental + weekly full with encrypted remote storage
- **Multi-stage builds** — Optimized Docker images with pnpm deploy

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, Fastify 5, TypeScript |
| Frontend | React 18, Vite 5, Tailwind CSS, Radix UI |
| Graph Database | Neo4j 5 (primary data store) |
| Auth Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Diagrams | Cytoscape, ReactFlow, Mermaid |
| AI/LLM | OpenAI-compatible API (configurable provider) |
| Testing | Vitest, Playwright |
| Deployment | Docker Compose, Traefik, nginx |

## Repository Layout

```
airgen/
├── backend/                 # Fastify API server (Neo4j + PostgreSQL)
├── frontend/                # React SPA (Vite + Tailwind)
├── packages/
│   ├── cli/                 # Command-line interface (airgen-cli)
│   ├── mcp-server/          # Claude MCP server (~53 tools)
│   └── req-qa/              # Deterministic QA rules engine
├── docs/                    # Architecture, security, and operations docs
│   ├── guides/              # Setup, deployment, backup, testing guides
│   ├── security/            # Security audits and documentation
│   ├── design/              # Design specs and implementation plans
│   └── archive/             # Historical documentation
├── deploy/                  # Deployment configs
├── scripts/                 # Backup and maintenance scripts
├── examples/                # Sample braking-domain artifacts
├── docker-compose.dev.yml   # Development stack
├── docker-compose.prod.yml  # Production stack (Traefik + TLS)
├── pnpm-workspace.yaml      # Monorepo workspace config
└── .env.example             # Environment variable template
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (for databases)

### Local Development

```bash
# Install dependencies
pnpm install

# Copy and configure environment
cp .env.example .env.local
# Edit .env.local — at minimum set GRAPH_PASSWORD and API_JWT_SECRET

# Start infrastructure (Neo4j, PostgreSQL, Redis)
docker compose -f docker-compose.dev.yml up -d

# Build the QA engine
pnpm -C packages/req-qa build

# Start the backend (hot reload)
pnpm -C backend dev          # API at http://localhost:8787

# Start the frontend (separate terminal)
pnpm -C frontend dev          # UI at http://localhost:5173
```

### Docker Development Stack

```bash
cp env/development.env.example env/development.env
# Edit env/development.env with your values

COMPOSE_PROJECT_NAME=airgen_dev \
docker compose --env-file env/development.env \
  -f docker-compose.dev.yml up -d --build

# API at http://localhost:18787/health
```

### Production Deployment

```bash
# Configure production environment
cp env/production.env.example env/production.env
# Edit with production secrets

# Deploy with Traefik + TLS
docker compose -f docker-compose.prod.yml up -d
```

See [docs/guides/DEPLOYMENT.md](./docs/guides/DEPLOYMENT.md) for the full production deployment guide.

## Environment Configuration

Copy `.env.example` to `.env.local` and configure. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `GRAPH_URL` | Neo4j bolt URL | `bolt://neo4j:7687` |
| `GRAPH_PASSWORD` | Neo4j password | `airgen-graph` |
| `API_JWT_SECRET` | JWT signing secret (required in production) | dev placeholder |
| `LLM_PROVIDER` | LLM provider | `openai` |
| `LLM_API_KEY` | API key for AI features | (optional) |
| `LLM_MODEL` | Model name | `gpt-4o-mini` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `airgen` |
| `CORS_ORIGINS` | Allowed frontend origins | `http://localhost:5173` |

See `.env.example` for the complete list including SMTP, 2FA, rate limiting, imagine, and backup configuration.

### Operational Feature Flags
- `ENABLE_ADMIN_ROUTES=true` — Exposes admin routes (user management, recovery). Defaults to `false`.
- `EMAIL_SYSTEM_BCC` — BCC address for all system emails. Defaults to `info@airgen.studio`.

## Packages

### CLI (`packages/cli`)

Full-featured terminal client for requirements engineering:

```bash
npm install -g airgen-cli

# Examples
airgen requirements list
airgen requirements create --text "The system shall..."
airgen baselines create --name "v1.0"
airgen trace list
airgen report quality
airgen export csv
```

Supports tenants, projects, requirements CRUD, traceability, baselines, quality analysis, verification, import/export, and reports. Configure via `~/.airgenrc` or environment variables.

### MCP Server (`packages/mcp-server`)

Exposes AIRGen as ~53 tools for Claude via the [Model Context Protocol](https://modelcontextprotocol.io/):

```bash
pnpm -C packages/mcp-server dev
```

Tool categories: navigation, requirements, documents, quality, traceability, baselines, architecture, search, AI operations, visualization, bulk operations, filtering, reporting, and import/export.

### QA Rules Engine (`packages/req-qa`)

Zero-dependency deterministic requirements quality analyzer. Scores requirements 0–100 against:
- ISO/IEC/IEEE 29148 compliance rules
- EARS pattern detection (ubiquitous, event, state, unwanted, optional)
- Ambiguity checks, measurability, forbidden modals, length constraints

## Scripts

```bash
pnpm dev                # Start backend in dev mode
pnpm build              # Build req-qa + backend
pnpm test               # Run all tests across packages
pnpm test:backend       # Backend unit tests
pnpm test:frontend      # Frontend unit tests
pnpm test:e2e           # Playwright end-to-end tests
```

## API Overview

All routes served under `/api`. Interactive Swagger docs at `/api/docs` when running.

| Group | Prefix | Purpose |
|-------|--------|---------|
| Auth | `/auth/*`, `/mfa/*` | Login, registration, 2FA, sessions |
| Tenants & Projects | `/tenants`, `/projects` | Multi-tenant workspace management |
| Requirements | `/:tenant/:project/requirements` | CRUD, filtering, search, archive |
| Documents | `/:tenant/:project/documents`, `/sections` | Document and section management |
| Traceability | `/:tenant/:project/trace-links`, `/linksets` | Trace links and linksets |
| Architecture | `/:tenant/:project/architecture/*` | Diagrams, blocks, connectors |
| Baselines | `/:tenant/:project/baselines` | Point-in-time snapshots |
| Verification | `/:tenant/:project/verification/*` | Verification activities and evidence |
| AI | `/draft`, `/qa`, `/airgen/*` | Drafting, QA, AI chat, candidates |
| Imagine | `/:tenant/:project/imagine/*` | AI image generation |
| Health | `/healthz`, `/readyz`, `/health` | Liveness, readiness, diagnostics |

## Backup & Recovery

AIRGen includes automated backup with encrypted remote storage:

- **Daily** (2:00 AM) — Incremental backups, 7-day local retention
- **Weekly** (Sunday 3:00 AM) — Full backups with remote upload, 12-week retention
- **Verification** (2:30 AM) — Automated integrity checks

```bash
# Manual backup
./scripts/backup-weekly.sh

# Restore from backup
./scripts/backup-restore.sh /path/to/backup

# Verify integrity
./scripts/backup-verify.sh /path/to/backup
```

Supports DigitalOcean Spaces, AWS S3, Backblaze B2, and SFTP. See [docs/guides/BACKUP_RESTORE.md](./docs/guides/BACKUP_RESTORE.md) and [docs/guides/REMOTE_BACKUP_SETUP.md](./docs/guides/REMOTE_BACKUP_SETUP.md).

## Documentation

| Document | Location |
|----------|----------|
| Architecture | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |
| Development Guide | [docs/guides/DEVELOPMENT_GUIDE.md](./docs/guides/DEVELOPMENT_GUIDE.md) |
| Deployment | [docs/guides/DEPLOYMENT.md](./docs/guides/DEPLOYMENT.md) |
| Security | [docs/security/SECURITY.md](./docs/security/SECURITY.md) |
| Secrets Management | [docs/guides/SECRETS_MANAGEMENT.md](./docs/guides/SECRETS_MANAGEMENT.md) |
| Backup & Restore | [docs/guides/BACKUP_RESTORE.md](./docs/guides/BACKUP_RESTORE.md) |
| Baseline System | [docs/guides/BASELINE-SYSTEM-GUIDE.md](./docs/guides/BASELINE-SYSTEM-GUIDE.md) |
| Version History | [docs/guides/VERSION-HISTORY-SYSTEM.md](./docs/guides/VERSION-HISTORY-SYSTEM.md) |
| Testing Strategy | [docs/guides/TESTING_STRATEGY.md](./docs/guides/TESTING_STRATEGY.md) |
| E2E Testing | [docs/guides/E2E_TESTING.md](./docs/guides/E2E_TESTING.md) |
| Observability | [docs/guides/OBSERVABILITY.md](./docs/guides/OBSERVABILITY.md) |
| Troubleshooting | [docs/guides/TROUBLESHOOTING.md](./docs/guides/TROUBLESHOOTING.md) |
| Market Analysis | [docs/MARKET_ANALYSIS.md](./docs/MARKET_ANALYSIS.md) |
| System Requirements | [docs/SYSTEM_REQUIREMENTS.md](./docs/SYSTEM_REQUIREMENTS.md) |

## License

Proprietary — Copyright (c) 2025 Why Aye Pet Limited. All rights reserved.

See [LICENSE](LICENSE) for details. For licensing inquiries, contact Why Aye Pet Limited.
