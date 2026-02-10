# AirGen Backup & Restore Documentation

## Overview

AirGen implements a comprehensive 3-tier backup strategy to protect against data loss with **Neo4j as the single source of truth**:

1. **Daily Full Backups** - Fast recovery, 7-day retention + remote replication
2. **Weekly Full Backups** - Disaster recovery, 4-week local + 12-week remote retention
3. **Real-Time Protection** - Git repository tracking

**Architecture Note**: As of 2025-10-10, AirGen uses Neo4j as the single source of truth. All data (requirements, documents, version history, baselines, trace links, architecture) is stored in Neo4j. The Neo4j dump is the PRIMARY backup artifact containing complete data.

## Access Control

- **System-level backups** (`/api/admin/recovery/*`, Admin Recovery UI) require the **Super Administrator** role.
- **Project-level backups** (`/api/admin/recovery/project/*`) are scoped:
  - Super Admins can back up any project.
  - Tenant Admins can back up projects within their tenants.
  - Project Admins can back up only the projects they administer.

## What Gets Backed Up

### Critical Data Sources

| Component | Priority | Size | Description | Backup Method |
|-----------|----------|------|-------------|---------------|
| **Neo4j Database** | **PRIMARY** | ~180MB | **ALL DATA**: requirements, documents, sections, version history, baselines, trace links, architecture diagrams, relationships, traceability | Database dump + volume snapshot |
| **Docker Volumes** | Secondary | ~50MB | Redis cache, application state | Volume snapshots |
| **Workspace Files** | Deprecated | ~7.5MB | **LEGACY ONLY** - Deprecated markdown files (can be regenerated via export service) | Archive (optional) |
| **Configuration** | Required | <1MB | Environment files, docker-compose configs | Archive |

**Important**: The Neo4j database dump is sufficient for complete data restore. Workspace files are deprecated and not required for restore operations.

### Backup Schedule

```
Daily:     2:00 AM - Full snapshot + remote upload
           2:30 AM - Verification
Weekly:    3:00 AM Sunday - Full backup + remote upload
```

## Quick Start

### Run Manual Backup

```bash
# Daily backup
/root/airgen/scripts/backup-daily.sh

# Weekly backup (with volume snapshots)
/root/airgen/scripts/backup-weekly.sh

# Verify backups
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/daily
```

### List Available Backups

```bash
# Daily backups
ls -lh /root/airgen/backups/daily/

# Weekly backups
ls -lh /root/airgen/backups/weekly/

# View backup manifest
cat /root/airgen/backups/daily/YYYYMMDD/MANIFEST.txt
```

### Restore from Backup

```bash
# DRY RUN (recommended first)
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251009 --dry-run

# Restore all components
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251009

# Restore specific component only
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251009 --component=neo4j
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251009 --component=workspace
```

## Detailed Usage

### Daily Backup Script

**Script:** `/root/airgen/scripts/backup-daily.sh`

**What it does:**
1. Pre-backup health checks (disk space, container status, Neo4j connectivity)
2. Stops the Neo4j container and archives the data volume (`neo4j-*.tar.gz`)
3. Backs up PostgreSQL (if running) using `pg_dump` (non-critical)
4. Creates a placeholder workspace archive (deprecated legacy data)
5. Backs up configuration files and git state
6. Verifies all locally generated backup files
7. Creates a manifest with SHA256 checksums
8. Uploads the backup directory to the restic remote repository (tag `daily`) and prunes remote daily retention (7 days)
9. Cleans up local backups older than 7 days
10. Sends notification on completion/failure

**Retention:** 7 days

**Location:** `/root/airgen/backups/daily/YYYYMMDD/`

**Files created:**
- `neo4j-YYYYMMDD-HHMMSS.tar.gz` - **Neo4j data volume snapshot (PRIMARY - contains ALL data)**
  - All requirements and requirement versions
  - All documents, sections, and their versions
  - All baselines and version snapshots
  - All trace links and linksets
  - All architecture diagrams, blocks, connectors
  - Complete version history for all entities
  - User data and authentication
- `workspace-YYYYMMDD-HHMMSS.tar.gz` - **DEPRECATED** (legacy markdown files, optional)
- `config-YYYYMMDD-HHMMSS.tar.gz` - Configuration files
- `MANIFEST.txt` - Checksums and metadata

### Weekly Backup Script

**Script:** `/root/airgen/scripts/backup-weekly.sh`

