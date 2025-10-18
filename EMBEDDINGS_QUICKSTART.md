# Embeddings Implementation Quick-Start Checklist

**Use this checklist alongside the full implementation plan**

## Pre-Implementation Checklist

- [ ] OpenAI API key is configured and working (`LLM_API_KEY` in environment)
- [ ] Neo4j version is 5.11 or higher (check: `docker exec airgen-neo4j-1 cypher-shell "CALL dbms.components()"`)
- [ ] Redis is available and running (check: `docker exec airgen-redis-1 redis-cli ping`)
- [ ] Backend tests are passing (`pnpm -C backend test`)
- [ ] Have ~3 hours for initial implementation

---

## Week 1: Foundation (Days 1-2)

### Day 1 Morning: Embedding Service (2 hours)

- [ ] Create `backend/src/services/embedding.ts` (copy from plan)
- [ ] Add export to `backend/src/services/llm.ts`: `export { getOpenAiClient }`
- [ ] Create `backend/src/services/embedding.test.ts` (copy from plan)
- [ ] Run tests: `pnpm -C backend test embedding`
- [ ] **Verify:** Tests pass

### Day 1 Afternoon: Vector Index (2 hours)

- [ ] Create `backend/src/services/graph/schema/create-vector-indexes.ts` (copy from plan)
- [ ] Create `backend/src/scripts/create-vector-indexes.ts` (copy from plan)
- [ ] Run script: `pnpm -C backend tsx src/scripts/create-vector-indexes.ts`
- [ ] **Verify:** See "✓ Vector index is online and ready"
- [ ] Check in Neo4j Browser: `SHOW INDEXES` should list `requirement_embeddings`

### Day 2: Integration with Requirements (3 hours)

- [ ] Modify `backend/src/services/graph/requirements/requirements-crud.ts`:
  - [ ] Import embedding service
  - [ ] Add embedding generation to `createRequirement`
  - [ ] Add embedding update to `updateRequirement`
- [ ] Test manually:
  ```bash
  # Create requirement
  curl -X POST http://localhost:8787/requirements \
    -H 'Content-Type: application/json' \
    -d '{"tenant":"default","projectKey":"test","title":"Test","text":"When X happens, system shall Y","pattern":"event","verification":"Test"}'

  # Check in Neo4j Browser:
  # MATCH (r:Requirement) RETURN r.text, size(r.embedding) as embeddingSize LIMIT 5
  # Should show embeddingSize = 1536
  ```
- [ ] **Verify:** New requirements have embeddings in Neo4j

---

## Week 2: Search & Discovery (Days 3-5)

### Day 3: Semantic Search Service (3 hours)

- [ ] Create `backend/src/services/graph/requirements/semantic-search.ts` (copy from plan)
- [ ] Create `backend/src/services/graph/requirements/semantic-search.test.ts` (optional)

### Day 4: API Routes (2 hours)

- [ ] Create `backend/src/routes/semantic-search.ts` (copy from plan)
- [ ] Register routes in `backend/src/server.ts`
- [ ] Restart backend: `pnpm -C backend dev`

### Day 4-5: Test API Endpoints (1 hour)

- [ ] Test "Find Similar":
  ```bash
  # Get a requirement ID from your database
  REQ_ID="your-requirement-id-here"

  curl "http://localhost:8787/requirements/default/test/$REQ_ID/similar"
  ```
- [ ] Test "Semantic Search":
  ```bash
  curl -X POST http://localhost:8787/requirements/search/semantic \
    -H 'Content-Type: application/json' \
    -d '{"tenant":"default","project":"test","query":"braking timing requirements"}'
  ```
- [ ] Test "Duplicates":
  ```bash
  curl "http://localhost:8787/requirements/default/test/$REQ_ID/duplicates"
  ```
- [ ] **Verify:** All endpoints return sensible results

---

## Week 3: UI & Migration (Days 6-8)

### Day 6: Background Worker (3 hours)

- [ ] Create `backend/src/workers/embedding-worker.ts` (copy from plan)
- [ ] Add routes to `backend/src/routes/workers.ts`:
  - [ ] POST `/api/workers/embedding/start`
  - [ ] GET `/api/workers/embedding/status`
  - [ ] POST `/api/workers/embedding/stop`
