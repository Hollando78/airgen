# Baseline System Guide

**Status**: ✅ Production Ready
**Architecture**: Neo4j Single Source
**Last Updated**: 2025-10-10

## Overview

The AIRGen baseline system creates point-in-time snapshots of entire projects for release management, compliance auditing, and change tracking. Baselines capture complete project state including all requirements, documents, sections, trace links, and architecture elements—all stored in Neo4j with full backup/restore support.

## Key Features

- ✅ **Complete Project Snapshots** - All entity types captured
- ✅ **Version Links** - References actual version nodes (not copies)
- ✅ **Baseline Comparison** - Track changes between baselines
- ✅ **Neo4j Native** - Stored in graph, no file system dependency
- ✅ **Backup Compatible** - Fully preserved in Neo4j dumps
- ✅ **Lifecycle Support** - Captures lifecycle versions (archived, deleted, etc.)

## What is a Baseline?

A **baseline** is an immutable snapshot of a project at a specific point in time. It includes:

- All requirements (via version snapshots)
- All documents (via version snapshots)
- All document sections (via version snapshots)
- All trace links (via version snapshots)
- All linksets (via version snapshots)
- All architecture diagrams, blocks, and connectors (via version snapshots)
- All info items and surrogate references (via version snapshots)

Baselines are typically created at major milestones:
- Release candidates
- Production releases
- Compliance audits
- End of sprint/iteration
- Before major refactoring

## Architecture

### Baseline Node Structure

```cypher
CREATE (b:Baseline {
  // Identity
  id: "tenant:project:BL-PROJECT-001",
  ref: "BL-PROJECT-001",
  tenant: "acme",
  projectKey: "brake-system",

  // Metadata
  createdAt: "2025-10-10T12:00:00Z",
  author: "release-manager@acme.com",
  label: "Release 1.0 - Production",

  // Legacy requirement references (for backward compatibility)
  requirementRefs: ["REQ-001", "REQ-002", ...],

  // Version snapshot counts
  requirementVersionCount: 142,
  documentVersionCount: 5,
  documentSectionVersionCount: 18,
  infoVersionCount: 23,
  surrogateVersionCount: 8,
  traceLinkVersionCount: 89,
  linksetVersionCount: 3,
  diagramVersionCount: 4,
  blockVersionCount: 37,
  connectorVersionCount: 42
})
```

### Baseline Relationships

Baselines link to **version nodes**, not current entity nodes:

```cypher
// Project owns baseline
(Project)-[:HAS_BASELINE]->(Baseline)

// Baseline snapshots link to version nodes
(Baseline)-[:SNAPSHOT_OF_REQUIREMENT]->(RequirementVersion)
(Baseline)-[:SNAPSHOT_OF_DOCUMENT]->(DocumentVersion)
(Baseline)-[:SNAPSHOT_OF_SECTION]->(DocumentSectionVersion)
(Baseline)-[:SNAPSHOT_OF_INFO]->(InfoVersion)
(Baseline)-[:SNAPSHOT_OF_SURROGATE]->(SurrogateReferenceVersion)
(Baseline)-[:SNAPSHOT_OF_TRACE_LINK]->(TraceLinkVersion)
(Baseline)-[:SNAPSHOT_OF_LINKSET]->(DocumentLinksetVersion)
(Baseline)-[:SNAPSHOT_OF_DIAGRAM]->(ArchitectureDiagramVersion)
(Baseline)-[:SNAPSHOT_OF_BLOCK]->(ArchitectureBlockVersion)
(Baseline)-[:SNAPSHOT_OF_CONNECTOR]->(ArchitectureConnectorVersion)
```

**Key Insight**: Baselines reference **version nodes**, not entity nodes. This means:
- ✅ Baseline snapshots are immutable (version nodes never change)
- ✅ Multiple baselines can reference the same version node
- ✅ Efficient storage (no duplicate data)
- ✅ Complete audit trail preserved

### Baseline Reference Format

Baseline references follow the pattern: `BL-{PROJECT}-{NUMBER}`

Examples:
- `BL-BRAKESYSTEM-001`
- `BL-FLIGHTCONTROL-042`
- `BL-MEDICALDEVICE-123`

Number is zero-padded to 3 digits and auto-incremented per project.

## Creating Baselines

### API Endpoint

```http
POST /baseline
Content-Type: application/json

{
  "tenant": "acme",
  "projectKey": "brake-system",
  "label": "Release 1.0 - Production",
  "author": "release-manager@acme.com"
}
```

### Response

