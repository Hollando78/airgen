# Neo4j Schema Migrations

This directory contains schema migration scripts to normalize and rationalize the AIRGen Neo4j database.

## Quick Start

### List Available Migrations
```bash
npx tsx src/cli/migrate.ts list
```

### Run All Migrations
```bash
npx tsx src/cli/migrate.ts up
```

### Rollback Last Migration
```bash
npx tsx src/cli/migrate.ts down
```

### Rollback Last 3 Migrations
```bash
npx tsx src/cli/migrate.ts down 3
```

## Migration Descriptions

### 001: Unify Containment Relationships
**Status**: ✅ Ready to run
**Description**: Replaces three different relationship types (HAS_REQUIREMENT, CONTAINS_INFO, CONTAINS_SURROGATE_REFERENCE) with a single CONTAINS pattern. Moves `order` from node properties to relationship properties for efficient reordering.

**What it changes**:
- `DocumentSection-[:HAS_REQUIREMENT]->Requirement` → `DocumentSection-[:CONTAINS {order}]->Requirement`
- `DocumentSection-[:CONTAINS_INFO]->Info` → `DocumentSection-[:CONTAINS {order}]->Info`
- `DocumentSection-[:CONTAINS_SURROGATE_REFERENCE]->SurrogateReference` → `DocumentSection-[:CONTAINS {order}]->SurrogateReference`
- Removes `order` property from all content nodes

**Impact**:
- ✅ Consistent relationship semantics
- ✅ O(1) reordering via relationship updates
- ⚠️  Requires service layer updates to use new relationship type

### 002: Remove Redundant Denormalization
**Status**: ✅ Ready to run (after 001)
**Description**: Removes redundant `tenant`, `projectKey`, `documentSlug`, and `sectionId` properties from Requirements, Infos, and SurrogateReferences. These values should be derived via graph traversal.

**What it changes**:
- Removes `tenant`, `projectKey`, `documentSlug`, `sectionId` from Requirements
- Removes `tenant`, `projectKey`, `documentSlug`, `sectionId` from Infos
- Removes `tenant`, `projectKey`, `documentSlug`, `sectionId` from SurrogateReferences

**Impact**:
- ✅ ~30% storage reduction
- ✅ Eliminates update anomalies
- ✅ Single source of truth via relationships
- ⚠️  All queries must derive context from graph traversal

### 003: Simplify Document Hierarchy
**Status**: ✅ Ready to run (after 001, 002)
**Description**: Removes ambiguous direct Document→Content relationships. All content MUST belong to a section. Creates "Unsectioned" default section for orphaned content.

**What it changes**:
- Removes `Document-[:CONTAINS]->Requirement`
- Removes `Document-[:HAS_INFO]->Info`
- Removes `Document-[:HAS_SURROGATE_REFERENCE]->SurrogateReference`
- Creates "Unsectioned" sections for orphaned content
- Enforces: Content → Section → Document (single path)

**Impact**:
- ✅ No ambiguity about content location
- ✅ Simpler queries (one path, not two)
- ⚠️  Unsectioned content moved to "Unsectioned" section

## Testing

### Dry Run (Recommended First)
Before running migrations on real data:

1. **Backup your Neo4j database**
   ```bash
   # Export current data
   cypher-shell "CALL apoc.export.cypher.all('/tmp/backup.cypher', {})" -u neo4j -p your-password
   ```

2. **List migrations** to see what will run
   ```bash
   npx tsx src/cli/migrate.ts list
   ```

3. **Run on dev/test environment first**
   ```bash
   # Make sure GRAPH_URL points to dev Neo4j
   npx tsx src/cli/migrate.ts up
   ```

4. **Verify queries still work**
   - Test document loading
   - Test requirement creation
   - Test reordering
   - Test section management

5. **If issues occur, rollback**
   ```bash
   npx tsx src/cli/migrate.ts down 3  # Rollback all 3 migrations
   ```

### Manual Testing Queries

After migration, verify with these Cypher queries:

```cypher
// Verify unified CONTAINS relationships
MATCH (section:DocumentSection)-[rel:CONTAINS]->(content)
RETURN section.name, type(content) as contentType, rel.order, content.ref
ORDER BY section.name, rel.order
LIMIT 20;

// Verify no old relationship types exist
MATCH ()-[rel:HAS_REQUIREMENT|CONTAINS_INFO|CONTAINS_SURROGATE_REFERENCE]->()
RETURN count(rel);
// Should return 0

// Verify no denormalized properties exist
MATCH (content)
WHERE content:Requirement OR content:Info OR content:SurrogateReference
RETURN content.id, content.tenant, content.projectKey, content.documentSlug, content.sectionId
LIMIT 5;
// tenant/projectKey/documentSlug/sectionId should all be null

// Verify all content belongs to sections
MATCH (content)
WHERE content:Requirement OR content:Info OR content:SurrogateReference
WITH content
OPTIONAL MATCH ()-[:CONTAINS]->(content)
WITH content, count(*) as hasSection
WHERE hasSection = 0
RETURN count(content) as orphanedContent;
// Should return 0

// Verify no direct Document->Content relationships
MATCH (doc:Document)-[rel:CONTAINS|HAS_INFO|HAS_SURROGATE_REFERENCE]->()
RETURN count(rel);
// Should return 0
```

## Rollback

Each migration has a tested rollback function:

```bash
# Rollback all migrations
npx tsx src/cli/migrate.ts down 3

# Rollback specific migration
npx tsx src/cli/migrate.ts rollback 001-unify-containment-relationships
```

## Service Layer Updates

After running migrations, update these files to use new patterns:

1. **backend/src/services/graph/documents/documents-sections.ts**
   - Use `CONTAINS` instead of specific relationship types
   - Use `rel.order` instead of `node.order`

2. **backend/src/services/graph/requirements/requirements-crud.ts**
   - Remove denormalized property writes
   - Derive context from relationships

3. **backend/src/services/graph/infos.ts**
   - Use unified `CONTAINS` relationship
   - Remove denormalized properties

4. **backend/src/services/graph/surrogates.ts**
   - Use unified `CONTAINS` relationship
   - Remove denormalized properties

## Migration Order

Migrations MUST run in order:
1. 001 (Unify relationships)
2. 002 (Remove denormalization)
3. 003 (Simplify hierarchy)

Rollbacks should happen in reverse order:
1. 003
2. 002
3. 001

## Troubleshooting

### Migration fails midway
- Check Neo4j logs for Cypher errors
- Verify database connectivity
- Check for constraint violations
- Run rollback and try again

### Query performance degrades
- Verify indexes exist on key properties
- Use `EXPLAIN` to check query plans
- Consider adding indexes for traversal paths

### Data inconsistencies after migration
- Run verification queries (see Testing section)
- Check for orphaned nodes
- Verify all relationships created correctly
- If issues persist, rollback and investigate

## Support

For issues or questions:
1. Check `backend/docs/NEO4J_MIGRATION_PLAN.md` for detailed plan
2. Review migration code in this directory
3. Run verification queries
4. Use rollback if needed
