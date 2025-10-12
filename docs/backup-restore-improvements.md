# Backup/Restore Improvements

## Issue Summary

During the October 10, 2025 backup restore, we encountered duplicate Project nodes in the Neo4j database:

- **Root Cause**: Manual recovery attempts before the restore created duplicate empty Project nodes
- **Symptom**: After restore, the Tenant was connected to the empty duplicate instead of the original Project with data
- **Impact**: Graph viewer showed only 2 nodes (Tenant + empty Project) instead of all 32 requirements and 5 documents

## Solution Implemented

### 1. Post-Restore Cleanup Script

**Location**: `/root/airgen/scripts/post-restore-cleanup.ts`

**Purpose**: Automatically detects and fixes data integrity issues after a backup restore.

**Features**:
- **Detects duplicate Project nodes**: Finds projects with the same `slug` but different IDs/keys
- **Identifies the real project**: Chooses the project with the most data (documents + requirements)
- **Moves relationships**: Transfers all relationships from empty duplicates to the real project
- **Cleans up**: Deletes empty duplicate nodes
- **Verifies connections**: Ensures all Tenants are connected to valid Projects with data
- **Detects orphaned relationships**: Finds and removes relationships pointing to deleted nodes
- **Dry-run mode**: Can test without making changes using `--dry-run` flag

**Usage**:
```bash
# Dry run (no changes)
cd backend
npx tsx ../scripts/post-restore-cleanup.ts --dry-run

# Live mode (applies fixes)
npx tsx ../scripts/post-restore-cleanup.ts
```

**Example Output**:
```
🔍 POST-RESTORE CLEANUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mode: LIVE (will make changes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Step 1: Detecting duplicate Project nodes...
⚠️  Found 1 project(s) with duplicates:

   Project slug: "main-battle-tank"
     - ID 3, key="MBT": 14 docs, 32 reqs, tenant=NO
     - ID 217, key="main-battle-tank": 0 docs, 32 reqs, tenant=YES

🔧 Fixing duplicate project: "main-battle-tank"
   Real project: ID 3 (key="MBT")
   Empty duplicates: ID 217
   Moving relationships from ID 217...
   ✅ Deleted duplicate ID 217
   Reconnecting Tenant to real project...
   ✅ Tenant reconnected
✅ Fixed duplicate project "main-battle-tank"

📊 Step 3: Verifying Tenant → Project connections...
   Tenant → Project connections:
   ✅ hollando → demo-airgen (ID 216): 34 docs, 120 reqs
   ✅ hollando → main-battle-tank (ID 3): 14 docs, 32 reqs

📊 Step 4: Checking for orphaned relationships...
✅ No orphaned relationships found

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ POST-RESTORE CLEANUP COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. Enhanced Backup Restore Script

**Location**: `/root/airgen/scripts/backup-restore.sh`

**Changes**:
- **Automatic cleanup**: Now automatically runs `post-restore-cleanup.ts` after Neo4j restoration
- **Graceful handling**: If npx is not available, provides manual instructions
- **Logging**: Clear indication of cleanup progress and results

**Modified Restore Flow**:
```
1. Stop Neo4j container
2. Clear existing data
3. Extract backup archive
4. Start Neo4j container
5. Wait for Neo4j to be ready
6. ✨ NEW: Run post-restore cleanup automatically
7. Verify restoration success
```

## Prevention Measures

### Best Practices Going Forward

1. **Avoid Manual Recovery**:
   - If data loss occurs, restore from backup immediately
   - Don't attempt to manually recreate nodes before restoring
   - Manual recovery can create duplicates that conflict with restored data

2. **Always Run Post-Restore Cleanup**:
   - The cleanup script now runs automatically during restore
   - If you restore manually, run the cleanup script after:
     ```bash
     cd backend && npx tsx ../scripts/post-restore-cleanup.ts
     ```

3. **Test Restores Periodically**:
   - Run test restores in development to verify backup integrity
   - Use `--dry-run` flag to preview changes without applying them

4. **Monitor for Duplicates**:
   - Post-restore cleanup will log any duplicates it finds
   - Review cleanup logs after each restore
   - Investigate why duplicates appeared (manual intervention? script errors?)

## Technical Details

### How Duplicate Detection Works

```cypher
// Find projects with same slug but multiple IDs
MATCH (p:Project)
WITH p.slug as slug, collect(p) as projects
WHERE size(projects) > 1