```json
{
  "id": "acme:brake-system:BL-BRAKESYSTEM-001",
  "ref": "BL-BRAKESYSTEM-001",
  "tenant": "acme",
  "projectKey": "brake-system",
  "createdAt": "2025-10-10T12:00:00.000Z",
  "author": "release-manager@acme.com",
  "label": "Release 1.0 - Production",
  "requirementRefs": ["REQ-001", "REQ-002", ...],
  "requirementVersionCount": 142,
  "documentVersionCount": 5,
  "documentSectionVersionCount": 18,
  "infoVersionCount": 23,
  "surrogateVersionCount": 8,
  "traceLinkVersionCount": 89,
  "linksetVersionCount": 3,
  "diagramVersionCount": 4,
  "blockVersionCount": 37,
  "connectorVersionCount": 42
}
```

### What Gets Captured

**For each entity type**, the baseline captures the **latest version** at the time of creation:

1. **Query for entities** (e.g., all requirements in project)
2. **Get latest version** for each entity (highest versionNumber)
3. **Link baseline to version nodes** via relationships

**Example for requirements**:

```cypher
// Get all requirements in project
MATCH (project:Project {slug: $projectSlug})-[:CONTAINS]->(req:Requirement)

// For each requirement, get latest version
WITH req, max(ver.versionNumber) AS maxVer
MATCH (req)-[:HAS_VERSION]->(latestVer:RequirementVersion)
WHERE latestVer.versionNumber = maxVer

// Link baseline to latest versions
MATCH (baseline:Baseline {id: $baselineId})
MERGE (baseline)-[:SNAPSHOT_OF_REQUIREMENT]->(latestVer)
```

### Baseline Creation Process

```
1. Generate baseline ref (BL-PROJECT-XXX)
   └── Increment project baseline counter

2. Collect all entities
   └── Requirements, documents, sections, trace links, etc.

3. Get latest version for each entity
   └── Query max(versionNumber) for each entity

4. Create baseline node
   └── Store metadata and version counts

5. Link to version snapshots
   └── Create SNAPSHOT_OF_* relationships

6. Return baseline record
   └── Complete baseline metadata
```

**Performance Optimization**: Version queries run in parallel batches to avoid memory issues with large projects.

## Listing Baselines

### API Endpoint

```http
GET /baselines/:tenant/:project
```

### Response

```json
[
  {
    "id": "acme:brake-system:BL-BRAKESYSTEM-003",
    "ref": "BL-BRAKESYSTEM-003",
    "tenant": "acme",
    "projectKey": "brake-system",
    "createdAt": "2025-10-15T10:00:00.000Z",
    "author": "release-manager@acme.com",
    "label": "Release 1.2 - Hotfix",
    "requirementVersionCount": 145,
    ...
  },
  {
    "id": "acme:brake-system:BL-BRAKESYSTEM-002",
    "ref": "BL-BRAKESYSTEM-002",
    "createdAt": "2025-10-12T14:30:00.000Z",
    "label": "Release 1.1 - Feature Update",
    ...
  },
  {
    "id": "acme:brake-system:BL-BRAKESYSTEM-001",
    "ref": "BL-BRAKESYSTEM-001",
    "createdAt": "2025-10-10T12:00:00.000Z",
    "label": "Release 1.0 - Production",
    ...
  }
]
```

**Note**: Baselines returned in reverse chronological order (newest first).

## Baseline Details

### API Endpoint

```http
GET /baselines/:tenant/:project/:baselineRef
```

### Response

```json
{
  "baseline": {
    "id": "acme:brake-system:BL-BRAKESYSTEM-001",
    "ref": "BL-BRAKESYSTEM-001",
    ...
  },
  "requirementVersions": [
    {
      "versionId": "uuid-1",
      "requirementId": "acme:brake-system:REQ-001",
      "versionNumber": 3,
      "changeType": "updated",
      "text": "The system SHALL...",
      "contentHash": "sha256-abc123...",
      ...
    },
    ...
  ],
  "documentVersions": [...],
  "documentSectionVersions": [...],
  "infoVersions": [...],
  "surrogateReferenceVersions": [...],
  "traceLinkVersions": [...],
  "linksetVersions": [...],
  "diagramVersions": [...],
  "blockVersions": [...],
  "connectorVersions": [...]
}
```

**Use Case**: Generate complete project export at baseline snapshot.

## Baseline Comparison

### API Endpoint

```http
POST /baselines/compare
Content-Type: application/json

{
  "tenant": "acme",
  "projectKey": "brake-system",
  "fromBaselineRef": "BL-BRAKESYSTEM-001",
  "toBaselineRef": "BL-BRAKESYSTEM-002"
}
```

### Response

