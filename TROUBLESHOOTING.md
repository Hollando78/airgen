# Troubleshooting Guide

This guide documents common issues and their solutions for the AIRGen development environment.

## Table of Contents
- [Critical Issues](#critical-issues)
- [RBAC and Authentication](#rbac-and-authentication)
- [Development Environment Performance](#development-environment-performance)
- [TypeScript Build Errors](#typescript-build-errors)
- [Starting Services](#starting-services)
- [Common Errors](#common-errors)

---

## Critical Issues

### 1. All Write Operations Failing with 403 Forbidden

**Symptoms:**
- POST/PATCH/DELETE requests return 403 Forbidden
- Users can read data but cannot create, update, or delete
- Error message: `"This action requires the 'author' role"`

**Root Cause:**
RBAC middleware requires `"author"` role for write operations, but dev users only have `["admin", "user"]` roles.

**Location of Problem:**
- `backend/src/routes/*.ts` - Routes using `app.requireRole("author")`
- `backend/workspace/dev-users.json` - User role definitions

**Solution:**
Add `"author"` role to all dev users in `backend/workspace/dev-users.json`:

```json
{
  "roles": [
    "admin",
    "author",  // ← Add this
    "user"
  ]
}
```

**Prevention:**
When creating new dev users, ensure they have the `"author"` role. The role hierarchy is:
- `"admin"` - Full system access
- `"author"` - Can create/edit/delete content
- `"reviewer"` - Can approve baselines
- `"user"` - Read-only access

---

## RBAC and Authentication

### Understanding the RBAC System

**Role Decorators** (`backend/src/plugins/auth.ts`):
```typescript
app.requireRole("author")           // Requires exactly this role
app.requireAnyRole(["author", "admin"])  // Requires at least one
```

**Affected Routes:**
- All POST/PATCH/DELETE operations require `"author"` role minimum
- Baseline creation requires `"reviewer"` role
- GET operations only require authentication (any authenticated user)

**Finding RBAC Issues:**
```bash
# Search for role requirements
grep -r "requireRole\|requireAnyRole" backend/src/routes/

# Check current user roles
cat backend/workspace/dev-users.json | grep -A 5 "roles"
```

---

## Development Environment Performance

### Slow Server Startup (50-70% slower than expected)

**Symptoms:**
- Backend takes 5-10+ seconds to start
- Multiple "connecting..." messages for services you're not using
- Unnecessary dependency initialization

**Root Cause:**
Optional services (Redis, Sentry, Prometheus) attempt to initialize even in development mode.

**Solution:**
These services are now **automatically disabled in development** (as of commit 2c22992):

- **Redis caching**: Disabled unless `REDIS_ENABLED=true`
- **Prometheus metrics**: Disabled unless `METRICS_ENABLED=true`
- **Sentry error tracking**: Disabled unless `SENTRY_ENABLED=true`

**Enable in Development** (if needed):
```bash
# In env/development.env or .env.local
REDIS_ENABLED=true
METRICS_ENABLED=true
SENTRY_ENABLED=true
```

**Code Locations:**
- `backend/src/lib/cache.ts:40-49` - Redis dev check
- `backend/src/lib/metrics.ts:41-48` - Metrics dev check
- `backend/src/lib/sentry.ts:44-51` - Sentry dev check

**Expected Startup Time:**
- Before: ~8-12 seconds
- After: ~2-4 seconds

---

## TypeScript Build Errors

### Error: Module declares 'X' locally, but it is not exported

**Example:**
```
src/services/graph/architecture/blocks.ts(11,55): error TS2459:
Module '"./mappers.js"' declares 'toNumber' locally, but it is not exported.
```

**Root Cause:**
Function was moved to a utility file but old import statements still reference the old location.

**Solution Pattern:**
```typescript
// ❌ Old (incorrect)
import { mapBlock, toNumber } from "./mappers.js";

// ✅ New (correct)
import { mapBlock } from "./mappers.js";
import { toNumber } from "../../../lib/neo4j-utils.js";
```

**Common Utility Locations:**
- `backend/src/lib/neo4j-utils.ts` - Neo4j type conversions (toNumber, toISOString, etc.)
- `backend/src/lib/logger.ts` - Logging utilities
- `backend/src/lib/cache.ts` - Caching utilities

**Finding Import Errors:**
```bash
# Build to find all TypeScript errors
cd backend && pnpm build

# Search for imports of a specific function
grep -r "import.*toNumber" backend/src/
```

---

## Starting Services

### Proper Development Startup Sequence

**Infrastructure (Docker Compose):**
```bash
# Start database services
COMPOSE_PROJECT_NAME=airgen_dev \
  docker-compose --env-file env/development.env \
  -f docker-compose.dev.yml up -d

# Services started:
# - PostgreSQL: localhost:55432
# - Redis: localhost:36379
# - Neo4j: bolt://localhost:17687, http://localhost:17474
```

**Backend API (Local):**
```bash
cd backend

# With environment variables
API_PORT=18787 \
GRAPH_URL=bolt://localhost:17687 \
GRAPH_USERNAME=neo4j \
GRAPH_PASSWORD=airgen-graph \
GRAPH_DATABASE=neo4j \
API_JWT_SECRET=change_me \
API_ENV=development \
LLM_PROVIDER=openai \
LLM_API_KEY=your_openai_key \
LLM_MODEL=gpt-4o-mini \
pnpm dev

# Or source from .env.local:
source ../.env.local && pnpm dev
```

**Frontend (Vite):**
```bash
cd frontend

# Point to correct backend API port
API_PROXY_TARGET=http://127.0.0.1:18787 pnpm dev

# Frontend will be at http://localhost:5173
```

### Verifying Services

```bash
# Check if services are running
ss -tlnp | grep -E ":(5173|18787|17687|55432)"

# Test backend health
curl http://localhost:18787/api/health

# Test frontend proxy
curl http://localhost:5173/api/health

# Expected response:
# {"ok":true,"environment":"development",...}
```

---

## Common Errors

### Port Already in Use

**Error:**
```
Error: Port 5173 is already in use
Error: listen EADDRINUSE: address already in use :::18787
```

**Solution:**
```bash
# Find and kill process on port
lsof -ti:5173 | xargs kill -9
lsof -ti:18787 | xargs kill -9

# Or kill by process name
pkill -f "pnpm dev"
pkill -f "vite"
```

---

### Docker Build Failures

**Error:**
```
The command '/bin/sh -c pnpm build' returned a non-zero code: 2
```

**Solutions:**

1. **Check TypeScript errors first:**
   ```bash
   cd backend && pnpm build
   # Fix any TypeScript errors before building Docker image
   ```

2. **Clear Docker cache:**
   ```bash
   docker system prune -af
   docker volume prune -f
   ```

3. **Use local development instead of Docker for backend:**
   - Docker builds can be slow (5+ minutes)
   - Local `pnpm dev` is much faster (2-4 seconds)
   - Docker is primarily for production builds

---

### Neo4j Connection Errors

**Error:**
```
Neo4jError: The client is unauthorized due to authentication failure.
```

**Solutions:**

1. **Check credentials match:**
   ```bash
   # In docker-compose.dev.yml
   NEO4J_AUTH: "neo4j/airgen-graph"

   # In backend environment
   GRAPH_USERNAME=neo4j
   GRAPH_PASSWORD=airgen-graph
   ```

2. **Reset Neo4j password:**
   ```bash
   docker-compose --env-file env/development.env \
     -f docker-compose.dev.yml down
   docker volume rm airgen_dev_neo4jdata_dev
   docker-compose --env-file env/development.env \
     -f docker-compose.dev.yml up -d
   ```

---

### Frontend Shows Blank Page

**Common Causes:**

1. **API proxy misconfigured:**
   ```bash
   # Check vite.config.ts - should proxy /api to backend
   # Start frontend with:
   API_PROXY_TARGET=http://127.0.0.1:18787 pnpm dev
   ```

2. **Backend not running:**
   ```bash
   # Verify backend is up
   curl http://localhost:18787/api/health
   ```

3. **Authentication token issues:**
   ```bash
   # Clear browser localStorage
   # Or in browser console:
   localStorage.clear()
   ```

---

### Requirements Route Shows "No Requirements Found"

**Symptoms:**
- Frontend shows empty list or "No requirements found" message
- Requirements exist in the database and as markdown files
- Other routes may also fail with no data

**Root Cause:**
User is not logged in. All API routes (including GET requests) require JWT authentication.

**Solution:**
1. **Login to the frontend:**
   - Navigate to http://localhost:5173
   - Click the login button (or navigate to login page)
   - Use one of the dev credentials:
     ```
     Email: steven.holland@outlook.com
     Password: Tynebridge001!
     ```

2. **Verify authentication:**
   ```bash
   # Check browser localStorage has auth token
   # In browser console:
   localStorage.getItem('auth_token')
   # Should return a JWT token string
   ```

3. **Test API directly (optional):**
   ```bash
   # Login and get token
   cat > /tmp/login.json << 'EOF'
   {"email":"steven.holland@outlook.com","password":"Tynebridge001!"}
   EOF
   curl -X POST http://localhost:18787/api/auth/login \
     -H 'Content-Type: application/json' \
     -d @/tmp/login.json

   # Use token to fetch requirements
   TOKEN="<token_from_above>"
   curl http://localhost:18787/api/requirements/hollando/main-battle-tank \
     -H "Authorization: Bearer $TOKEN"
   ```

**Available Dev Users:**
- `steven.holland@outlook.com` (password: Tynebridge001!) - admin, author, user (hollando, admin-dev tenants)
- `test@dev.local` (password: test123) - admin, author, user (admin-dev tenant)
- `admin@dev.local` (password: admin123) - admin, author, user (admin-dev tenant)
- `user@dev.local` (password: user123) - author, user

**Note:** If login fails, check backend logs for authentication errors and verify dev-users.json has the expected user records.

---

### OpenAI API Errors

**Error:**
```
401 Unauthorized: Invalid API key
Rate limit exceeded
```

**Solutions:**

1. **Verify API key is set:**
   ```bash
   echo $LLM_API_KEY
   # Should show: sk-proj-...
   ```

2. **Check key in environment:**
   ```bash
   # In backend/.env or .env.local
   LLM_PROVIDER=openai
   LLM_API_KEY=sk-proj-your-key-here
   LLM_MODEL=gpt-4o-mini
   ```

3. **Rate limits:**
   - Free tier has low limits
   - Add delays between requests
   - Check `AI_DRAFT_LIMIT` setting (default: 5)

---

## Quick Diagnostic Commands

```bash
# Show all running services
docker ps
ps aux | grep -E "pnpm|vite|node" | grep -v grep
ss -tlnp | grep -E ":(5173|18787|17687|55432|36379)"

# Test connectivity
curl http://localhost:5173              # Frontend
curl http://localhost:18787/api/health  # Backend direct
curl http://localhost:5173/api/health   # Backend via proxy
curl http://localhost:17474             # Neo4j browser

# Check logs
docker logs airgen_dev_neo4j_1
docker logs airgen_dev_postgres_1
# Backend logs are in terminal where you ran 'pnpm dev'

# Git status
git status
git log --oneline -5
git remote -v
```

---

## Getting Help

If you encounter issues not covered here:

1. **Check recent commits** for similar fixes:
   ```bash
   git log --grep="fix\|error" --oneline -20
   ```

2. **Search codebase for error messages:**
   ```bash
   grep -r "error message text" backend/src/
   ```

3. **Review test files** for expected behavior:
   ```bash
   find backend/src -name "*.test.ts" -exec grep -l "your feature" {} \;
   ```

4. **Check documentation:**
   - `backend/docs/NEO4J_SCHEMA.md` - Database schema
   - `E2E_TESTING.md` - End-to-end testing guide
   - `OBSERVABILITY.md` - Monitoring and metrics
   - `DEVELOPMENT_GUIDE.md` - Development best practices

---

## Maintenance Notes

### When Adding New Routes

1. **Always add authentication:**
   ```typescript
   app.post("/api/new-route", {
     preHandler: [app.authenticate, app.requireRole("author")]
   }, async (req, reply) => {
     // handler
   });
   ```

2. **Update dev users if needed:**
   - Add required roles to `backend/workspace/dev-users.json`

3. **Document role requirements** in route comments

### When Adding New Dependencies

1. **Mark as optional in development:**
   ```typescript
   // In initialization
   const environment = process.env.API_ENV || process.env.NODE_ENV || "development";
   if (environment === "development" && !process.env.SERVICE_ENABLED) {
     logger.info("Service disabled in development");
     return;
   }
   ```

2. **Update this guide** with new environment variables

3. **Add graceful degradation** for when service is unavailable

---

## Version History

- **2025-10-02**: Initial troubleshooting guide created
  - Documented RBAC role issue and fix
  - Documented dev environment performance optimizations
  - Documented TypeScript import error patterns
  - Added service startup procedures
