# AIRGen Backup & Restore System

## Overview

The AIRGen backup system provides comprehensive protection for your requirements engineering data through automated daily and weekly backups with built-in verification and restoration capabilities.

## Components Backed Up

### 1. Neo4j Graph Database (Primary Data Store)
- **Method**: Full volume backup (tar.gz)
- **Includes**: ALL node types and relationships
- **Strategy**: Stop container → Backup → Restart
- **Verified Node Types**:
  - Core: Tenant, Project, Document, DocumentSection, DocumentContentBlock, Requirement, Folder
  - Traceability: TraceLink, DocumentLinkset
  - Versioning: RequirementVersion, DocumentVersion, TraceLinkVersion, DocumentLinksetVersion
  - Architecture: ArchitectureDiagram, ArchitectureBlock, ArchitectureConnector (+ versions)
  - Candidates: RequirementCandidate, DiagramCandidate

### 2. PostgreSQL Database (Session/Auth)
- **Method**: pg_dump with compression
- **Use**: User sessions, authentication tokens
- **Optional**: May not be present in all deployments

### 3. Workspace Files
- **Location**: `/root/airgen/backend/workspace`
- **Contains**: Tenant/project file artifacts
- **Method**: Compressed tar archive

### 4. Configuration
- **Includes**: Environment files, docker-compose configs, git state
- **Purpose**: Restore exact deployment configuration

## Backup Schedule

### Daily Backups
- **Frequency**: Every day at 2:00 AM (configurable via cron)
- **Retention**: 7 days
- **Location**: `/root/airgen/backups/daily/<YYYYMMDD>/`
- **Script**: `/root/airgen/scripts/backup-daily.sh`

### Weekly Backups
- **Frequency**: Every Sunday at 3:00 AM
- **Retention**: 4 weeks
- **Location**: `/root/airgen/backups/weekly/<YYYYMMDD>/`
- **Script**: `/root/airgen/scripts/backup-weekly.sh`

## Backup Structure

```
/root/airgen/backups/
├── daily/
│   ├── 20251010/
│   │   ├── neo4j-20251010-020001.tar.gz    # Graph database
│   │   ├── postgres-20251010-020005.sql.gz # PostgreSQL (optional)
│   │   ├── workspace-20251010-020010.tar.gz # Workspace files
│   │   ├── config-20251010-020015.tar.gz   # Configuration
│   │   └── MANIFEST.txt                    # Checksums & metadata
│   └── ...
├── weekly/
│   └── ...
└── logs/
    └── backup.log
```

## Running Manual Backups

```bash
# Run a daily backup manually
/root/airgen/scripts/backup-daily.sh

# Run a weekly backup manually
/root/airgen/scripts/backup-weekly.sh
```

## Restoring from Backup

### Full System Restore

```bash
# Interactive restore (with 10-second safety delay)
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251010

# Dry run (show what would be restored without actually doing it)
/root/airgen/scripts/backup-restore.sh /root/airgen/backups/daily/20251010 --dry-run
```

### Component-Specific Restore

```bash
# Restore only Neo4j
./backup-restore.sh /root/airgen/backups/daily/20251010 --component=neo4j

# Restore only workspace files
./backup-restore.sh /root/airgen/backups/daily/20251010 --component=workspace

# Available components: neo4j, postgres, workspace, config, all
```

### Post-Restore Process

The restore script automatically:
1. **Stops services** and clears existing data
2. **Extracts backup** archives to appropriate locations
3. **Restarts services** and waits for readiness
4. **Runs cleanup scripts** to fix duplicate nodes
5. **Verifies data integrity** using the verification script

## Data Verification

After each restore, the system automatically verifies:

### Node Type Verification
- Checks for all 22 expected node types
- Reports missing or unexpected types
- Validates counts and relationships

### Relationship Verification
- Verifies 12 critical relationship types exist
- Checks connection integrity

### Data Integrity Checks
- Tenants have projects
- Projects have documents
- Requirements are connected to documents
- TraceLinks have corresponding DocumentLinksets
- No orphaned nodes

### Running Verification Manually

```bash
# Standard verification
npx tsx /root/airgen/scripts/verify-restore-data.ts

# Strict mode (fail on any missing type)
npx tsx /root/airgen/scripts/verify-restore-data.ts --strict

# JSON output for automation
npx tsx /root/airgen/scripts/verify-restore-data.ts --json
```

## Troubleshooting

### Missing DocumentLinksets

If post-restore verification reports missing DocumentLinksets:

```bash
# Check for trace links without linksets
GRAPH_URL=bolt://localhost:17687 \
GRAPH_USERNAME=neo4j \
GRAPH_PASSWORD=airgen-graph \
GRAPH_DATABASE=neo4j \
npx tsx /root/airgen/backend/check-linksets-correct.ts

# Reconstruct missing linksets from trace links
GRAPH_URL=bolt://localhost:17687 \
GRAPH_USERNAME=neo4j \
GRAPH_PASSWORD=airgen-graph \
GRAPH_DATABASE=neo4j \
npx tsx /root/airgen/backend/reconstruct-linksets.ts
```

