# AIRGen Development Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Project Structure](#project-structure)
4. [Common Tasks](#common-tasks)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Backup & Recovery](#backup--recovery)
8. [Code Style](#code-style)
9. [Contributing](#contributing)

## Quick Start

1. Install the prerequisites below, then enable pnpm via `corepack enable` (if not already available).
2. Install workspace dependencies once with `pnpm install`.
3. Approve esbuild binaries if prompted by running `pnpm approve-builds`.
4. Copy the environment templates under `env/`, `backend/`, and `frontend/`, then fill in secrets.
5. Start backing services with Docker Compose (`docker compose --env-file env/development.env -f docker-compose.dev.yml up neo4j redis -d`).
6. Launch `pnpm -C backend dev` and `pnpm -C frontend dev` in separate terminals.
7. Run the Neo4j index helper the first time you stand up the stack (Initial Setup — step 5).

## Getting Started

### Prerequisites
- Node.js 20+ (check with `node --version`)
- pnpm 9+ (enable with `corepack enable` or install globally)
- Docker & Docker Compose (for Neo4j/Redis)
- Docker BuildKit with the `docker-buildx` CLI plugin installed (verify with `docker buildx version`). Enable BuildKit globally by adding `{"features":{"buildkit":true}}` to `/etc/docker/daemon.json` or export `DOCKER_BUILDKIT=1` when building images.
- Git

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd airgen
   ```

2. **Install pnpm dependencies & approve native builds**
   ```bash
   corepack enable pnpm            # Skip if pnpm already available
   pnpm install
   pnpm approve-builds             # Required for packages that rely on esbuild
   ```

3. **Set up environment files**
   ```bash
   # Shared docker-compose stack
   cp env/development.env.example env/development.env

   # Backend
   cp backend/.env.development.example backend/.env.development

   # Frontend
   cp frontend/.env.development.example frontend/.env.development
   ```

4. **Start Neo4j & Redis** (required for backend flows)
   Choose the option that best matches your workflow:

   - **Docker Compose (recommended)** – uses the same Stack defined in `docker-compose.dev.yml`.
     ```bash
     docker compose --env-file env/development.env \
       -f docker-compose.dev.yml up neo4j redis -d
     ```

   - **Standalone containers** – if you only need the services temporarily.
     ```bash
     docker run -d \
       --name neo4j-dev \
       -p 7474:7474 -p 7687:7687 \
       -e NEO4J_AUTH=neo4j/password123 \
       neo4j:latest

     docker run -d \
       --name redis-dev \
       -p 6379:6379 \
       redis:7-alpine
     ```

5. **Create database indexes** (first run only)
   ```bash
   pnpm -C backend tsx <<'TS'
   import { createDatabaseIndexes } from "./src/services/graph/schema.ts";

   await createDatabaseIndexes();
   TS
   ```

6. **Start development servers** once backing services are healthy (see commands below).

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
- **Neo4j** - Querying and visualising the graph schema
- **REST Client** - Testing API endpoints
- **GitLens** - Git integration
- **React Developer Tools** - Browser extension for debugging React components

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
- **frontend/src/contexts/FloatingDocumentsContext.tsx** - Floating windows state management
- **frontend/src/components/FloatingDiagramWindow.tsx** - Floating diagram viewer with snapshot
- **frontend/src/components/diagram/DiagramCanvas.tsx** - Shared diagram rendering component

## Common Tasks

### Working with Floating Windows

Floating windows allow users to view multiple documents or diagrams simultaneously. The system uses `FloatingDocumentsContext` to manage window state.

**Opening a floating document**:
```typescript
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";

const { openFloatingDocument } = useFloatingDocuments();

// Open a structured document
openFloatingDocument({
  documentSlug: "REQ-001",
  documentName: "Braking Requirement",
  tenant: "default",
  project: "braking",
  kind: "structured",
  downloadUrl: "/api/documents/download/default/braking/REQ-001",
  mimeType: "text/markdown"
});

// Open a diagram
openFloatingDocument({
  documentSlug: diagramId,
  documentName: "System Architecture",
  tenant: "default",
  project: "braking",
  kind: "diagram",
  diagramNodes: nodes,
  diagramEdges: edges,
  diagramViewport: { x: 0, y: 0, zoom: 1 }
});
```

**Diagram snapshot functionality**:
The `FloatingDiagramWindow` component includes a snapshot button that:
1. Captures the diagram as a high-resolution PNG using `html-to-image`
2. Converts the image to a File object
3. Uploads it as a surrogate document via the API
4. Shows toast notifications for progress and completion

```typescript
import { toPng } from "html-to-image";
import { toast } from "sonner";

const handleSnapshot = async () => {
  const toastId = toast.loading("Capturing diagram snapshot...");

  try {
    const dataUrl = await toPng(diagramRef.current, {
      backgroundColor: "#ffffff",
      pixelRatio: 2
    });

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const file = new File([blob], `${diagramName}.png`, { type: "image/png" });

    await api.uploadSurrogateDocument({
      tenant,
      projectKey: project,
      file,
      name: `${diagramName} Snapshot`
    });

    toast.success("Diagram snapshot uploaded successfully!", { id: toastId });
  } catch (error) {
    toast.error("Failed to upload snapshot.", { id: toastId });
  }
};
```

### Using Toast Notifications

Replace browser `alert()` and `confirm()` with toast notifications for a better user experience.

```typescript
import { toast } from "sonner";

// Success notification
toast.success("Requirement created successfully!");

// Error notification
toast.error("Failed to save changes. Please try again.");

// Loading notification with update
const toastId = toast.loading("Processing...");
try {
  await someAsyncOperation();
  toast.success("Operation completed!", { id: toastId });
} catch (error) {
  toast.error("Operation failed!", { id: toastId });
}

// Info notification
toast.info("This feature is coming soon.");
```

The Toaster component is configured in `App.tsx` and appears in the top-right corner.

### Using Modal Dialogs

Use Radix UI Dialog components for input dialogs instead of `window.prompt()`.

```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const [showDialog, setShowDialog] = useState(false);
const [inputValue, setInputValue] = useState("");

const handleConfirm = async () => {
  if (!inputValue.trim()) {
    toast.error("Input cannot be empty");
    return;
  }

  try {
    await performAction(inputValue.trim());
    setShowDialog(false);
    setInputValue("");
    toast.success("Action completed successfully");
  } catch (error) {
    toast.error((error as Error).message);
  }
};

// JSX
<Dialog open={showDialog} onOpenChange={setShowDialog}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Enter Name</DialogTitle>
      <DialogDescription>Please provide a name for this item.</DialogDescription>
    </DialogHeader>
    <div className="py-4">
      <input
        type="text"
        className="w-full px-3 py-2 border rounded-md"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
        autoFocus
      />
    </div>
    <DialogFooter>
      <button className="ghost-button" onClick={() => setShowDialog(false)}>
        Cancel
      </button>
      <button className="primary-button" onClick={handleConfirm}>
        Confirm
      </button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Managing Diagram Viewports

Each diagram tab can maintain independent viewport state (zoom and pan position).

```typescript
const [diagramViewports, setDiagramViewports] = useState<
  Record<string, { x: number; y: number; zoom: number }>
>({});

const viewportTimeoutRef = useRef<NodeJS.Timeout>();

const handleViewportChange = useCallback((viewport: { x: number; y: number; zoom: number }) => {
  if (!activeDiagramId) return;

  // Debounce to avoid excessive updates
  if (viewportTimeoutRef.current) {
    clearTimeout(viewportTimeoutRef.current);
  }

  viewportTimeoutRef.current = setTimeout(() => {
    setDiagramViewports(prev => ({
      ...prev,
      [activeDiagramId]: viewport
    }));
  }, 100);
}, [activeDiagramId]);

const currentViewport = activeDiagramId ? diagramViewports[activeDiagramId] : undefined;

// Pass to DiagramCanvas
<DiagramCanvas
  viewport={currentViewport}
  onViewportChange={handleViewportChange}
  // ... other props
/>
```

In the DiagramCanvas component, use the viewport prop:

```typescript
<ReactFlow
  key={activeDiagramId}  // Force re-mount on diagram change
  defaultViewport={viewport}
  fitView={!viewport}  // Only auto-fit if no saved viewport
  onMove={onViewportChange ? (_, newViewport) => onViewportChange(newViewport) : undefined}
  // ... other props
/>
```

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
# Backend tests - all
pnpm -C backend test

# Backend tests - specific file (e.g., markdown roundtrip integrity)
pnpm -C backend test markdown-roundtrip.test.ts

# Frontend tests (if configured)
pnpm -C frontend test

# Watch mode
pnpm -C backend test --watch

# Coverage
pnpm -C backend test --coverage
```

### Test Categories

**Data Integrity Tests** (`backend/src/__tests__/markdown-roundtrip.test.ts`)
- Validates markdown serialization/parsing roundtrip
- Ensures no data loss in dual storage model (markdown + Neo4j)
- Tests YAML frontmatter parsing edge cases
- Verifies hash stability for drift detection

**API Tests** (`backend/src/routes/__tests__/*.test.ts`)
- Authentication and authorization
- Requirements CRUD operations
- AIRGen chat and candidate management

**Component Tests** (`frontend/src/__tests__/**/*.test.tsx`)
- React component rendering
- User interaction flows
- State management hooks

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

**Data Integrity Test Example** (Markdown Roundtrip):
```typescript
import { describe, it, expect } from "vitest";
import { requirementMarkdown, type RequirementRecord } from "../services/workspace.js";

describe("markdown roundtrip integrity", () => {
  it("should preserve all fields through write → parse cycle", () => {
    const original: RequirementRecord = {
      id: "tenant:project:REQ-001",
      ref: "REQ-001",
      title: "System shall respond within 100ms",
      text: "The system shall respond to user input within 100ms.",
      pattern: "ubiquitous",
      verification: "Test",
      tags: ["performance"],
      // ... other fields
    };

    const markdown = requirementMarkdown(original);
    const parsed = parseRequirementMarkdown(markdown);

    expect(parsed.text).toBe(original.text);
    expect(parsed.pattern).toBe(original.pattern);
    // Ensures no data loss in dual storage model
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

## Backup & Recovery

AIRGen includes a comprehensive automated backup system to protect development and production data.

### Backup System Overview

The backup system provides three layers of protection:
1. **Daily incremental backups** (2 AM) - Fast, efficient backups with 7-day retention
2. **Weekly full backups** (Sunday 3 AM) - Complete snapshots with remote upload, 12-week retention
3. **Real-time git tracking** - Workspace files tracked in git for immediate recovery

### Backup Scripts

All backup scripts are located in `/root/airgen/scripts/`:

- **backup-lib.sh** - Shared functions and utilities
- **backup-daily.sh** - Daily automated backup
- **backup-weekly.sh** - Weekly backup with remote upload
- **backup-verify.sh** - Integrity verification
- **backup-restore.sh** - Automated restore with safety checks
- **setup-remote-backup.sh** - Interactive remote storage setup

### Running Backups Manually

```bash
# Run daily backup
/root/airgen/scripts/backup-daily.sh

# Run weekly backup (includes remote upload if configured)
/root/airgen/scripts/backup-weekly.sh

# Verify backup integrity
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/daily/latest

# Check remote backups
restic snapshots
```

### Restoring from Backup

The restore script includes safety checks and supports dry-run mode:

```bash
# Dry-run (shows what would be restored without making changes)
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/latest --dry-run

# Full restore (includes 10-second warning)
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/latest

# Restore specific component only
/root/airgen/scripts/backup-restore.sh /path/to/backup --component neo4j
# Options: neo4j, postgres, workspace, config, all
```

### Recovery Scenarios

**Accidental deletion (< 24 hours ago)**:
```bash
# Restore from last night's backup
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/latest
# Recovery time: ~5 minutes
```

**Database corruption**:
```bash
# Stop services, restore database, restart
docker stop airgen_dev_neo4j_1
/root/airgen/scripts/backup-restore.sh /path/to/backup --component neo4j
docker start airgen_dev_neo4j_1
```

**Complete disaster recovery from remote**:
```bash
# List remote snapshots
restic snapshots

# Restore from remote (example snapshot ID)
restic restore abc123def --target /tmp/restore

# Apply restored backup
/root/airgen/scripts/backup-restore.sh /tmp/restore/backups/weekly/latest
```

### Configuring Remote Backup

Remote backup provides off-site disaster recovery:

```bash
# Interactive setup
/root/airgen/scripts/setup-remote-backup.sh

# Or manually configure in /etc/environment
RESTIC_REPOSITORY="s3:https://region.digitaloceanspaces.com/bucket-name"
RESTIC_PASSWORD="your-encryption-password"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"

# Initialize repository
restic init
```

### Backup Monitoring

Check backup health:

```bash
# View recent backups
ls -lh /root/airgen/backups/daily/
ls -lh /root/airgen/backups/weekly/

# Check cron logs
tail -f /root/airgen/backups/logs/cron.log

# Verify backup integrity
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/daily/latest

# Check remote backup status
restic check
restic stats
```

### Development vs Production

**Development environment**:
- Uses `workspace/dev/` for isolation
- Backup paths default to `/root/airgen/backups/`
- Can test restore scripts safely

**Production environment**:
- Uses `workspace/` for production data
- Ensure remote backup is configured
- Test restore procedure monthly

### Important Notes

⚠️ **Before restoring**:
- Always use `--dry-run` first to preview changes
- Ensure services are stopped if restoring database
- Keep backup encryption password secure

✅ **Best practices**:
- Test restore procedure regularly (monthly)
- Monitor backup logs for errors
- Verify remote backups are uploading successfully
- Keep at least 2 weeks of local backups

### Complete Documentation

For comprehensive backup and recovery information:
- **[Backup & Restore Guide](./docs/BACKUP_RESTORE.md)** - Complete procedures and troubleshooting
- **[Remote Backup Setup](./docs/REMOTE_BACKUP_SETUP.md)** - Remote storage configuration

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
- [ReactFlow Documentation](https://reactflow.dev/) - Diagram canvas library
- [Radix UI Documentation](https://www.radix-ui.com/) - Accessible UI components
- [Sonner Documentation](https://sonner.emilkowal.ski/) - Toast notifications

### Implementing Inline Editing

The requirements table supports inline editing for certain fields. Here's how to add inline editing for a new field:

```typescript
// 1. Add editing state in SortableRow component
const [editingField, setEditingField] = useState<string | null>(null);
const [editValue, setEditValue] = useState<string>("");

// 2. Handle double-click to enter edit mode
const handleDoubleClick = (field: string, currentValue: string) => {
  setEditingField(field);
  setEditValue(currentValue || "");
};

// 3. Save on blur or Enter key
const handleSave = () => {
  if (editingField && onFieldUpdate && item.type === 'requirement') {
    const req = item.data as RequirementRecord;
    if (editValue !== req[editingField as keyof RequirementRecord]) {
      onFieldUpdate(req, editingField, editValue);
    }
  }
  setEditingField(null);
};

// 4. Render editable cell
<td
  onDoubleClick={() => handleDoubleClick('myField', req.myField || "")}
  style={{ cursor: "pointer" }}
>
  {editingField === 'myField' ? (
    <input
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') setEditingField(null);
      }}
      autoFocus
    />
  ) : (
    req.myField || <span style={{ color: "#94a3b8" }}>Double-click to set</span>
  )}
</td>
```

For dropdown fields (like verification method):
```typescript
{editingField === 'verification' ? (
  <select
    value={editValue}
    onChange={(e) => setEditValue(e.target.value)}
    onBlur={handleSave}
    autoFocus
  >
    <option value="">None</option>
    <option value="Test">Test</option>
    <option value="Analysis">Analysis</option>
    <option value="Inspection">Inspection</option>
    <option value="Demonstration">Demonstration</option>
  </select>
) : (
  req.verification || <span>Double-click to set</span>
)}
```

### Optimizing Neo4j Queries

Follow these patterns for optimal Neo4j query performance:

**1. Use Batched Queries Instead of N+1 Patterns**

❌ **Bad** - N+1 queries:
```typescript
// Fetch sections
const sections = await listDocumentSections(tenant, project, documentSlug);

// Fetch related data for each section (N queries)
for (const section of sections) {
  section.requirements = await listSectionRequirements(section.id);
  section.infos = await listSectionInfos(section.id);
  section.surrogates = await listSectionSurrogates(section.id);
}
// Total: 1 + (3 × N) queries
```

✅ **Good** - Single batched query:
```typescript
// Fetch everything in one query
const sections = await listDocumentSectionsWithRelations(tenant, project, documentSlug);
// Total: 1 query (~97% reduction for 10 sections)
```

**2. Use Query Monitoring**

```typescript
import { executeMonitoredQuery } from "../lib/neo4j-monitor.js";

const result = await executeMonitoredQuery(
  session,
  query,
  params,
  'operationName'  // Appears in logs for tracking
);
```

**3. Batch Related Data with COLLECT**

```cypher
MATCH (section:DocumentSection)-[:HAS_REQUIREMENT]->(req:Requirement)
WHERE section.id = $sectionId

// Collect all requirements per section
WITH section, COLLECT(req) as requirements

RETURN section, requirements
```

**4. Use OPTIONAL MATCH for Relations That May Not Exist**

```cypher
MATCH (section:DocumentSection {id: $sectionId})

OPTIONAL MATCH (section)-[:HAS_REQUIREMENT]->(req:Requirement)
OPTIONAL MATCH (section)-[:CONTAINS_INFO]->(info:Info)

WITH section,
     COLLECT(DISTINCT req) as requirements,
     COLLECT(DISTINCT info) as infos

RETURN section, requirements, infos
```

**5. Filter Nulls from Collections**

```cypher
WITH section, COLLECT(req) as reqs

RETURN section,
       [r IN reqs WHERE r IS NOT NULL | r] as requirements
```

See [NEO4J_IMPROVEMENTS_SUMMARY.md](./NEO4J_IMPROVEMENTS_SUMMARY.md) for comprehensive optimization examples.

## Getting Help

- Check existing issues on GitHub
- Review API documentation at `/api/docs`
- Check Neo4j schema docs in `backend/docs/NEO4J_SCHEMA.md`
- Ask in team chat or create new issue
- Consult the [documentation map](./README.md#documentation-map) for topic-specific guides
- Review [CUSTOM_ATTRIBUTES_IMPLEMENTATION.md](./CUSTOM_ATTRIBUTES_IMPLEMENTATION.md) for extensibility patterns
