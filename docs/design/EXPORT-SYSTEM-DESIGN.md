# Export System Design

**Phase 1.3 of Neo4j Single-Source Migration**

## Overview

The export system replaces the current dual-storage architecture (Neo4j + markdown workspace) with an on-demand export mechanism. Instead of maintaining markdown files as a synchronized data source, we generate them only when needed for:
- User downloads/exports
- Backup archives
- External integrations
- Documentation generation

## Current State Problems

### Dual Storage Issues
```
┌─────────────┐         ┌──────────────┐
│   Neo4j     │◄───────►│  Markdown    │
│  (Graph)    │  Sync   │  Workspace   │
└─────────────┘         └──────────────┘
     │                         │
     │ Rich relationships      │ Missing relationships
     │ Section assignments     │ No section info
     │ DocumentLinksets        │ No linksets
     │ TraceLinks              │ No trace links
     └─────────────────────────┘
           Data Mismatch
```

**Problems:**
1. **Incomplete overlap**: Markdown doesn't store relationships (sections, linksets)
2. **Sync issues**: Backup restore + re-import loses Neo4j-only data
3. **Redundant writes**: Every CRUD operation writes to both stores
4. **Maintenance burden**: Two schemas to keep in sync

## Target State Architecture

### Single-Source with Export-Only

```
┌─────────────────────────────────────┐
│         Neo4j Graph Database       │
│  (Single Source of Truth)          │
│                                     │
│  • Requirements + Section info      │
│  • Infos, Surrogates               │
│  • Documents + Sections            │
│  • DocumentLinksets                │
│  • TraceLinks                      │
│  • All relationships               │
└────────────┬────────────────────────┘
             │
             │ On-demand query
             ▼
┌─────────────────────────────────────┐
│       Export Service                │
│  (Generate markdown from Neo4j)     │
│                                     │
│  exportRequirement()               │
│  exportDocument()                  │
│  exportProject()                   │
│  exportBackup()                    │
└────────────┬────────────────────────┘
             │
             │ Generate
             ▼
┌─────────────────────────────────────┐
│     Generated Markdown Files        │
│  (Temporary/On-Demand)              │
│                                     │
│  • User downloads                   │
│  • Backup archives                  │
│  • External integrations            │
└─────────────────────────────────────┘
```

## Export Service API

### Core Functions

#### 1. exportRequirement()
```typescript
interface RequirementExport {
  id: string;
  ref: string;
  title: string;
  text: string;
  section?: {
    id: string;
    name: string;
    shortCode: string;
  };
  document?: {
    slug: string;
    name: string;
  };
  traceLinks?: Array<{
    linkId: string;
    targetRef: string;
    linkType: string;
  }>;
  tenant: string;
  projectKey: string;
  pattern?: string;
  verification?: string;
  qa?: {
    score: number;
    verdict: string;
    suggestions: string[];
  };
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

async function exportRequirement(
  requirementId: string
): Promise<string> {
  // 1. Query Neo4j for requirement + all relationships
  // 2. Build rich export object with section, document, trace links
  // 3. Generate markdown with enhanced frontmatter
  // 4. Return markdown string
}
```

**Enhanced Markdown Format:**
```markdown
---
id: hollando:main-battle-tank:SRD-ARCH-004
ref: SRD-ARCH-004
title: The system shall use a distributed microservices architecture
tenant: hollando
project: main-battle-tank

# NEW: Section information (missing in current format)
section:
  id: section-abc123
  name: System Architecture
  shortCode: ARCH

# NEW: Document information
document:
  slug: system-requirements-document
  name: System Requirements Document

# NEW: Trace links (missing in current format)
traceLinks:
  - linkId: trace-xyz789
    targetRef: URD-KEY-001
    linkType: satisfies

pattern: ubiquitous
verification: inspection
qa:
  score: 95
  verdict: Compliant with 29148
  suggestions: []
tags: [architecture, microservices]
createdAt: 2025-09-26T13:54:07.466Z
updatedAt: 2025-10-10T14:23:11.332Z
---

The system SHALL use a distributed microservices architecture with
independently deployable services communicating via REST APIs.
```

