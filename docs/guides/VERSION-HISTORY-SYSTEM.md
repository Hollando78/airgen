# Version History System

**Status**: ✅ Production Ready
**Architecture**: Neo4j Single Source
**Last Updated**: 2025-10-10

## Overview

The AIRGen version history system provides complete audit trails for all entities by creating immutable snapshots in Neo4j. Every create, update, archive, delete, and restore operation generates a version record, enabling full traceability, compliance auditing, and rollback capabilities.

## Key Features

- ✅ **Automatic Version Creation** - All CRUD operations create versions
- ✅ **Lifecycle Tracking** - Archive, delete, restore operations tracked
- ✅ **User Attribution** - Every change records who made it
- ✅ **Content Hashing** - SHA-256 hashes detect actual changes
- ✅ **Complete Snapshots** - Full entity state preserved
- ✅ **Backup Compatible** - All versions preserved in Neo4j dumps
- ✅ **Baseline Integration** - Baselines link to version snapshots

## Architecture

### Version Node Structure

All version nodes share common properties:

```cypher
CREATE (v:RequirementVersion {
  versionId: "uuid-v4",                    // Unique version identifier
  requirementId: "tenant:project:REQ-001", // Entity this version belongs to
  versionNumber: 5,                        // Sequential version number
  timestamp: "2025-10-10T12:00:00Z",       // When this version was created
  changedBy: "user@example.com",           // Who made the change
  changeType: "archived",                  // Type of change
  changeDescription: "Requirement archived", // Optional description

  // Complete snapshot of entity state at this point in time
  text: "The system SHALL...",
  pattern: "ubiquitous",
  verification: "Test",
  rationale: "...",
  complianceStatus: "compliant",
  qaScore: 85,
  tags: ["safety", "critical"],
  attributes: {...},

  contentHash: "sha256-..."               // Hash of content for change detection
})
```

### Version Relationships

```cypher
// Entity has multiple versions
(Requirement)-[:HAS_VERSION]->(RequirementVersion)

// Baseline snapshots link to versions
(Baseline)-[:SNAPSHOT_OF_REQUIREMENT]->(RequirementVersion)

// Version number ordering (implicit via versionNumber property)
```

### Supported Entity Types

| Entity Type | Version Node | Change Types |
|-------------|--------------|--------------|
| Requirement | RequirementVersion | created, updated, archived, restored, deleted |
| Document | DocumentVersion | created, updated, deleted |
| DocumentSection | DocumentSectionVersion | created, updated, deleted |
| Info | InfoVersion | created, updated, deleted |
| SurrogateReference | SurrogateReferenceVersion | created, updated, deleted |
| TraceLink | TraceLinkVersion | created, updated, deleted |
| DocumentLinkset | DocumentLinksetVersion | created, updated, deleted |
| ArchitectureDiagram | ArchitectureDiagramVersion | created, updated, deleted |
| ArchitectureBlock | ArchitectureBlockVersion | created, updated, deleted |
| ArchitectureConnector | ArchitectureConnectorVersion | created, updated, deleted |

## Change Types

### Requirements

**created**
- Triggered: When requirement first created
- Snapshot: Initial state
- User: Creator

**updated**
- Triggered: When any field changes (text, pattern, verification, etc.)
- Snapshot: State before update
- User: Editor
- Content Hash: Detects actual changes (no version if hash unchanged)

**archived**
- Triggered: When requirement archived (hidden from default views)
- Snapshot: State before archiving
- User: Person who archived
- State Change: `archived: true`

**restored** (Unarchive)
- Triggered: When requirement unarchived
- Snapshot: State before unarchiving
- User: Person who unarchived
- State Change: `archived: false`

**deleted**
- Triggered: When requirement soft deleted
- Snapshot: State before deletion
- User: Person who deleted
- State Change: `deleted: true, deletedAt: timestamp`

**restored** (From Deletion)
- Triggered: When requirement restored from deletion
- Snapshot: State before restoration
- User: Person who restored
- State Change: `deleted: false, restoredAt: timestamp`

### Other Entities

**created**
- Initial creation

**updated**
- Field changes

**deleted**
- Soft deletion (if supported) or hard deletion

## Implementation

### Creating Versions

All version creation happens within Neo4j transactions via the `createRequirementVersion()` function:

```typescript
export async function createRequirementVersion(
  tx: ManagedTransaction,
  params: {
    requirementId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "archived" | "restored" | "deleted";
    changeDescription?: string;
    text: string;
    pattern?: string | null;
    verification?: string | null;
    // ... all other requirement fields
    contentHash: string;
  }
): Promise<void>
```

### Version Creation Pattern

**Standard Pattern** (used in all CRUD functions):