// For each duplicate, count data to identify the real one
UNWIND projects as proj
OPTIONAL MATCH (proj)-[:HAS_DOCUMENT]->(doc:Document)
OPTIONAL MATCH (proj)-[:CONTAINS]->(req:Requirement)
RETURN slug,
       id(proj) as projectId,
       count(DISTINCT doc) as docCount,
       count(DISTINCT req) as reqCount
```

### How Cleanup Fixes Duplicates

1. **Identify Real Project**: Choose the one with most documents + requirements
2. **Move Outgoing Relationships**:
   ```cypher
   MATCH (empty:Project)-[r]->(target)
   MATCH (real:Project)
   CREATE (real)-[newRel:${type(r)}]->(target)
   SET newRel = properties(r)
   DELETE r
   ```
3. **Move Incoming Relationships**:
   ```cypher
   MATCH (source)-[r:OWNS]->(empty:Project)
   MATCH (real:Project)
   MERGE (source)-[:OWNS]->(real)  // Use MERGE to avoid duplicate OWNS
   DELETE r
   ```
4. **Delete Empty Duplicate**:
   ```cypher
   MATCH (p:Project) WHERE id(p) = $emptyId
   DETACH DELETE p
   ```

## Testing

### Verify the Fix

After running cleanup, verify data integrity:

```bash
# 1. Check for duplicates (should return 0)
cd backend
npx tsx ../scripts/post-restore-cleanup.ts --dry-run

# 2. Verify graph data is accessible
# Visit: http://localhost:5173/graph-viewer
# Expected: Should see all nodes (requirements, documents, sections, etc.)

# 3. Check Tenant connections in Neo4j Browser
# Visit: http://localhost:17474
MATCH (t:Tenant)-[:OWNS]->(p:Project)
OPTIONAL MATCH (p)-[:HAS_DOCUMENT]->(doc:Document)
WHERE doc.deletedAt IS NULL
OPTIONAL MATCH (p)-[:CONTAINS]->(req:Requirement)
WHERE (req.archived IS NULL OR req.archived = false)
RETURN t.slug, p.slug, count(DISTINCT doc) as docs, count(DISTINCT req) as reqs
```

Expected output:
```
t.slug      p.slug            docs  reqs
hollando    demo-airgen       0     34
hollando    main-battle-tank  5     32
```

## Related Files

- `/root/airgen/scripts/post-restore-cleanup.ts` - Main cleanup script
- `/root/airgen/scripts/backup-restore.sh` - Enhanced restore script
- `/root/airgen/backend/fix-duplicate-projects.ts` - One-time fix script (can be deleted)
- `/root/airgen/backend/test-graph-query.ts` - Verification script

## Rollback Plan

If post-restore cleanup causes issues:

1. **Stop the cleanup**:
   ```bash
   # Edit backup-restore.sh and comment out the cleanup call
   # Lines 220-232
   ```

2. **Restore from backup again**:
   ```bash
   ./scripts/backup-restore.sh /path/to/backup --component=neo4j
   ```

3. **Run cleanup manually** (if needed):
   ```bash
   cd backend && npx tsx ../scripts/post-restore-cleanup.ts --dry-run
   # Review output, then run without --dry-run if safe
   ```

## Future Improvements

Potential enhancements for consideration:

1. **Pre-restore duplicate detection**: Run cleanup before restore to detect existing issues
2. **Automated duplicate prevention**: Add constraints to Neo4j schema to prevent duplicates
3. **Enhanced logging**: Store cleanup logs with timestamps for audit trail
4. **Rollback capability**: Create snapshot before cleanup to allow rollback
5. **Email notifications**: Alert admins if duplicates are found and fixed

## Changelog

- **2025-10-10**: Initial implementation after data recovery incident
- **2025-10-10**: Integrated into backup-restore.sh for automatic execution