- [ ] Test worker:
  ```bash
  # Start backfill
  curl -X POST http://localhost:8787/workers/embedding/start \
    -H 'Content-Type: application/json' \
    -d '{"tenant":"default","project":"test","operation":"backfill"}'

  # Check status
  curl http://localhost:8787/workers/embedding/status

  # Should show: {"isRunning": true, "processedCount": X, "totalCount": Y}
  ```
- [ ] **Verify:** Worker processes requirements, status updates in real-time

### Day 7: Frontend - "Find Similar" (3 hours)

- [ ] Create `frontend/src/components/requirements/SimilarRequirementsModal.tsx` (copy from plan)
- [ ] Add API methods to `frontend/src/lib/client.ts`:
  - [ ] `getSimilarRequirements`
  - [ ] `getPotentialDuplicates`
  - [ ] `searchRequirementsSemantic`
- [ ] Add "Find Similar" button to `frontend/src/routes/RequirementsRoute.tsx`
- [ ] Test in browser:
  - [ ] Go to `/requirements`
  - [ ] Click "Find Similar" on any requirement
  - [ ] Modal should open with similar requirements listed
- [ ] **Verify:** Modal shows semantically similar requirements with similarity scores

### Day 8: Frontend - Dashboard Worker UI (2 hours)

- [ ] Add embedding worker section to `frontend/src/routes/DashboardRoute.tsx`:
  - [ ] Query for worker status
  - [ ] Start/Stop buttons
  - [ ] Progress display
- [ ] Add API methods to `frontend/src/lib/client.ts`:
  - [ ] `getEmbeddingWorkerStatus`
  - [ ] `startEmbeddingWorker`
  - [ ] `stopEmbeddingWorker`
- [ ] Test in browser:
  - [ ] Go to `/dashboard`
  - [ ] Click "Backfill Missing" button
  - [ ] Should see progress: "Processing 23/100"
- [ ] **Verify:** Can start/stop worker from dashboard, progress updates

---

## Production Deployment (Days 9-10)

### Day 9: Testing (4 hours)

- [ ] Run all backend tests: `pnpm -C backend test`
- [ ] Run frontend build: `pnpm -C frontend build`
- [ ] Manual testing checklist:
  - [ ] Create requirement → has embedding
  - [ ] Update requirement text → embedding regenerated
  - [ ] Find similar → shows related requirements
  - [ ] Detect duplicates → catches high similarity
  - [ ] Background worker → processes all requirements
  - [ ] Stop worker → stops gracefully

### Day 10: Deploy to Production (2 hours)

- [ ] **Backup database first:**
  ```bash
  /root/airgen/scripts/backup-weekly.sh
  ```

- [ ] Deploy backend:
  ```bash
  cd /root/airgen
  git pull origin master
  pnpm install
  pnpm -C backend build

  # Create vector indexes in production
  docker exec -it airgen-backend-1 pnpm tsx src/scripts/create-vector-indexes.ts

  # Restart backend
  docker-compose -f docker-compose.prod.yml restart backend
  ```

- [ ] Verify backend health:
  ```bash
  curl https://airgen.studio/api/health
  curl https://airgen.studio/api/workers/embedding/status
  ```

- [ ] Run migration worker:
  ```bash
  # Get auth token from browser (DevTools → Application → Local Storage)
  TOKEN="your-jwt-token"

  # Start backfill for each project
  curl -X POST https://airgen.studio/api/workers/embedding/start \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"tenant":"default","project":"your-project","operation":"backfill"}'

  # Monitor progress
  watch -n 5 'curl -s -H "Authorization: Bearer $TOKEN" https://airgen.studio/api/workers/embedding/status | jq'
  ```

- [ ] Deploy frontend:
  ```bash
  pnpm -C frontend build
  # Copy dist/ to your static hosting (or your deployment process)
  ```

- [ ] **Verify production:**
  - [ ] Visit https://airgen.studio/requirements
  - [ ] Click "Find Similar" on a requirement
  - [ ] Should see modal with similar requirements
  - [ ] Check dashboard for worker status

---

## Post-Deployment Validation (Day 11)

### Immediate Checks

- [ ] All new requirements get embeddings automatically
- [ ] "Find Similar" returns sensible results
- [ ] No errors in backend logs: `docker logs airgen-backend-1 --tail 100`
- [ ] No increase in response times

### Data Validation