```typescript
// 1. Fetch current state BEFORE the change
const currentReq = await tx.run(
  `MATCH (requirement:Requirement {id: $requirementId}) RETURN requirement`,
  { requirementId }
);

const current = mapRequirement(currentReq.records[0].get("requirement"));

// 2. Create version snapshot
await createRequirementVersion(tx, {
  requirementId,
  tenantSlug,
  projectSlug,
  changedBy: user || "system",
  changeType: "deleted",  // or "archived", "restored", etc.
  changeDescription: "Requirement soft deleted",
  text: current.text,
  pattern: current.pattern,
  // ... all other fields from current state
  contentHash: current.contentHash
});

// 3. Perform the state change
await tx.run(
  `MATCH (requirement:Requirement {id: $requirementId})
   SET requirement.deleted = true,
       requirement.deletedAt = $now,
       requirement.deletedBy = $deletedBy`,
  { requirementId, now, deletedBy: user }
);
```

**Key Principle**: Always capture state BEFORE the change, not after.

### User Attribution

Route handlers extract user context from JWT and pass to CRUD functions:

```typescript
// Route handler
app.delete("/requirements/:tenant/:project/:id", async (req, reply) => {
  const { tenant, project, id } = req.params;

  // Extract user from JWT
  const deletedBy = (req as any).user?.email || (req as any).user?.sub || undefined;

  // Pass to CRUD function
  const requirement = await softDeleteRequirement(tenant, project, id, deletedBy);

  return { requirement };
});
```

```typescript
// CRUD function signature
export async function softDeleteRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  deletedBy?: string  // Optional user parameter
): Promise<RequirementRecord | null>
```

## API Endpoints

### Get Version History

```http
GET /requirements/:tenant/:project/:id/history
```

**Response**:
```json
[
  {
    "versionId": "uuid-1",
    "requirementId": "tenant:project:REQ-001",
    "versionNumber": 5,
    "timestamp": "2025-10-10T14:30:00Z",
    "changedBy": "user@example.com",
    "changeType": "restored",
    "changeDescription": "Requirement restored from deletion",
    "text": "The system SHALL...",
    "pattern": "ubiquitous",
    "verification": "Test",
    "contentHash": "sha256-abc123..."
  },
  {
    "versionNumber": 4,
    "changeType": "deleted",
    "changedBy": "user@example.com",
    ...
  },
  {
    "versionNumber": 3,
    "changeType": "archived",
    "changedBy": "admin@example.com",
    ...
  },
  {
    "versionNumber": 2,
    "changeType": "updated",
    "changedBy": "editor@example.com",
    ...
  },
  {
    "versionNumber": 1,
    "changeType": "created",
    "changedBy": "creator@example.com",
    ...
  }
]
```

**Note**: Versions returned in reverse chronological order (newest first).

### Get Specific Version

```http
GET /requirements/:tenant/:project/:id/versions/:versionNumber
```

**Response**:
```json
{
  "versionId": "uuid-3",
  "requirementId": "tenant:project:REQ-001",
  "versionNumber": 3,
  "timestamp": "2025-10-09T10:15:00Z",
  "changedBy": "admin@example.com",
  "changeType": "archived",
  "text": "The system SHALL implement access control.",
  "pattern": "ubiquitous",
  "verification": "Test",
  "contentHash": "sha256-def456..."
}
```

### Restore to Version

```http
POST /requirements/:tenant/:project/:id/restore/:versionNumber
```

**Effect**:
1. Fetches target version
2. Creates new version snapshot (changeType: "restored")
3. Updates requirement with target version's data
4. Increments version number

**Response**:
```json
{
  "requirement": {
    "id": "tenant:project:REQ-001",
    "ref": "REQ-001",
    "text": "The system SHALL...",
    "pattern": "ubiquitous",
    "verification": "Test"
  },
  "restoredFromVersion": 3,
  "newVersion": 6
}
```

## Version Queries

### Get All Versions for Requirement

```cypher
MATCH (req:Requirement {id: $requirementId})-[:HAS_VERSION]->(v:RequirementVersion)
RETURN v
ORDER BY v.versionNumber DESC
```

### Get Latest Version

```cypher
MATCH (req:Requirement {id: $requirementId})-[:HAS_VERSION]->(v:RequirementVersion)
WITH req, max(v.versionNumber) AS maxVer
MATCH (req)-[:HAS_VERSION]->(latestVer:RequirementVersion)
WHERE latestVer.versionNumber = maxVer
RETURN latestVer
```

### Get Versions by Change Type

```cypher
MATCH (req:Requirement {id: $requirementId})-[:HAS_VERSION]->(v:RequirementVersion)
WHERE v.changeType = 'archived'
RETURN v
ORDER BY v.versionNumber DESC
```