**What it does:**
1. Performs the full daily backup workflow (volume snapshot, PostgreSQL dump, config archive)
2. Captures full Docker volume snapshots for Neo4j and PostgreSQL
3. Uploads the weekly backup directory to the restic repository (tag `weekly`) and keeps 12 weeks of remote history
4. Cleans up local weekly backups older than 4 weeks

**Retention:** 4 weeks local, 12 weeks remote

**Location:** `/root/airgen/backups/weekly/week-YYYY-WNN/`

**Additional files:**
- `neo4j-volume-YYYYMMDD-HHMMSS.tar.gz` - Full Neo4j volume (contains complete graph database)

### Project-Level Backups

Project exports are available through `/api/admin/recovery/project/*` and the Admin Recovery tooling. Exports are saved under `/root/airgen/backups/projects/<tenant>/<project>/` using the naming pattern:

```
<tenant-slug>__<project-slug>__YYYYMMDD-HHMMSS.cypher
```

Every export automatically uploads to the configured restic repository with tags identifying the tenant and project (`tenant:<slug>`, `project:<slug>`). Remote snapshots follow the same retention as the metadata store. Access is scoped:

- Super Admins can export any project.
- Tenant Admins can export projects in their tenants.
- Project Admins can export their assigned project(s).

**Admin Recovery UI:** The Admin Recovery page now includes tenant and project selectors so you can view per-project backups, trigger new exports, and immediately see the generated filenames and restic snapshot IDs. Component badges highlight what each backup contains and warn when a run produced no artifacts (for example, if a container name was misconfigured).

### Verification Script

**Script:** `/root/airgen/scripts/backup-verify.sh`

**Usage:**
```bash
# Verify daily backups
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/daily

# Verify weekly backups
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/weekly

# Verbose output
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/daily true
```

**What it does:**
1. Checks file integrity (not corrupted)
2. Verifies checksums against manifest
3. Checks backup age and warns if too old
4. Reports summary statistics
5. Sends alert if backups are stale

### Restore Script

**Script:** `/root/airgen/scripts/backup-restore.sh`

**Usage:**
```bash
# Restore everything (with 10-second warning)
/root/airgen/scripts/backup-restore.sh /path/to/backup/directory

# Dry run (safe, shows what would happen)
/root/airgen/scripts/backup-restore.sh /path/to/backup/directory --dry-run

# Restore specific component
/root/airgen/scripts/backup-restore.sh /path/to/backup/directory --component=neo4j
/root/airgen/scripts/backup-restore.sh /path/to/backup/directory --component=postgres
/root/airgen/scripts/backup-restore.sh /path/to/backup/directory --component=workspace
/root/airgen/scripts/backup-restore.sh /path/to/backup/directory --component=config
```

**What it does:**
1. Verifies backup integrity
2. Warns and waits 10 seconds (unless dry-run)
3. Stops affected containers
4. Restores data from backup files
5. Restarts containers
6. Sends notification

**Component-specific behavior:**

- **Neo4j**: Stops container, loads dump with `--overwrite-destination`, restarts (PRIMARY - restores all data)
- **Workspace**: **DEPRECATED** - Backs up existing workspace before restore, extracts archive (optional, can regenerate via export service)
- **Config**: Restores environment files and docker-compose configs

## Remote Backup Configuration

Remote backups are **required**. Both daily and weekly scripts will abort if the restic repository is not configured. Define the following environment variables (typically via `/etc/environment`):

### Using AWS S3

```bash
# Add to your environment (preferred: /root/airgen/.env)
RESTIC_REPOSITORY="s3:s3.amazonaws.com/your-bucket-name/airgen-backups"
RESTIC_PASSWORD="your-encryption-password"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
```

### Using DigitalOcean Spaces

```bash
RESTIC_REPOSITORY="s3:nyc3.digitaloceanspaces.com/your-space-name/airgen-backups"
RESTIC_PASSWORD="your-encryption-password"
AWS_ACCESS_KEY_ID="your-spaces-key"
AWS_SECRET_ACCESS_KEY="your-spaces-secret"
```

### Initialize Repository

```bash
restic init
```

### Manual Remote Operations

```bash
# List snapshots
restic snapshots

# Restore from remote
restic restore latest --target /root/airgen/backups/restore/

# Check repository integrity
restic check

# Prune old snapshots
restic forget --keep-weekly 12 --prune
```

## Recovery Scenarios

### Scenario 1: Accidental Document Deletion (Today's Incident)

**Problem:** Environmental document deleted between backups