```json
{
  "fromBaseline": {
    "ref": "BL-BRAKESYSTEM-001",
    "label": "Release 1.0",
    "createdAt": "2025-10-10T12:00:00.000Z"
  },
  "toBaseline": {
    "ref": "BL-BRAKESYSTEM-002",
    "label": "Release 1.1",
    "createdAt": "2025-10-12T14:30:00.000Z"
  },
  "requirements": {
    "added": [
      {
        "requirementId": "acme:brake-system:REQ-150",
        "text": "The system SHALL support emergency braking.",
        "versionNumber": 1,
        "changeType": "created",
        ...
      }
    ],
    "removed": [
      {
        "requirementId": "acme:brake-system:REQ-042",
        "text": "The system SHALL support manual override.",
        ...
      }
    ],
    "modified": [
      {
        "requirementId": "acme:brake-system:REQ-001",
        "text": "The system SHALL respond within 100ms.",
        "contentHash": "sha256-new...",
        // This is the version in "to" baseline
        ...
      }
    ],
    "unchanged": [
      {
        "requirementId": "acme:brake-system:REQ-010",
        ...
      }
    ]
  },
  "documents": {
    "added": [...],
    "removed": [...],
    "modified": [...],
    "unchanged": [...]
  },
  "traceLinks": {
    "added": [...],
    "removed": [...],
    "modified": [...],
    "unchanged": [...]
  },
  ...
}
```

### Comparison Algorithm

For each entity type:

1. **Build maps** of entity ID → version for both baselines
2. **Find added**: In "to" but not in "from"
3. **Find removed**: In "from" but not in "to"
4. **Find modified**: In both but different contentHash
5. **Find unchanged**: In both with same contentHash

```typescript
function compareEntities<T extends { contentHash: string }>(
  fromEntities: T[],
  toEntities: T[],
  getEntityId: (entity: T) => string
): EntityComparison<T> {
  const fromMap = new Map(fromEntities.map(e => [getEntityId(e), e]));
  const toMap = new Map(toEntities.map(e => [getEntityId(e), e]));

  const added = toEntities.filter(e => !fromMap.has(getEntityId(e)));
  const removed = fromEntities.filter(e => !toMap.has(getEntityId(e)));

  const modified = toEntities.filter(e => {
    const id = getEntityId(e);
    const fromEntity = fromMap.get(id);
    return fromEntity && fromEntity.contentHash !== e.contentHash;
  });

  const unchanged = toEntities.filter(e => {
    const id = getEntityId(e);
    const fromEntity = fromMap.get(id);
    return fromEntity && fromEntity.contentHash === e.contentHash;
  });

  return { added, removed, modified, unchanged };
}
```

**Key**: Comparison uses **contentHash** to detect changes, even if version numbers differ.

## Use Cases

### Release Management

**Scenario**: Track what changed between releases.

```
1. Create baseline before release candidate
   → BL-PROJECT-025 "Release 2.0 RC1"

2. Fix bugs, update requirements

3. Create baseline for release
   → BL-PROJECT-026 "Release 2.0 Final"

4. Compare baselines
   → See what changed between RC1 and Final
```

**Benefits**:
- Document all changes in release notes
- Verify only approved changes made it to release
- Audit trail for compliance

### Compliance Auditing

**Scenario**: Regulatory audit requires proof of requirements at certification date.

```
1. Create baseline at certification submission
   → BL-MEDICALDEVICE-042 "FDA Submission 510(k)"

2. Years later, auditor asks: "What requirements were in the submission?"

3. Retrieve baseline details
   → GET /baselines/acme/medical-device/BL-MEDICALDEVICE-042

4. Export all requirement versions from baseline
   → Complete snapshot of certified requirements
```

**Benefits**:
- Immutable record of certified state
- No risk of accidental changes
- Complete audit trail

### Sprint/Iteration Tracking

**Scenario**: Track progress across sprints.

```
Sprint 1 End: BL-PROJECT-010 "Sprint 1 Complete"
  → 45 requirements

Sprint 2 End: BL-PROJECT-011 "Sprint 2 Complete"
  → 58 requirements

Compare:
  → 15 requirements added
  → 2 requirements removed
  → 8 requirements modified
  → 40 unchanged
```

**Benefits**:
- Velocity metrics (requirements per sprint)
- Change tracking
- Team accountability

### Before Major Refactoring

**Scenario**: Ensure you can roll back if refactoring goes wrong.

```
1. Create baseline before refactoring
   → BL-PROJECT-100 "Before Architecture Refactor"

2. Perform refactoring

3. If issues found:
   → Compare current state to baseline
   → Restore affected requirements from baseline versions
```

**Benefits**:
- Safety net for risky changes
- Easy rollback
- Change impact analysis