### Orphaned Requirements

If requirements aren't connected to documents:

```bash
# Check requirement structure
GRAPH_URL=bolt://localhost:17687 \
GRAPH_USERNAME=neo4j \
GRAPH_PASSWORD=airgen-graph \
GRAPH_DATABASE=neo4j \
npx tsx /root/airgen/backend/check-requirements-structure.ts
```

### Duplicate Nodes

The post-restore cleanup automatically handles duplicates, but if issues persist:

```bash
# Run cleanup manually
cd /root/airgen/backend
npx tsx ../scripts/post-restore-cleanup.ts --dry-run  # Preview
npx tsx ../scripts/post-restore-cleanup.ts            # Execute
```

## Backup Best Practices

### 1. Monitor Backup Success
- Check `/root/airgen/backups/logs/backup.log` regularly
- Set up notifications (Pushover supported)
- Verify backups complete successfully

### 2. Test Restores Periodically
```bash
# Test restore in dry-run mode quarterly
./backup-restore.sh /root/airgen/backups/daily/$(date +%Y%m%d) --dry-run
```

### 3. Off-Site Backups
The system supports Restic for off-site backups:
```bash
export RESTIC_REPOSITORY="s3:https://your-endpoint/bucket"
export RESTIC_PASSWORD="your-secure-password"
# See backup-verify.sh for Restic configuration
```

### 4. Disk Space Management
- Daily backups retained for 7 days
- Weekly backups retained for 4 weeks
- Automatic cleanup of old backups
- Monitor available space (minimum 2GB required)

### 5. Before Major Changes
Always create a manual backup before:
- Upgrading AIRGen version
- Modifying database schema
- Bulk data operations
- Production deployments

```bash
# Create timestamped manual backup
mkdir -p /root/airgen/backups/manual
/root/airgen/scripts/backup-daily.sh
cp -r /root/airgen/backups/daily/$(date +%Y%m%d) \
     /root/airgen/backups/manual/pre-upgrade-$(date +%Y%m%d-%H%M%S)
```

## Recovery Scenarios

### Scenario 1: Accidental Data Deletion
1. Identify when deletion occurred
2. Find nearest backup before deletion
3. Restore specific component (usually neo4j)
4. Verify data integrity

### Scenario 2: Corrupted Database
1. Check backup logs for last successful backup
2. Perform full restore from that backup
3. Run verification script
4. Check for missing data

### Scenario 3: Disaster Recovery
1. Restore from most recent weekly backup
2. Apply daily differential backups if available
3. Run full verification
4. Manually reconcile any missing recent changes

## Scripts Reference

| Script | Purpose | Frequency |
|--------|---------|-----------|
| `backup-daily.sh` | Daily incremental backup | Daily 2AM |
| `backup-weekly.sh` | Weekly comprehensive backup | Sunday 3AM |
| `backup-restore.sh` | Restore from backup | Manual |
| `backup-verify.sh` | Verify backup integrity | After each backup |
| `backup-lib.sh` | Shared backup functions | Library |
| `verify-restore-data.ts` | Post-restore data verification | After restore |
| `check-all-node-types.ts` | Analyze database structure | Manual |
| `reconstruct-linksets.ts` | Rebuild missing linksets | Recovery |

## Environment Variables

```bash
# Neo4j Connection
GRAPH_URL=bolt://localhost:17687
GRAPH_USERNAME=neo4j
GRAPH_PASSWORD=airgen-graph
GRAPH_DATABASE=neo4j

# Backup Locations (configured in backup-lib.sh)
BACKUP_ROOT=/root/airgen/backups
PROJECT_ROOT=/root/airgen
WORKSPACE_DIR=/root/airgen/backend/workspace

# Docker Containers
NEO4J_CONTAINER=airgen_dev_neo4j_1
POSTGRES_CONTAINER=airgen_dev_postgres_1
```

## Notifications

The backup system supports Pushover notifications:

- ✅ Backup success
- ⚠️ Backup completed with warnings
- ❌ Backup failed
- 📦 Restore completed

Configure at `/opt/pushover/config.py`

## Maintenance

### Check Backup Status
```bash
# View recent backups
ls -lh /root/airgen/backups/daily/
ls -lh /root/airgen/backups/weekly/

# Check backup log
tail -f /root/airgen/backups/logs/backup.log

# Verify latest backup
/root/airgen/scripts/backup-verify.sh /root/airgen/backups/daily/$(date +%Y%m%d)
```

### Update Retention Policies
Edit `/root/airgen/scripts/backup-lib.sh`:
```bash
DAILY_RETENTION_DAYS=7    # Increase for longer retention
WEEKLY_RETENTION_WEEKS=4  # Keep more weekly backups
```

## Support

For issues or questions:
1. Check logs: `/root/airgen/backups/logs/backup.log`
2. Run verification: `npx tsx scripts/verify-restore-data.ts`
3. Review this documentation
4. Contact system administrator

---

**Last Updated**: 2025-10-10
**Version**: 1.1 (Added data verification and linkset reconstruction)