**Solution:**
```bash
# 1. Find most recent backup
ls -lh /root/airgen/backups/daily/

# 2. Verify backup contains data
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/daily/20251009

# 3. Restore Neo4j (primary data store)
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251009 --component=neo4j
```

**Recovery Time:** ~5 minutes
**Data Loss:** <24 hours

### Scenario 2: Database Corruption

**Problem:** Neo4j database corrupted or inconsistent

**Solution:**
```bash
# 1. Stop application
docker-compose -f docker-compose.dev.yml stop api

# 2. Restore Neo4j from daily backup
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/$(date +%Y%m%d) --component=neo4j

# 3. Restart application
docker-compose -f docker-compose.dev.yml start api
```

**Recovery Time:** ~10 minutes
**Data Loss:** <24 hours

### Scenario 3: Complete Server Failure

**Problem:** Server crashed, need to rebuild on new server

**Solution:**
```bash
# 1. Set up new server with Docker
apt-get update && apt-get install -y docker.io docker-compose restic

# 2. Clone repository
git clone <repo-url> /root/airgen
cd /root/airgen

# 3. Restore from remote backup
export RESTIC_REPOSITORY="s3:..."
export RESTIC_PASSWORD="..."
restic restore latest --target /root/airgen/backups/restore/

# 4. Restore all components
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/restore/week-YYYY-WNN

# 5. Start services
docker-compose -f docker-compose.prod.yml up -d
```

**Recovery Time:** 1-2 hours
**Data Loss:** <7 days (remote snapshots keep 12 weeks of history)

### Scenario 4: Ransomware / Data Corruption

**Problem:** All local data compromised or encrypted

**Solution:**
```bash
# 1. Clean install on new/wiped server
# 2. Install dependencies
# 3. Restore from remote backup (untouched by ransomware)
restic restore latest --target /root/airgen/backups/restore/

# 4. Full restore
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/restore/week-YYYY-WNN
```

**Recovery Time:** 2-4 hours
**Data Loss:** <7 days

## Monitoring

### Check Backup Status

```bash
# View recent backup logs
tail -f /root/airgen/backups/logs/backup.log

# View cron execution logs
tail -f /root/airgen/backups/logs/cron.log

# Check last backup age
stat /root/airgen/backups/daily/ | grep Modify
```

### Verify Cron Jobs

```bash
# List cron jobs
crontab -l

# Check cron service
systemctl status cron
```

### Disk Space Monitoring

```bash
# Check backup disk usage
du -sh /root/airgen/backups/*

# Check available space
df -h /root/airgen/backups/
```

## Troubleshooting

### Backup Failing: "Neo4j container not running"

**Solution:**
```bash
# Check container status
docker ps -a | grep neo4j

# Start container
docker start airgen_dev_neo4j_1

# Check logs
docker logs airgen_dev_neo4j_1
```

### Backup Failing: "Insufficient disk space"

**Solution:**
```bash
# Check disk usage
df -h

# Clean up old Docker images
docker system prune -a

# Manually clean old backups
rm -rf /root/airgen/backups/daily/2025{0901..0930}
```

### Restore Failing: "Checksum mismatch"

**Problem:** Backup file corrupted

**Solution:**
```bash
# Try previous day's backup
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/$(date -d "yesterday" +%Y%m%d)

# Or restore from weekly backup
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/weekly/week-2025-W40
```

### Remote Backup Not Working

**Check configuration:**
```bash
# Test restic connection
restic snapshots

# Check environment variables
env | grep RESTIC
```

## Neo4j Single-Source Architecture (Updated 2025-10-10)

### Architecture Overview

AirGen has migrated to **Neo4j as the single source of truth**. This architectural change simplifies backup/restore operations:

**Before** (Dual-Source Architecture):
- Requirements stored in Neo4j + workspace markdown
- Documents stored in Neo4j + workspace files
- Backup required both Neo4j dump + workspace archive
- Restore required syncing between Neo4j and workspace

**After** (Single-Source Architecture):
- **ALL data stored exclusively in Neo4j**
- Workspace markdown **deprecated** (legacy only)
- Backup requires **only Neo4j dump**
- Restore is **one-step** (Neo4j only)

### What's in the Neo4j Database

**Complete data includes**:
- ✅ All requirements (current state + version history)
- ✅ All documents and sections (current state + version history)
- ✅ All baselines (point-in-time snapshots)
- ✅ All trace links and linksets
- ✅ All architecture diagrams, blocks, connectors
- ✅ All version history (RequirementVersion, DocumentVersion, etc.)
- ✅ Complete lifecycle tracking (archived, deleted, restored states)
- ✅ User data and authentication
- ✅ Tenant and project metadata