## Baseline Queries

### Get All Baselines for Project

```cypher
MATCH (project:Project {slug: $projectSlug})-[:HAS_BASELINE]->(b:Baseline)
RETURN b
ORDER BY b.createdAt DESC
```

### Get Baseline with Version Snapshots

```cypher
MATCH (baseline:Baseline {ref: $baselineRef})
OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_REQUIREMENT]->(reqVer:RequirementVersion)
OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_DOCUMENT]->(docVer:DocumentVersion)
OPTIONAL MATCH (baseline)-[:SNAPSHOT_OF_TRACE_LINK]->(linkVer:TraceLinkVersion)
RETURN baseline,
       collect(DISTINCT reqVer) AS requirementVersions,
       collect(DISTINCT docVer) AS documentVersions,
       collect(DISTINCT linkVer) AS traceLinkVersions
```

### Find Baselines Containing Specific Requirement

```cypher
MATCH (req:Requirement {id: $requirementId})-[:HAS_VERSION]->(v:RequirementVersion)
MATCH (baseline:Baseline)-[:SNAPSHOT_OF_REQUIREMENT]->(v)
RETURN baseline
ORDER BY baseline.createdAt DESC
```

**Use Case**: "Which releases included this requirement?"

### Count Baselines Per Project

```cypher
MATCH (project:Project)-[:HAS_BASELINE]->(b:Baseline)
RETURN project.slug AS project, count(b) AS baselineCount
ORDER BY baselineCount DESC
```

## Backup & Restore

### What's Backed Up

Baselines are fully stored in Neo4j and included in dumps:

**Neo4j Dump Contains**:
- All `Baseline` nodes
- All version nodes (RequirementVersion, DocumentVersion, etc.)
- All `HAS_BASELINE` relationships
- All `SNAPSHOT_OF_*` relationships

**No File System Dependency**:
- ✅ No markdown files
- ✅ No JSON exports
- ✅ Everything in graph

### Backup Process

```bash
# Standard Neo4j dump includes all baselines
neo4j-admin database dump neo4j --to-path=/backups
```

**Result**: Single `.dump` file containing:
- All baseline nodes
- All version snapshots
- All relationships

### Restore Process

```bash
# 1. Stop Neo4j
docker compose stop neo4j

# 2. Restore dump (includes baselines)
docker compose run --rm neo4j neo4j-admin database load \
  neo4j --from-path=/backups --overwrite-destination=true

# 3. Start Neo4j
docker compose start neo4j

# 4. Verify baselines
curl http://localhost:8787/baselines/acme/brake-system
```

**What's Restored**:
- ✅ All baseline nodes
- ✅ All version snapshots
- ✅ All baseline→version relationships
- ✅ Complete baseline history

## Testing

### Test Script

```bash
./node_modules/.bin/tsx backend/test-baselines-neo4j.ts
```

**Test Coverage**:
- ✅ Baseline creation
- ✅ Version snapshot linking
- ✅ Baseline listing
- ✅ Baseline details retrieval
- ✅ Lifecycle version capture (archived, deleted)
- ✅ Neo4j storage verification
- ✅ No workspace dependency
- ✅ Backup compatibility

### Expected Results

```
✅ TEST PASSED: Baselines fully compatible with Neo4j single-source!

📊 Key Findings:
   ✅ Baselines stored as Neo4j Baseline nodes
   ✅ Version snapshots linked via Neo4j relationships
   ✅ No workspace markdown files created
   ✅ All baseline data in Neo4j graph
   ✅ Baselines included in Neo4j backups
   ✅ Baselines preserved in restore operations

🎯 Architecture Benefits:
   ✅ Single source of truth (Neo4j only)
   ✅ Lifecycle versions captured in baseline snapshots
   ✅ Baseline comparison works via contentHash
   ✅ Complete audit trail preserved
```

## Performance Considerations

### Baseline Creation Time

For a typical project:
- 500 requirements
- 20 documents
- 100 sections
- 200 trace links

**Creation time**: 3-5 seconds

**Breakdown**:
1. Generate ref: <100ms
2. Collect entities: ~1 second
3. Get latest versions: ~1-2 seconds (parallel queries)
4. Create baseline node: <100ms
5. Link versions: ~1-2 seconds (batched)

### Storage Overhead

**Baseline node**: ~2 KB (metadata only)
**Version links**: No data duplication (references only)

**Example**:
- 10 baselines per project
- 500 requirements × 10 baselines = 5,000 relationships
- Storage: ~10 baselines × 2 KB = 20 KB

**Negligible overhead**: Baselines add minimal storage.

### Query Performance

