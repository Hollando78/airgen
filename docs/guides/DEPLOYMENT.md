# AIRGen Production Deployment Guide

## Overview

The AIRGen deployment system is optimized for fast, selective updates with minimal downtime.

## 🚀 Deployment Options

### 1. Quick API Deployment (~2 minutes)
**When to use:** Backend code changes only (routes, services, repositories)

```bash
./deploy-api.sh
# or
./deploy-production.sh api
```

**What happens:**
- Builds only the API service
- Deploys with zero downtime (databases keep running)
- Updates backend container only

**Performance:**
- Build context: ~200MB (was 1.45GB)
- Time: ~2 min (was ~4.5 min for API in full deploy)
- Downtime: 0 seconds

---

### 2. Quick Frontend Deployment (~1 minute)
**When to use:** UI/React changes only

```bash
./deploy-frontend.sh
# or
./deploy-production.sh frontend
```

**What happens:**
- Builds only the frontend service
- Deploys with zero downtime
- Updates frontend container only

**Performance:**
- Build context: ~50MB (was 1.45GB)
- Time: ~1 min (was ~1.4 min in full deploy)
- Downtime: 0 seconds

---

### 3. Quick Dual Deployment (~3 minutes)
**When to use:** Both API and frontend changes, but no database/config changes

```bash
./deploy-quick.sh
# or
./deploy-production.sh quick
```

**What happens:**
- Builds API and frontend in parallel
- Keeps databases running (zero downtime for DB)
- Deploys both services sequentially

**Performance:**
- Time: ~3 min (was ~6 min)
- Downtime: Minimal (only during container swap)

---

### 4. Full Deployment (~4 minutes)
**When to use:**
- First deployment
- Infrastructure changes (docker-compose.yml, env variables)
- Database migrations
- After long period without deploy

```bash
./deploy-production.sh full
# or just
./deploy-production.sh
```

**What happens:**
- Stops app services (keeps DBs if already running)
- Builds all images
- Starts all services with health checks
- Verifies all services are healthy

**Performance:**
- Time: ~4 min (was ~6 min)
- Improvement: ~33% faster due to `.dockerignore`

---

## 📊 Performance Comparison

| Deployment Type | Before | After | Improvement |
|----------------|--------|-------|-------------|
| Full Deploy | ~6 min | ~4 min | 33% faster |
| API Only | N/A | ~2 min | New capability |
| Frontend Only | N/A | ~1 min | New capability |
| Quick (Both) | N/A | ~3 min | 50% faster |

### Build Context Reduction
- **Before:** 1.45GB (includes workspace/, backups/, node_modules/, .git/)
- **After:** ~200-300MB (only source code)
- **Improvement:** 80% reduction in transfer time

---

## 🎯 Optimization Features

### 1. `.dockerignore` File
Excludes unnecessary files from Docker build context:
- ✅ `workspace/` directory (user data)
- ✅ `backups/` directory
- ✅ `node_modules/` (installed in container)
- ✅ `.git/` directory
- ✅ Build artifacts and logs
- ✅ Development files

**Result:** Faster context transfer (58s → ~10s for API)

### 2. Selective Service Updates
Only rebuild and deploy changed services:
- Use `--no-deps` flag to prevent unnecessary restarts
- Keep databases running during app updates
- Zero downtime for most deployments

### 3. Health Checks
Replaces static `sleep 10` with actual service health monitoring:
- Checks if service is actually `Up` before proceeding
- Configurable timeouts per service
- Fail-fast on deployment issues

### 4. Parallel Builds
Quick mode builds API and frontend simultaneously:
- Docker BuildKit parallelization
- Faster total build time

---

## 🛠️ Advanced Usage

### Check Deployment Status
```bash
docker-compose -f docker-compose.prod.yml ps
```

### View Logs
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# API only
docker-compose -f docker-compose.prod.yml logs -f api

# Frontend only
docker-compose -f docker-compose.prod.yml logs -f frontend

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 api
```

### Restart Services
```bash
# Restart API without rebuild
docker-compose -f docker-compose.prod.yml restart api

# Restart all services
docker-compose -f docker-compose.prod.yml restart
```

### Manual Build (without deploy)
```bash
docker-compose -f docker-compose.prod.yml build api
```

---

## 📝 Deployment Workflow Examples

### Example 1: Backend Code Change
```bash
# 1. Make changes to backend code
vim backend/src/routes/admin-users.ts

# 2. Deploy only the API (~2 min)
./deploy-api.sh

# 3. Verify
docker-compose -f docker-compose.prod.yml logs -f api
```

### Example 2: Frontend UI Update
```bash
# 1. Make changes to frontend
vim frontend/src/pages/Dashboard.tsx

# 2. Deploy only frontend (~1 min)
./deploy-frontend.sh

# 3. Verify at https://airgen.studio
```

### Example 3: Full Stack Changes
```bash
# 1. Make changes to both backend and frontend

# 2. Quick deploy both (~3 min)
./deploy-quick.sh

# 3. Verify
curl https://airgen.studio/api/health
```

### Example 4: Database Migration
```bash
# 1. Full deployment to ensure clean state
./deploy-production.sh full

# 2. Run migrations
docker-compose -f docker-compose.prod.yml exec api node dist/scripts/deploy-user-database.js

# 3. Verify
docker-compose -f docker-compose.prod.yml exec postgres psql -U airgen -d airgen -c "\dt"
```

---

## 🔧 Troubleshooting

### Build Fails with Context Error
```bash
# Clear Docker build cache
docker builder prune -af

# Retry deployment
./deploy-production.sh full
```

### Service Won't Start
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs api

# Check service status
docker-compose -f docker-compose.prod.yml ps

# Restart service
docker-compose -f docker-compose.prod.yml restart api
```

### Out of Disk Space
```bash
# Remove unused images
docker image prune -af

# Remove unused volumes (CAUTION: may delete data)
docker volume prune -f

# Check disk usage
docker system df
```

---

## 💡 Best Practices

1. **Use selective deployments** - Deploy only what changed
2. **Check logs** - Always verify deployment success
3. **Test locally first** - Run `pnpm build` before deploying
4. **Keep backups** - Database backups before major changes
5. **Monitor after deploy** - Watch logs for 1-2 minutes post-deploy
6. **Use full deploy sparingly** - Only when infrastructure changes

---

## 🎓 Tips

- **Fastest workflow:** `./deploy-api.sh` for backend-only changes
- **Zero downtime:** Quick and selective deploys keep DBs running
- **Parallel work:** Frontend and backend can deploy independently
- **Build cache:** Docker BuildKit caches layers for faster rebuilds
- **Health checks:** Deployment waits for services to be healthy

---

## 📞 Support

For issues or questions:
- Check logs: `docker-compose -f docker-compose.prod.yml logs -f`
- Check status: `docker-compose -f docker-compose.prod.yml ps`
- View docs: https://docs.claude.com/claude-code
