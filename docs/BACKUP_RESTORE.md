# AirGen Backup & Restore Documentation

## Overview

AirGen implements a comprehensive 3-tier backup strategy to protect against data loss:

1. **Daily Incremental Backups** - Fast recovery, 7-day retention
2. **Weekly Full Backups** - Disaster recovery, 4-week local + 12-week remote retention
3. **Real-Time Protection** - Workspace files tracked in git

## What Gets Backed Up

### Critical Data Sources

| Component | Size | Description | Backup Method |
|-----------|------|-------------|---------------|
| **Neo4j Database** | ~517MB | Requirements, documents, relationships, traceability | Database dump + volume snapshot |
| **PostgreSQL** | ~47MB | Users, sessions, metadata | SQL dump + volume snapshot |
| **Workspace Files** | ~7.5MB | Tenant data, requirements, documents (NOT in git) | Archive + git tracking |
| **Configuration** | <1MB | Environment files, docker-compose configs | Archive |

### Backup Schedule

```
Daily:     2:00 AM - Incremental backup
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
2. Backs up Neo4j database using `neo4j-admin dump`
3. Backs up PostgreSQL database using `pg_dump`
4. Creates compressed archive of workspace files
5. Backs up configuration files and git state
6. Verifies all backup files
7. Creates manifest with checksums
8. Cleans up backups older than 7 days
9. Sends notification on completion/failure

**Retention:** 7 days

**Location:** `/root/airgen/backups/daily/YYYYMMDD/`

**Files created:**
- `neo4j-YYYYMMDD-HHMMSS.dump.gz` - Neo4j database
- `postgres-YYYYMMDD-HHMMSS.sql.gz` - PostgreSQL database
- `workspace-YYYYMMDD-HHMMSS.tar.gz` - Workspace files
- `config-YYYYMMDD-HHMMSS.tar.gz` - Configuration files
- `MANIFEST.txt` - Checksums and metadata

### Weekly Backup Script

**Script:** `/root/airgen/scripts/backup-weekly.sh`

**What it does:**
1. Everything from daily backup, plus:
2. Full Docker volume snapshots (Neo4j and PostgreSQL)
3. Uploads to remote storage using restic (if configured)
4. Prunes old remote backups (keeps 12 weeks)
5. Cleans up local backups older than 4 weeks

**Retention:** 4 weeks local, 12 weeks remote

**Location:** `/root/airgen/backups/weekly/week-YYYY-WNN/`

**Additional files:**
- `neo4j-volume-YYYYMMDD-HHMMSS.tar.gz` - Full Neo4j volume
- `postgres-volume-YYYYMMDD-HHMMSS.tar.gz` - Full PostgreSQL volume

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

- **Neo4j**: Stops container, loads dump with `--overwrite-destination`, restarts
- **PostgreSQL**: Drops and recreates database, restores from dump
- **Workspace**: Backs up existing workspace before restore, extracts archive
- **Config**: Restores environment files and docker-compose configs

## Remote Backup Configuration

To enable remote backups (recommended for production):

### Using AWS S3

```bash
# Add to /root/.bashrc or /etc/environment
export RESTIC_REPOSITORY="s3:s3.amazonaws.com/your-bucket-name/airgen-backups"
export RESTIC_PASSWORD="your-encryption-password"
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
```

### Using DigitalOcean Spaces

```bash
export RESTIC_REPOSITORY="s3:nyc3.digitaloceanspaces.com/your-space-name/airgen-backups"
export RESTIC_PASSWORD="your-encryption-password"
export AWS_ACCESS_KEY_ID="your-spaces-key"
export AWS_SECRET_ACCESS_KEY="your-spaces-secret"
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

# 3. Restore only workspace
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251009 --component=workspace
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

# 3. Restore from remote backup (if configured)
export RESTIC_REPOSITORY="s3:..."
export RESTIC_PASSWORD="..."
restic restore latest --target /root/airgen/backups/restore/

# 4. Restore all components
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/restore/week-YYYY-WNN

# 5. Start services
docker-compose -f docker-compose.prod.yml up -d
```

**Recovery Time:** 1-2 hours
**Data Loss:** <7 days (or zero if using remote backups)

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

## Workspace Git Protection

As of this implementation, workspace files are now tracked in git (selectively):

**Tracked:**
- All `.md` files (requirements, documents)
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

### 2025-10-09 - Initial Implementation

- Created 3-tier backup strategy
- Implemented daily/weekly backup scripts
- Added verification and restore capabilities
- Configured remote backup support
- Added workspace git tracking
- Set up automated cron jobs
- Created comprehensive documentation

---

**Last Updated:** 2025-10-09
**Version:** 1.0
**Author:** AirGen Backup System