**List baselines**: <5ms (indexed by project)
**Get baseline details**: 50-100ms (depends on version count)
**Compare baselines**: 100-200ms (fetches two baselines + comparison)

**Optimization**: Add indexes on commonly queried fields:
```cypher
CREATE INDEX baseline_ref FOR (b:Baseline) ON (b.ref)
CREATE INDEX baseline_created FOR (b:Baseline) ON (b.createdAt)
```

## Best Practices

### When to Create Baselines

**Good times**:
- ✅ Release candidates
- ✅ Production releases
- ✅ End of sprint/iteration
- ✅ Before major refactoring
- ✅ Compliance audit submissions
- ✅ Customer deliveries

**Not necessary**:
- ❌ After every requirement change
- ❌ Multiple times per day
- ❌ For experimental branches

### Baseline Labels

**Good labels**:
- ✅ "Release 1.0 - Production"
- ✅ "Sprint 12 Complete - 2025-10-10"
- ✅ "FDA 510(k) Submission - Batch 42"
- ✅ "Pre-Refactor Safety Checkpoint"

**Bad labels**:
- ❌ "Baseline 1"
- ❌ "Test"
- ❌ null

**Tip**: Include version number, purpose, and date for clarity.

### Author Attribution

Always include who created the baseline:

```json
{
  "author": "release-manager@acme.com"
}
```

**Benefits**:
- Accountability
- Contact for questions
- Audit trail

### Baseline Retention

**Recommendation**: Keep all baselines indefinitely.

**Rationale**:
- Minimal storage overhead
- Regulatory requirements may mandate retention
- Historical analysis valuable
- No risk of deletion

**Exception**: If you must delete old baselines:
```cypher
MATCH (baseline:Baseline {ref: $baselineRef})
DETACH DELETE baseline
```

**Warning**: This breaks audit trail. Only do if legally required.

## Troubleshooting

### Baseline Creation Fails

**Symptom**: Error creating baseline.

**Possible causes**:
1. No requirements in project
2. Version nodes missing
3. Neo4j connection issue
4. Memory limits (very large projects)

**Debug**:
```cypher
// Check if requirements exist
MATCH (project:Project {slug: $projectSlug})-[:CONTAINS]->(req:Requirement)
RETURN count(req) AS requirementCount

// Check if versions exist
MATCH (req:Requirement)-[:HAS_VERSION]->(v:RequirementVersion)
WHERE req.projectKey = $projectKey
RETURN count(v) AS versionCount
```

### Baseline Details Empty

**Symptom**: Baseline node exists but no version snapshots.

**Cause**: Version links not created (likely database issue during creation).

**Fix**: Recreate baseline:
```cypher
// Delete broken baseline
MATCH (baseline:Baseline {ref: $ref})
DETACH DELETE baseline

// Create new baseline via API
POST /baseline
```

### Comparison Shows All Modified

**Symptom**: Baseline comparison shows all requirements as modified, even unchanged ones.

**Cause**: Content hashes not matching (likely due to field differences).

**Debug**:
```cypher
MATCH (b1:Baseline {ref: $ref1})-[:SNAPSHOT_OF_REQUIREMENT]->(v1:RequirementVersion {requirementId: $reqId})
MATCH (b2:Baseline {ref: $ref2})-[:SNAPSHOT_OF_REQUIREMENT]->(v2:RequirementVersion {requirementId: $reqId})
RETURN v1.contentHash AS hash1, v2.contentHash AS hash2, v1.text AS text1, v2.text AS text2
```

## Future Enhancements

### Planned Features

1. **Baseline Approval Workflow**
   - Require approval before creating baseline
   - Multi-step approval process
   - Approval audit trail

2. **Scheduled Baselines**
   - Automatic baseline creation (e.g., end of sprint)
   - Configurable schedule
   - Notification on creation

3. **Baseline Tags**
   - Tag baselines (e.g., "release", "audit", "milestone")
   - Filter baselines by tag
   - Compliance-specific tags

4. **Export Enhancements**
   - Export baseline as PDF
   - Export baseline as Word document
   - Export baseline as Excel spreadsheet

5. **Comparison UI**
   - Visual diff viewer
   - Side-by-side comparison
   - Highlight changes

## References

- [Neo4j Migration Documentation](./NEO4J-MIGRATION-COMPLETE.md)
- [Version History System Guide](./VERSION-HISTORY-SYSTEM.md)
- [Backup & Restore Guide](./BACKUP_RESTORE.md)
- [Architecture Documentation](./ARCHITECTURE.md)
- [Baseline Read-only View Implementation](./BASELINE_READONLY_VIEW_IMPLEMENTATION.md)