- [ ] Check embedding coverage:
  ```bash
  # In Neo4j Browser:
  MATCH (r:Requirement)
  RETURN
    count(*) as total,
    count(r.embedding) as withEmbeddings,
    (count(r.embedding) * 100.0 / count(*)) as percentCovered
  ```
  - Should show ~100% coverage after migration

### Performance Checks

- [ ] Semantic search responds in <500ms
- [ ] "Find Similar" opens quickly (<1 second)
- [ ] No memory issues: `docker stats`

### Cost Checks

- [ ] Check OpenAI usage dashboard
- [ ] Should see minimal embedding costs (~$0.01 for 1000 requirements)

---

## Rollback Plan (If Needed)

If something goes wrong:

1. **Revert backend code:**
   ```bash
   cd /root/airgen
   git revert HEAD  # or specific commit
   pnpm -C backend build
   docker-compose -f docker-compose.prod.yml restart backend
   ```

2. **Restore from backup:**
   ```bash
   /root/airgen/scripts/backup-restore.sh /path/to/backup
   ```

3. **Remove vector index (optional):**
   ```bash
   # In Neo4j Browser:
   DROP INDEX requirement_embeddings
   ```

4. **Frontend is stateless** - just redeploy previous build

---

## Success Criteria

✅ **Ready for production when:**

- [ ] All 9 items in todo list are completed
- [ ] All tests pass
- [ ] Manual testing passes all scenarios
- [ ] "Find Similar" works in production
- [ ] Migration worker completes successfully
- [ ] No errors in logs for 24 hours
- [ ] User feedback is positive

---

## Common Issues & Quick Fixes

### Issue: "Vector index not found"

**Fix:**
```bash
# Re-run index creation
docker exec -it airgen-backend-1 pnpm tsx src/scripts/create-vector-indexes.ts

# Wait for index to come online (check status)
```

### Issue: "OpenAI API rate limit"

**Fix:**
```typescript
// In embedding-worker.ts, increase delay:
await new Promise(resolve => setTimeout(resolve, 100)); // was 20ms
```

### Issue: "No similar requirements found"

**Fix:**
```typescript
// Lower similarity threshold
minSimilarity: 0.6  // was 0.7
```

### Issue: "Worker stuck/not completing"

**Fix:**
```bash
# Stop worker
curl -X POST http://localhost:8787/workers/embedding/stop

# Check logs for errors
docker logs airgen-backend-1 --tail 100

# Restart if needed
```

---

## Quick Reference

### Key Files Created

```
backend/
├── src/
│   ├── services/
│   │   ├── embedding.ts                    ← Core embedding service
│   │   └── graph/
│   │       ├── requirements/
│   │       │   └── semantic-search.ts      ← Search functions
│   │       └── schema/
│   │           └── create-vector-indexes.ts ← Index setup
│   ├── workers/
│   │   └── embedding-worker.ts             ← Background worker
│   ├── routes/
│   │   └── semantic-search.ts              ← API endpoints
│   └── scripts/
│       └── create-vector-indexes.ts        ← Run-once script

frontend/
└── src/
    ├── components/
    │   └── requirements/
    │       └── SimilarRequirementsModal.tsx ← UI modal
    └── routes/
        ├── RequirementsRoute.tsx            ← Updated with button
        └── DashboardRoute.tsx               ← Updated with worker UI
```

### Key Commands

```bash
# Create vector index
pnpm -C backend tsx src/scripts/create-vector-indexes.ts

# Run tests
pnpm -C backend test

# Start backend dev
pnpm -C backend dev

# Start frontend dev
pnpm -C frontend dev

# Build for production
pnpm -C backend build
pnpm -C frontend build

# Check embedding coverage
# (Neo4j Browser): MATCH (r:Requirement) RETURN count(r.embedding)

# Monitor worker
curl http://localhost:8787/workers/embedding/status
```

---

## Timeline Summary

- **Week 1 (Days 1-2):** Foundation - Embedding service + vector index
- **Week 2 (Days 3-5):** Core features - Search endpoints + testing
- **Week 3 (Days 6-8):** UI + Migration - Worker + frontend components
- **Week 4 (Days 9-12):** Testing + Deployment + Validation

**Total:** ~12 working days (3 weeks at 4 days/week) or 2-3 calendar weeks

---

Good luck! Follow this checklist step-by-step and you'll have embeddings running smoothly.