### Export Service (On-Demand Markdown)

If you need markdown files for external tools:

```bash
# Export entire project as markdown
curl http://localhost:8787/export/acme/brake-system/markdown

# Export single requirement
curl http://localhost:8787/export/acme/brake-system/requirements/REQ-001
```

**Benefits**:
- Always fresh (generated from Neo4j on request)
- No sync issues
- Smaller backup footprint

## Workspace Git Protection (Deprecated)

**Note**: Workspace is deprecated as of 2025-10-10. The workspace directory may contain legacy markdown files but is no longer actively managed.

**Current status**:
- Workspace markdown not generated on write operations
- Export service generates markdown on demand
- Legacy workspace files may exist for backward compatibility
- Not required for backup/restore

### Legacy Workspace Tracking

If you have legacy workspace files, they remain tracked in git:

**Tracked:**
- All `.md` files (legacy requirements, documents)
- All `.json` and `.yaml` configuration files
- Directory structure

**Not Tracked:**
- Temporary files (`.tmp`, `.cache`)
- Log files
- Large binaries (use Git LFS if needed)

### Initial Workspace Commit

After implementing backup system:

```bash
cd /root/airgen
git add workspace/
git commit -m "feat(workspace): add workspace files to git tracking

Workspace files are now tracked in git for additional protection:
- Requirements markdown files
- Document files
- Configuration files
- Directory structure

Large files and temp files are excluded via .gitignore
Use Git LFS for binary assets if needed

Related to backup strategy implementation"
```

## Maintenance

### Monthly Tasks

1. **Test restore procedure** (dry-run)
   ```bash
   /root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/$(date +%Y%m%d) --dry-run
   ```

2. **Verify remote backups**
   ```bash
   restic check
   ```

3. **Review backup logs**
   ```bash
   grep ERROR /root/airgen/backups/logs/backup.log
   ```

4. **Check disk space trends**
   ```bash
   df -h /root/airgen/backups/
   ```

### Quarterly Tasks

1. **Test full restore on staging environment**
2. **Review and update retention policies**
3. **Update remote backup credentials (if rotated)**
4. **Audit backup coverage (any new data sources?)**

## Security Considerations

### Backup Encryption

- Remote backups are encrypted via restic
- Use strong RESTIC_PASSWORD (>20 characters)
- Store backup credentials separately from server
- Rotate credentials quarterly

### Access Control

- Backup directories: `chmod 750` (owner + group only)
- Backup scripts: `chmod 750` (executable by owner only)
- Never commit backup credentials to git
- Use environment variables for sensitive config

### Data Protection

- Test restore procedures regularly
- Keep remote backups geographically separate
- Document recovery procedures
- Maintain multiple backup generations

## Support

For issues or questions about the backup system:

1. Check logs: `/root/airgen/backups/logs/backup.log`
2. Review this documentation
3. Verify cron jobs are running: `crontab -l`
4. Check pushover notifications for alerts

## Changelog

### 2025-10-10 - Neo4j Single-Source Migration

- **BREAKING**: Neo4j is now the single source of truth
- Workspace markdown deprecated (legacy only)
- Neo4j dump is PRIMARY backup (contains all data)
- Removed PostgreSQL backup (no longer used)
- Added version history to Neo4j (all lifecycle operations tracked)
- Added baseline system to Neo4j (point-in-time snapshots)
- Simplified restore process (Neo4j only)
- Updated documentation to reflect new architecture

### 2025-10-09 - Initial Implementation

- Created 3-tier backup strategy
- Implemented daily/weekly backup scripts
- Added verification and restore capabilities
- Configured remote backup support
- Added workspace git tracking
- Set up automated cron jobs
- Created comprehensive documentation

## Related Documentation

- **[Neo4j Migration Complete](./NEO4J-MIGRATION-COMPLETE.md)** - Complete migration summary
- **[Version History System](./VERSION-HISTORY-SYSTEM.md)** - Version tracking and audit trail
- **[Baseline System Guide](./BASELINE-SYSTEM-GUIDE.md)** - Point-in-time snapshots
- [Remote Backup Setup](./REMOTE_BACKUP_SETUP.md) - Remote storage configuration

---

**Last Updated:** 2025-10-10
**Version:** 2.0 (Neo4j Single-Source)
**Author:** AirGen Backup System