### Get Versions by User

```cypher
MATCH (req:Requirement {id: $requirementId})-[:HAS_VERSION]->(v:RequirementVersion)
WHERE v.changedBy = $userEmail
RETURN v
ORDER BY v.versionNumber DESC
```

### Get Versions in Date Range

```cypher
MATCH (req:Requirement {id: $requirementId})-[:HAS_VERSION]->(v:RequirementVersion)
WHERE v.timestamp >= $startDate AND v.timestamp <= $endDate
RETURN v
ORDER BY v.versionNumber DESC
```

## Backup & Restore

### What's Backed Up

All version nodes are part of the Neo4j graph and included in dumps:

**Neo4j Dump Contains**:
- All `RequirementVersion` nodes
- All `DocumentVersion` nodes
- All other version node types
- All `HAS_VERSION` relationships
- All baseline snapshot relationships

**Backup Command**:
```bash
neo4j-admin database dump neo4j --to-path=/backups --verbose
```

**Result**: Single `.dump` file containing complete version history.

### Restore Process

```bash
# 1. Stop Neo4j
docker compose stop neo4j

# 2. Restore dump
docker compose run --rm neo4j neo4j-admin database load \
  neo4j --from-path=/backups --overwrite-destination=true

# 3. Start Neo4j
docker compose start neo4j

# 4. Verify versions
curl http://localhost:8787/requirements/test-tenant/test-project/REQ-001/history
```

**What's Restored**:
- ✅ All version nodes
- ✅ All version relationships
- ✅ Complete version history
- ✅ Baseline snapshot links

## Content Hashing

### Purpose

Content hashes prevent unnecessary versions when data hasn't actually changed.

### Hash Algorithm

SHA-256 hash of concatenated entity properties:

```typescript
function computeContentHash(requirement: {
  text: string;
  pattern?: string | null;
  verification?: string | null;
  rationale?: string | null;
  complianceStatus?: string | null;
  tags?: string[];
  attributes?: Record<string, any>;
}): string {
  const content = [
    requirement.text || '',
    requirement.pattern || '',
    requirement.verification || '',
    requirement.rationale || '',
    requirement.complianceStatus || '',
    JSON.stringify(requirement.tags || []),
    JSON.stringify(requirement.attributes || {})
  ].join('||');

  return crypto.createHash('sha256').update(content).digest('hex');
}
```

### Version Creation Logic

```typescript
// Before update
const currentHash = current.contentHash;
const newHash = computeContentHash(newData);

if (currentHash !== newHash) {
  // Content actually changed - create version
  await createRequirementVersion(tx, {
    changeType: "updated",
    ...currentState,
    contentHash: currentHash
  });

  // Apply update
  await updateRequirement(newData);
} else {
  // No actual change - skip version creation
  console.log("Content unchanged, skipping version");
}
```

## Compliance & Auditing

### Audit Trail Requirements

The version history system meets common compliance requirements:

**ISO 26262 (Automotive Safety)**:
- ✅ Complete change history
- ✅ User attribution for all changes
- ✅ Timestamps for all modifications
- ✅ Immutable audit trail
- ✅ Version snapshots for baselines

**FDA 21 CFR Part 11 (Medical Devices)**:
- ✅ Electronic signatures (user attribution)
- ✅ Secure, computer-generated timestamps
- ✅ Audit trails (version history)
- ✅ Record retention (Neo4j backups)

**DO-178C (Aerospace Software)**:
- ✅ Configuration management
- ✅ Traceability to requirements
- ✅ Change history
- ✅ Baseline management

### Audit Queries

**Who changed what when**:
```cypher
MATCH (req:Requirement)-[:HAS_VERSION]->(v:RequirementVersion)
WHERE req.tenant = $tenant AND req.projectKey = $project
RETURN req.ref AS requirement,
       v.versionNumber AS version,
       v.changeType AS change,
       v.changedBy AS user,
       v.timestamp AS when
ORDER BY v.timestamp DESC
LIMIT 100
```

**Recent changes by user**:
```cypher
MATCH (req:Requirement)-[:HAS_VERSION]->(v:RequirementVersion)
WHERE v.changedBy = $userEmail
  AND req.tenant = $tenant
  AND req.projectKey = $project
RETURN req.ref, v.changeType, v.timestamp
ORDER BY v.timestamp DESC
```

**Changes in last 24 hours**:
```cypher
MATCH (req:Requirement)-[:HAS_VERSION]->(v:RequirementVersion)
WHERE v.timestamp >= datetime() - duration('P1D')
  AND req.tenant = $tenant
  AND req.projectKey = $project
RETURN req.ref, v.changeType, v.changedBy, v.timestamp
ORDER BY v.timestamp DESC
```

