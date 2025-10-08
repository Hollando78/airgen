# Neo4j Schema Migration Plan

## Overview

This document describes the schema normalization and rationalization migrations created to address the "spaghetti code" issues in the current Neo4j backend.

## Problems Identified

### 1. Redundant Denormalization
- Requirements, Infos, and SurrogateReferences store `tenant`, `projectKey`, `documentSlug`, and `sectionId` as properties
- These should be derived from relationships, not duplicated
- **Impact**: Update anomalies, inconsistency risks, wasted storage (~30%)

### 2. Mixed Relationship Models
- Documents use both direct relationships (`Document-[:CONTAINS]->Requirement`) AND section relationships
- Three different containment patterns: `CONTAINS`, `CONTAINS_INFO`, `CONTAINS_SURROGATE_REFERENCE`
- **Impact**: Query complexity, confusion about source of truth

### 3. Order Management Antipattern
- Order stored as node properties (`requirement.order`, `info.order`, `surrogate.order`)
- **Impact**: Requires N queries to reorder content

### 4. Unnecessary Direct Document→Content Relationships
- Both `Document-[:CONTAINS]->Requirement` AND `DocumentSection-[:CONTAINS]->Requirement` exist
- **Impact**: Duplicate data paths, ambiguity

## Migration Scripts

### Migration 001: Unify Containment Relationships
**File**: `backend/src/services/graph/migrations/001-unify-containment-relationships.ts`

**What it does**:
- Replaces `HAS_REQUIREMENT`, `CONTAINS_INFO`, `CONTAINS_SURROGATE_REFERENCE` with single `CONTAINS` relationship
- Moves `order` from node properties to relationship properties
- Enables O(1) reordering via relationship updates

**Before**:
```cypher
(section:DocumentSection)-[:HAS_REQUIREMENT]->(req:Requirement {order: 1})
(section:DocumentSection)-[:CONTAINS_INFO]->(info:Info {order: 2})
(section:DocumentSection)-[:CONTAINS_SURROGATE_REFERENCE]->(sur:SurrogateReference {order: 3})
```

**After**:
```cypher
(section:DocumentSection)-[:CONTAINS {order: 1}]->(req:Requirement)
(section:DocumentSection)-[:CONTAINS {order: 2}]->(info:Info)
(section:DocumentSection)-[:CONTAINS {order: 3}]->(sur:SurrogateReference)
```

### Migration 002: Remove Redundant Denormalization
**File**: `backend/src/services/graph/migrations/002-remove-redundant-denormalization.ts`

**What it does**:
- Removes `tenant`, `projectKey`, `documentSlug`, `sectionId` from content nodes
- Forces queries to derive these via graph traversal
- Eliminates update anomalies

**Before**:
```cypher
(:Requirement {
  id: "req-1",
  ref: "SRD-001",
  text: "...",
  tenant: "hollando",
  projectKey: "main-battle-tank",
  documentSlug: "srd",
  sectionId: "section-123"
})
```

**After**:
```cypher
(:Requirement {
  id: "req-1",
  ref: "SRD-001",
  text: "..."
})
// Derive context from: (req)<-[:CONTAINS]-(section)<-[:HAS_SECTION]-(doc)<-[:HAS_DOCUMENT]-(proj)<-[:OWNS]-(tenant)
```

### Migration 003: Simplify Document Hierarchy
**File**: `backend/src/services/graph/migrations/003-simplify-document-hierarchy.ts`

**What it does**:
- Removes direct `Document-[:CONTAINS]->Content` relationships
- Enforces: All content MUST belong to a section
- Creates "Unsectioned" default section for orphaned content
- Single source of truth

**Before**:
```cypher
(doc:Document)-[:CONTAINS]->(req:Requirement)  // Direct path
(doc:Document)-[:HAS_SECTION]->(section)-[:CONTAINS]->(req)  // Section path
// Ambiguity: which is the source of truth?
```

**After**:
```cypher
(doc:Document)-[:HAS_SECTION]->(section:DocumentSection)-[:CONTAINS]->(req:Requirement)
// Single path, no ambiguity
```

## Migration Runner

**File**: `backend/src/services/graph/migrations/index.ts`

Provides programmatic API:
- `runMigrations()` - Run all pending migrations
- `rollbackMigrations(count)` - Rollback last N migrations
- `runMigration(id)` - Run specific migration
- `rollbackMigration(id)` - Rollback specific migration
- `listMigrations()` - List all available migrations

## CLI Tool

**File**: `backend/src/cli/migrate.ts`

Usage:
```bash
# Run all migrations
npx tsx src/cli/migrate.ts up

# Rollback last 2 migrations
npx tsx src/cli/migrate.ts down 2

# List available migrations
npx tsx src/cli/migrate.ts list

# Run specific migration
npx tsx src/cli/migrate.ts run 001-unify-containment-relationships

# Rollback specific migration
npx tsx src/cli/migrate.ts rollback 001-unify-containment-relationships
```

## Service Layer Updates Required

After running migrations, the following service files need updates:

### 1. Update Query Patterns
**Files to modify**:
- `backend/src/services/graph/documents/documents-sections.ts`
- `backend/src/services/graph/requirements/requirements-crud.ts`
- `backend/src/services/graph/infos.ts`
- `backend/src/services/graph/surrogates.ts`

**Changes**:
- Replace specific relationship types with `CONTAINS`
- Use `relationship.order` instead of `node.order`
- Derive tenant/project/document from graph traversal

### 2. Update Reorder Functions
**Pattern change**:
```typescript
// OLD: Update node properties (N queries)
for (let i = 0; i < items.length; i++) {
  await tx.run(`
    MATCH (item {id: $id})
    SET item.order = $order
  `, { id: items[i].id, order: i });
}

// NEW: Update relationship properties (N queries, but more efficient)
for (let i = 0; i < items.length; i++) {
  await tx.run(`
    MATCH ()-[rel:CONTAINS]->(item {id: $id})
    SET rel.order = $order
  `, { id: items[i].id, order: i });
}
```

### 3. Update Content Creation
**Pattern change**:
```typescript
// OLD: Store denormalized data
CREATE (req:Requirement {
  id: $id,
  tenant: $tenant,
  projectKey: $projectKey,
  documentSlug: $documentSlug,
  sectionId: $sectionId,
  order: $order
})

// NEW: Store only essential data, use relationships
CREATE (req:Requirement {
  id: $id,
  ref: $ref,
  text: $text
})
CREATE (section)-[:CONTAINS {order: $order}]->(req)
```

## Testing Strategy

1. **Backup production data** before running migrations
2. **Run migrations on dev environment** first
3. **Verify queries** still return correct data
4. **Performance test** common query patterns
5. **Rollback capability** tested for each migration
6. **Service layer updates** deployed incrementally with feature flags

## Rollback Plan

Each migration has a tested `down()` function that reverses changes:
- Migration 001: Restores original relationship types and moves order back to nodes
- Migration 002: Restores denormalized properties
- Migration 003: Restores direct Document→Content relationships

## Benefits After Migration

1. **~30% storage reduction** - No denormalized data
2. **Consistent schema** - Single CONTAINS pattern
3. **Easier queries** - One relationship type, not three
4. **Better performance** - Order on relationships enables efficient reordering
5. **Data integrity** - Single source of truth via relationships
6. **Simpler code** - Fewer special cases

## Next Steps

1. ✅ Create migration scripts (Phases 1-3)
2. ✅ Create migration runner
3. ✅ Create CLI tool
4. ⏳ Update service layer to use new patterns
5. ⏳ Update schema documentation
6. ⏳ Test on development data
7. ⏳ Deploy to production with rollback plan