#### 2. exportDocument()
```typescript
interface DocumentExport {
  slug: string;
  name: string;
  shortCode: string;
  sections: Array<{
    id: string;
    name: string;
    shortCode: string;
    order: number;
    requirements: Array<{
      id: string;
      ref: string;
      title: string;
    }>;
  }>;
  linksets?: Array<{
    id: string;
    targetDocSlug: string;
    defaultLinkType: string;
  }>;
  tenant: string;
  projectKey: string;
}

async function exportDocument(
  tenant: string,
  projectKey: string,
  documentSlug: string
): Promise<string> {
  // Generate complete document with sections and requirements
}
```

#### 3. exportProject()
```typescript
interface ProjectExportOptions {
  includeRequirements?: boolean;
  includeDocuments?: boolean;
  includeInfos?: boolean;
  includeSurrogates?: boolean;
  includeLinksets?: boolean;
  includeTraceLinks?: boolean;
  format?: 'markdown' | 'json' | 'both';
}

async function exportProject(
  tenant: string,
  projectKey: string,
  options: ProjectExportOptions = {}
): Promise<ProjectExportArchive> {
  // Generate complete project export with all entities
}
```

#### 4. exportBackup()
```typescript
interface BackupExportOptions {
  destination: string; // Directory path
  includeRelationships?: boolean; // Export relationships as JSON
  includeMetadata?: boolean; // Export project/tenant metadata
}

async function exportBackup(
  options: BackupExportOptions
): Promise<BackupManifest> {
  // Generate backup-ready export with:
  // 1. All markdown files (with enhanced format)
  // 2. Relationships JSON (sections, linksets, trace links)
  // 3. Metadata JSON (projects, tenants, users)
  // 4. Manifest file for restore validation
}
```

## Implementation Plan

### File Structure

```
src/services/
├── export-service.ts          # Main export service
├── export/
│   ├── requirement-export.ts  # Requirement export logic
│   ├── document-export.ts     # Document export logic
│   ├── info-export.ts         # Info export logic
│   ├── surrogate-export.ts    # Surrogate export logic
│   ├── project-export.ts      # Full project export
│   └── backup-export.ts       # Backup generation
└── workspace.ts               # Mark as @deprecated
```

### Key Cypher Queries

#### Export Requirement with All Relationships
```cypher
MATCH (req:Requirement {id: $requirementId})
OPTIONAL MATCH (section:DocumentSection)-[:CONTAINS]->(req)
OPTIONAL MATCH (doc:Document)-[:HAS_SECTION]->(section)
OPTIONAL MATCH (req)<-[tl:LINKS_TO]-(traceLink:TraceLink)
OPTIONAL MATCH (traceLink)-[:LINKS_FROM]->(sourceReq:Requirement)
RETURN req,
       section.id as sectionId,
       section.name as sectionName,
       section.shortCode as sectionCode,
       doc.slug as docSlug,
       doc.name as docName,
       collect({
         linkId: traceLink.id,
         sourceRef: sourceReq.ref,
         linkType: traceLink.linkType
       }) as traceLinks
```

#### Export Document with Sections and Requirements
```cypher
MATCH (doc:Document {slug: $slug, tenant: $tenant, projectKey: $projectKey})
OPTIONAL MATCH (doc)-[:HAS_SECTION]->(section:DocumentSection)
OPTIONAL MATCH (section)-[:CONTAINS]->(req:Requirement)
OPTIONAL MATCH (doc)<-[:LINKS_FROM]-(linkset:DocumentLinkset)-[:LINKS_TO]->(targetDoc:Document)
WITH doc, section, req, linkset, targetDoc
ORDER BY section.order, req.order
RETURN doc,
       collect(DISTINCT {
         section: section,
         requirements: collect(req)
       }) as sections,
       collect(DISTINCT {
         id: linkset.id,
         targetSlug: targetDoc.slug,
         defaultLinkType: linkset.defaultLinkType
       }) as linksets
```

## Migration Steps

### Phase 1: Preparation (This Phase)
- [x] Create export-service.ts skeleton
- [x] Design enhanced markdown schema with relationships
- [ ] Implement exportRequirement() with section/link data
- [ ] Implement exportDocument() with full structure
- [ ] Add tests for export functions