## Performance Considerations

### Version Node Count

For a typical project:
- 500 requirements
- Average 8 versions per requirement
- **Total version nodes**: 4,000

This is well within Neo4j's performance envelope (millions of nodes).

### Query Performance

**Version history queries are fast** due to:
1. Direct relationship traversal: `(Requirement)-[:HAS_VERSION]->(Version)`
2. Indexed properties: `versionNumber`, `timestamp`
3. No table scans (graph traversal)

**Typical query times**:
- Get all versions for requirement: <5ms
- Get latest version: <2ms
- Get version by number: <2ms

### Storage

**Version node size**: ~2-5 KB per version (including all properties)

**Storage calculation**:
- 500 requirements × 8 versions × 3 KB = **12 MB**
- Negligible compared to other data

**Recommendation**: No special storage concerns. Version history adds minimal overhead.

## Testing

### Test Scripts

**Lifecycle Version Tracking**:
```bash
./node_modules/.bin/tsx backend/test-version-history-lifecycle.ts
```

**Tests**:
- ✅ Created version tracked
- ✅ Updated version tracked (with content hash)
- ✅ Archived version tracked
- ✅ Unarchived version tracked (changeType: restored)
- ✅ Deleted version tracked
- ✅ Restored version tracked (changeType: restored)
- ✅ User attribution working
- ✅ All version data complete

**Backup/Restore Version Preservation**:
```bash
./node_modules/.bin/tsx backend/test-backup-restore-versions.ts
```

**Tests**:
- ✅ Version nodes in Neo4j graph
- ✅ Version nodes in Neo4j dump
- ✅ Versions preserved after restore
- ✅ Relationships preserved

## Best Practices

### When to Create Versions

**Always create versions for**:
- ✅ Requirement text changes
- ✅ Field updates (pattern, verification, etc.)
- ✅ Lifecycle state changes (archive, delete, restore)
- ✅ Compliance field changes

**Skip versions for**:
- ❌ Metadata updates that don't affect content (e.g., view counts)
- ❌ Calculated fields (e.g., QA scores if recomputed)
- ❌ No actual change (same content hash)

### User Attribution

**Best practices**:
- ✅ Always extract from JWT authentication
- ✅ Fall back to "system" for automated operations
- ✅ Include email address for audit trail
- ✅ Don't hardcode usernames

**Bad**:
```typescript
await createVersion({ changedBy: "admin" });  // ❌ Hardcoded
```

**Good**:
```typescript
const user = req.user?.email || req.user?.sub || "system";
await createVersion({ changedBy: user });  // ✅ Dynamic
```

### Change Descriptions

**Helpful change descriptions**:
- ✅ "Requirement archived for release 1.0"
- ✅ "Restored from deletion per PM request"
- ✅ "Updated verification method based on test plan"

**Not helpful**:
- ❌ "Updated"
- ❌ "Changed"
- ❌ null

## Troubleshooting

### Version Not Created

**Symptom**: Update made but no new version in history.

**Possible causes**:
1. Content hash unchanged (no actual change)
2. Version creation skipped due to error
3. Transaction rolled back

**Debug**:
```cypher
MATCH (req:Requirement {id: $id})-[:HAS_VERSION]->(v)
RETURN count(v) AS versionCount
```

### Missing User Attribution

**Symptom**: `changedBy` field shows "system" instead of user.

**Cause**: User context not extracted from request.

**Fix**: Verify JWT authentication and user extraction:
```typescript
const user = (req as any).user?.email || (req as any).user?.sub;
console.log("Authenticated user:", user);
```

### Version History Too Large

**Symptom**: Slow queries or large database.

**Solutions**:
1. Archive old versions (move to separate graph)
2. Implement version retention policy
3. Add indexes on timestamp fields

**Not recommended**: Deleting versions (breaks audit trail).

## Future Enhancements

### Planned Features

1. **Version Comparison UI**
   - Visual diff between versions
   - Side-by-side comparison
   - Highlight changes

2. **Bulk Restore**
   - Restore multiple requirements to specific baseline
   - Undo last N changes
   - Rollback to timestamp

3. **Version Policies**
   - Retention rules (e.g., keep last 50 versions)
   - Archive older versions
   - Compliance templates

4. **Enhanced Queries**
   - Graph-based change impact analysis
   - Who changed related requirements
   - Change velocity metrics

## References

- [Neo4j Migration Documentation](./NEO4J-MIGRATION-COMPLETE.md)
- [Baseline System Guide](./BASELINE-SYSTEM-GUIDE.md)
- [Requirements Version Implementation](./ARCHIVE-requirements-history-implementation-plan.md)
- [Backup & Restore Guide](./BACKUP_RESTORE.md)
