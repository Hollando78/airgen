# AIRGen Development Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Project Structure](#project-structure)
4. [Common Tasks](#common-tasks)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Code Style](#code-style)
8. [Contributing](#contributing)

## Getting Started

### Prerequisites
- Node.js 20+ (check with `node --version`)
- pnpm 9+ (install with `corepack enable`)
- Docker & Docker Compose (for Neo4j/Redis)
- Git

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd airgen
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment files**
   ```bash
   # Backend
   cp backend/.env.development.example backend/.env.development

   # Frontend
   cp frontend/.env.development.example frontend/.env.development
   ```

4. **Start Neo4j** (required for backend)
   ```bash
   docker run -d \
     --name neo4j-dev \
     -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/password123 \
     neo4j:latest
   ```

5. **Create database indexes** (first time only)
   ```typescript
   // In a temporary script or dev tool
   import { createDatabaseIndexes } from "./backend/src/services/graph/schema.js";
   await createDatabaseIndexes();
   ```

### Running Development Servers

**Backend only**:
```bash
pnpm -C backend dev
# Runs on http://localhost:8787
```

**Frontend only**:
```bash
pnpm -C frontend dev
# Runs on http://localhost:5173
# Proxies /api requests to backend
```

**Both concurrently**:
```bash
# Terminal 1
pnpm -C backend dev

# Terminal 2
pnpm -C frontend dev
```

## Development Environment

### Recommended VS Code Extensions
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **TypeScript** - Language support
- **Prisma** - For Neo4j schema editing
- **REST Client** - Testing API endpoints
- **GitLens** - Git integration

### Environment Variables

#### Backend (`backend/.env.development`)
```bash
# Server
API_ENV=development
API_PORT=8787
API_HOST=0.0.0.0
API_JWT_SECRET=dev_secret

# Database
GRAPH_URL=bolt://localhost:7687
GRAPH_USERNAME=neo4j
GRAPH_PASSWORD=password123
GRAPH_DATABASE=neo4j
GRAPH_ENCRYPTED=false

# LLM (optional)
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.2

# Workspace
WORKSPACE_ROOT=./workspace
```

#### Frontend (`frontend/.env.development`)
```bash
# API Proxy
API_PROXY_TARGET=http://localhost:8787

# Build-time vars (for production builds)
VITE_API_BASE_URL=http://localhost:8787
```

## Project Structure

```
airgen/
├── backend/                    # Fastify API server
│   ├── src/
│   │   ├── routes/            # HTTP route handlers
│   │   ├── services/          # Business logic
│   │   │   └── graph/         # Neo4j operations
│   │   ├── lib/               # Shared utilities
│   │   ├── plugins/           # Fastify plugins
│   │   ├── __tests__/         # Test files
│   │   ├── config.ts          # Configuration
│   │   ├── env.ts             # Environment validation
│   │   └── server.ts          # Entry point
│   ├── workspace/             # Runtime requirement files
│   ├── docs/                  # Backend documentation
│   └── package.json
├── frontend/                   # React + Vite app
│   ├── src/
│   │   ├── routes/            # Page components
│   │   ├── components/        # Reusable components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── lib/               # Client utilities
│   │   ├── contexts/          # React contexts
│   │   └── types.ts           # TypeScript types
│   └── package.json
├── packages/
│   └── req-qa/                # Requirements QA engine
└── docs/                      # Project documentation
```

### Key Files

- **backend/src/server.ts** - Fastify setup, middleware, routes
- **backend/src/config.ts** - Configuration management
- **backend/src/services/graph/schema.ts** - Database schema & indexes
- **frontend/src/lib/client.ts** - API client
- **frontend/src/types.ts** - Shared TypeScript types

## Common Tasks

### Adding a New API Endpoint

1. **Create or update route file**
   ```typescript
   // backend/src/routes/my-feature.ts
   import { FastifyInstance } from "fastify";
   import { z } from "zod";

   export default async function myFeatureRoutes(app: FastifyInstance) {
     app.get("/my-feature", {
       schema: {
         tags: ["my-feature"],
         summary: "Description",
         response: {
           200: {
             type: "object",
             properties: {
               data: { type: "string" }
             }
           }
         }
       }
     }, async (req, reply) => {
       return { data: "Hello" };
     });
   }
   ```

2. **Register route in server.ts**
   ```typescript
   import myFeatureRoutes from "./routes/my-feature.js";
   // ...
   await app.register(myFeatureRoutes, { prefix: "/api" });
   ```

3. **Add TypeScript types** (if needed)
   ```typescript
   // frontend/src/types.ts
   export type MyFeatureResponse = {
     data: string;
   };
   ```

4. **Update API client** (if needed)
   ```typescript
   // frontend/src/lib/client.ts
   async getMyFeature(): Promise<MyFeatureResponse> {
     return this.fetch("/my-feature");
   }
   ```

### Adding a New Database Node Type

1. **Update schema documentation**
   ```markdown
   // backend/docs/NEO4J_SCHEMA.md
   ### MyNode
   ```cypher
   (:MyNode {
     id: String!,
     name: String!,
     createdAt: DateTime!
   })
   ```
   ```

2. **Create Cypher queries**
   ```typescript
   // backend/src/services/graph/my-nodes.ts
   import { getSession } from "./driver.js";

   export async function createMyNode(data: { name: string }) {
     const session = getSession();
     try {
       const result = await session.run(`
         CREATE (n:MyNode {
           id: randomUUID(),
           name: $name,
           createdAt: datetime()
         })
         RETURN n
       `, { name: data.name });

       return result.records[0].get("n").properties;
     } finally {
       await session.close();
     }
   }
   ```

3. **Add indexes**
   ```typescript
   // backend/src/services/graph/schema.ts
   await session.run(`
     CREATE INDEX my_node_id IF NOT EXISTS
     FOR (n:MyNode) ON (n.id)
   `);
   ```

### Adding Tests

1. **Create test file**
   ```typescript
   // backend/src/__tests__/my-feature.test.ts
   import { describe, it, expect } from "vitest";

   describe("My Feature", () => {
     it("should work correctly", () => {
       expect(true).toBe(true);
     });
   });
   ```

2. **Run tests**
   ```bash
   pnpm -C backend test
   ```

## Testing

### Running Tests

```bash
# Backend tests
pnpm -C backend test

# Frontend tests (if configured)
pnpm -C frontend test

# Watch mode
pnpm -C backend test --watch

# Coverage
pnpm -C backend test --coverage
```

### Writing Tests

**Unit Test Example**:
```typescript
import { describe, it, expect } from "vitest";
import { calculatePagination } from "../lib/pagination.js";

describe("Pagination", () => {
  it("calculates correct page metadata", () => {
    const result = calculatePagination(100, 2, 20);

    expect(result.currentPage).toBe(2);
    expect(result.totalPages).toBe(5);
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPrevPage).toBe(true);
  });
});
```

**Integration Test Example**:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSession } from "../services/graph/driver.js";

describe("Requirements API", () => {
  let session;

  beforeEach(() => {
    session = getSession();
  });

  afterEach(async () => {
    await session.close();
  });

  it("creates requirement successfully", async () => {
    const result = await session.run(`
      CREATE (r:Requirement {id: randomUUID(), text: "Test"})
      RETURN r
    `);

    expect(result.records).toHaveLength(1);
  });
});
```

## Debugging

### Backend Debugging

**VS Code Launch Configuration** (`.vscode/launch.json`):
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["-C", "backend", "dev"],
      "skipFiles": ["<node_internals>/**"],
      "console": "integratedTerminal"
    }
  ]
}
```

**Console Debugging**:
```typescript
app.log.info({ data: myData }, "Debug message");
app.log.error({ err: error }, "Error occurred");
```

### Frontend Debugging

Use React DevTools browser extension for component inspection.

**Console logging**:
```typescript
console.log("Debug:", data);
```

**Network inspection**: Use browser DevTools Network tab

### Database Debugging

**Neo4j Browser**: http://localhost:7474
```cypher
// View all requirements
MATCH (r:Requirement) RETURN r LIMIT 25;

// Check indexes
SHOW INDEXES;

// Explain query plan
EXPLAIN MATCH (r:Requirement {tenant: "test"}) RETURN r;
```

## Code Style

### TypeScript

- **Use strict mode**: All code should pass `strict: true`
- **Prefer interfaces** over types for object shapes
- **Use Zod** for runtime validation
- **Export types** separately from values

### Naming Conventions

- **Files**: kebab-case (`my-service.ts`)
- **Components**: PascalCase (`MyComponent.tsx`)
- **Functions**: camelCase (`getUserData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`UserData`, `ApiResponse`)

### Imports

```typescript
// External libraries
import { FastifyInstance } from "fastify";
import { z } from "zod";

// Internal modules - use .js extension
import { config } from "./config.js";
import { getSession } from "./services/graph/driver.js";
```

### Error Handling

```typescript
// Use try-catch for operations that can fail
try {
  await riskyOperation();
} catch (error) {
  app.log.error({ err: error }, "Operation failed");
  return reply.status(500).send({
    error: "Internal Server Error",
    message: error instanceof Error ? error.message : "Unknown error"
  });
}
```

## Contributing

### Git Workflow

1. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes** and commit
   ```bash
   git add .
   git commit -m "feat: add my feature"
   ```

3. **Push and create PR**
   ```bash
   git push -u origin feature/my-feature
   ```

### Commit Message Format

Follow Conventional Commits:
```
feat: add user authentication
fix: resolve pagination bug
docs: update API documentation
test: add tests for requirements service
refactor: extract business logic to service layer
```

### Before Submitting PR

- [ ] All tests pass (`pnpm test`)
- [ ] Code builds without errors (`pnpm build`)
- [ ] Added tests for new features
- [ ] Updated documentation
- [ ] Followed code style guidelines

## Useful Commands

```bash
# Install all dependencies
pnpm install

# Build backend
pnpm -C backend build

# Build frontend
pnpm -C frontend build

# Run type checking
pnpm -C backend tsc --noEmit
pnpm -C frontend tsc --noEmit

# Clean node_modules
pnpm -C backend clean
pnpm -C frontend clean

# Update dependencies
pnpm update

# Check for outdated packages
pnpm outdated
```

## Troubleshooting

### Neo4j Connection Errors
```
Error: Failed to connect to server
```
**Solution**: Ensure Neo4j is running and credentials match `.env` file

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::8787
```
**Solution**: Kill process using the port
```bash
lsof -ti:8787 | xargs kill -9
```

### Module Not Found
```
Error: Cannot find module './some-file.js'
```
**Solution**: Check import has `.js` extension (required for ESM)

### Type Errors
```
error TS2304: Cannot find name 'MyType'
```
**Solution**: Import type from `types.ts` or define it

## Resources

- [Fastify Documentation](https://www.fastify.io/)
- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/)
- [React Documentation](https://react.dev/)
- [Zod Documentation](https://zod.dev/)
- [Vite Documentation](https://vitejs.dev/)

## Getting Help

- Check existing issues on GitHub
- Review API documentation at `/api/docs`
- Check Neo4j schema docs in `backend/docs/NEO4J_SCHEMA.md`
- Ask in team chat or create new issue
