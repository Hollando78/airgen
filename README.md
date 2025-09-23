# AIRGen (VPS Edition)

AIRGen is an AI-assisted requirements generation service tailored for a self-hosted VPS. It blends deterministic QA with templated EARS-style drafts, persists curated requirements as Markdown, stores metadata/relationships in Neo4j, and exposes a Fastify API that can be consumed by any front-end or automation.

## Features
- **Draft generation** – `/draft` produces 1–5 candidate requirements from a need. Enable `useLlm` to let OpenAI (or future providers) synthesize additional drafts.
- **Deterministic QA** – `/qa` scores requirements against ISO/IEC/IEEE 29148 inspired checks.
- **Graph metadata** – requirements, projects, tenants, and baselines live in Neo4j for traceability queries.
- **Markdown-first storage** – `/requirements` writes approved text to `workspace/<tenant>/<project>/requirements/*.md` with YAML front matter.
- **Baselining** – `/baseline` snapshots the current requirement set for release audits.
- **Trace suggestions** – `/link/suggest` proposes related requirements using graph queries.
- **Docker-native** – Traefik + Neo4j + Fastify API + Redis (Postgres optional) compose stack for quick VPS deployment.

## Repository layout
```
airgen/
├─ backend/                  # Fastify API service
├─ packages/
│  └─ req-qa/                # Deterministic QA rules engine
├─ docs/                     # Architecture and ops guidance
├─ examples/                 # Sample braking-domain artifacts
├─ workspace/                # Runtime Markdown workspace (gitignored)
├─ docker-compose.yml
├─ pnpm-workspace.yaml
├─ package.json
└─ README.md
```

See `docs/ARCHITECTURE.md` for a detailed component and deployment walkthrough.

## Getting started (Docker)
```bash
cp .env.example .env               # Configure secrets and ports
# Populate GRAPH_*/LLM_* values if using Neo4j auth and OpenAI
npm install -g corepack            # Optional if corepack isn’t already enabled
corepack enable
pnpm install                       # Installs workspace dependencies (once)
pnpm approve-builds                # Allow esbuild if prompted

# Launch full stack
docker compose up -d --build
# API reachable at http://<host>/api/health via Traefik
```

## Getting started (local dev without Docker)
```bash
# Requires Node.js 20+ and pnpm
pnpm install
pnpm -C packages/req-qa build
pnpm -C backend dev                # Fastify API at http://localhost:8787
```

## Key API endpoints
| Method | Path                                      | Purpose |
| ------ | ----------------------------------------- | ------- |
| GET    | `/health`                                 | Health and environment details |
| POST   | `/draft`                                  | Generate candidate requirements (heuristic + optional LLM) |
| POST   | `/qa`                                     | Run deterministic QA |
| POST   | `/apply-fix`                              | Suggest edits for ambiguous phrases |
| POST   | `/requirements`                           | Persist a requirement (Markdown + Neo4j metadata) |
| GET    | `/requirements/:tenant/:project`          | List stored requirements |
| GET    | `/requirements/:tenant/:project/:ref`     | Fetch requirement metadata + Markdown |
| POST   | `/baseline`                               | Create a baseline snapshot |
| POST   | `/link/suggest`                           | Lightweight trace suggestions |

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

## Next steps
- Add additional node types (needs, tests, risks) and relationships inside Neo4j.
- Layer a front-end or CLI on top of the API and graph data.
- Extend `services/llm.ts` with more providers (Anthropic, local inference) and fine-grained prompts.
- Add automated tests (e.g., `node --test`, `vitest`) that cover graph writes and LLM error handling.