### Phase 2: Remove Workspace Writes (Week 2)
- [ ] Remove `writeRequirementMarkdown()` calls (18 locations)
- [ ] Remove `writeInfoMarkdown()` calls (3 locations)
- [ ] Remove `writeSurrogateMarkdown()` calls (3 locations)
- [ ] Update tests to use export service for validation
- [ ] Verify all CRUD operations work without workspace writes

### Phase 3: Replace Workspace Reads (Week 2-3)
- [ ] Replace `readRequirementMarkdown()` with direct Neo4j queries (3 locations)
- [ ] Remove markdown-sync.ts import logic
- [ ] Delete workspace directory creation logic
- [ ] Mark workspace.ts as @deprecated

### Phase 4: Update Backup System (Week 3)
- [ ] Integrate exportBackup() into backup-daily.sh
- [ ] Generate relationship JSON exports
- [ ] Remove workspace tar component from backup
- [ ] Simplify restore to Neo4j-only + export validation
- [ ] Update verify-restore-data.ts to check export functionality

## Backup Integration

### New Backup Structure

```
/backups/
└── 2025-10-10_14-30-00/
    ├── neo4j.tar.gz           # Neo4j dump (primary data)
    ├── postgres.sql.gz        # PostgreSQL dump
    ├── config-backup.tar.gz   # Configuration files
    └── exports/               # Generated exports (for validation)
        ├── manifest.json      # Export manifest
        ├── relationships.json # All relationships (sections, linksets, etc.)
        └── projects/          # Project exports
            └── hollando/
                └── main-battle-tank/
                    ├── requirements/
                    ├── documents/
                    ├── infos/
                    └── surrogates/
```

**Key Changes:**
1. ❌ **Remove**: `workspace-backup.tar.gz` (no longer needed)
2. ✅ **Add**: `exports/` directory with generated markdown
3. ✅ **Add**: `relationships.json` with all Neo4j-only data
4. ✅ **Add**: `manifest.json` for export validation

### Restore Process

**Before (Dual Storage):**
```bash
1. Restore Neo4j dump
2. Restore workspace markdown files
3. Re-import markdown → overwrites Neo4j
4. ⚠️ Lose relationships stored only in Neo4j
```

**After (Single Source):**
```bash
1. Restore Neo4j dump only
2. Run export validation to ensure data integrity
3. ✓ All relationships preserved
```

## Benefits

### 1. Data Integrity
- **Single source of truth**: Neo4j is the only data store
- **No sync issues**: Can't have Neo4j/markdown drift
- **Complete relationships**: All data backed up in Neo4j dump
- **Reliable restores**: Restore = Neo4j dump, nothing more

### 2. Performance
- **No redundant writes**: CRUD operations only touch Neo4j
- **Faster operations**: ~50% reduction in write latency
- **On-demand exports**: Generate markdown only when needed

### 3. Maintainability
- **Single schema**: Only Neo4j graph schema to maintain
- **Simpler code**: Remove workspace sync logic (500+ lines)
- **Easier testing**: Test Neo4j operations only

### 4. Feature Enablement
- **Rich exports**: Include all relationships in generated markdown
- **Multiple formats**: JSON, YAML, XML exports trivial to add
- **Custom exports**: User-defined export templates
- **API exports**: Direct API access to graph data

## Rollback Plan

If issues arise during migration:

1. **Phase 2 rollback**: Re-enable workspace write calls
2. **Phase 3 rollback**: Re-enable markdown-sync import
3. **Phase 4 rollback**: Restore workspace backup component

Each phase is independently reversible until Phase 4 completion.

## Success Criteria

- [ ] All CRUD operations work without workspace writes
- [ ] Export service generates markdown with full relationship data
- [ ] Backup/restore cycle preserves all data (0% loss)
- [ ] Performance improvement: ≥40% reduction in write latency
- [ ] No regressions in existing features

---

**Status**: Phase 1 Design Complete ✅
**Next**: Implement export service core functions
**Date**: 2025-10-10
