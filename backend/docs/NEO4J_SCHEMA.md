# Neo4j Database Schema Documentation

## Overview
This document describes the Neo4j graph database schema used by AIRGen for storing metadata, relationships, and traceability information.

## Design Philosophy
- **Markdown-first**: Requirement text lives in Markdown files (source of truth)
- **Graph for metadata**: Neo4j stores structured metadata and relationships
- **Traceability**: Graph enables powerful trace link queries
- **Multi-tenancy**: Data isolated by tenant/project

## Node Types

### Tenant
Represents an organization or team using the system.

```cypher
(:Tenant {
  slug: String!,          // Unique identifier (URL-safe)
  name: String?,          // Display name
  createdAt: DateTime!
})
```

**Indexes**:
- `tenant_slug` on `slug`

**Constraints**:
- `tenant_slug_unique` - UNIQUE on `slug`

### Project
A requirements project within a tenant.

```cypher
(:Project {
  slug: String!,          // Unique within tenant
  tenantSlug: String!,    // Parent tenant
  key: String?,           // Short identifier (e.g., "BRK")
  createdAt: DateTime!
})
```

**Indexes**:
- `project_slug` on `slug`
- `project_tenant_slug` on `tenantSlug`

**Constraints**:
- `project_composite_unique` - UNIQUE on `(tenantSlug, slug)`

### Requirement
A single requirement with metadata.

```cypher
(:Requirement {
  id: String!,            // UUID
  hashId: String!,        // Content hash
  ref: String!,           // REQ-XXX-NNN
  tenant: String!,
  projectKey: String!,
  title: String?,         // Deprecated - use text
  text: String!,          // Actual requirement text
  pattern: String?,       // ubiquitous|event|state|unwanted|optional
  verification: String?,  // Test|Analysis|Inspection|Demonstration
  qaScore: Float?,        // 0.0-100.0
  qaVerdict: String?,     // excellent|good|acceptable|needs-work|poor
  suggestions: [String],  // QA improvement suggestions
  tags: [String],         // User-defined tags
  path: String!,          // Markdown file path
  documentSlug: String?,  // Parent document (if any)
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

**Indexes**:
- `requirement_ref` on `ref`
- `requirement_tenant_project` on `(tenant, projectKey)`
- `requirement_document` on `documentSlug`
- `requirement_created_at` on `createdAt`

**Constraints**:
- `requirement_id_unique` - UNIQUE on `id`

### RequirementCandidate
AI-generated requirement candidates pending review.

```cypher
(:RequirementCandidate {
  id: String!,            // UUID
  tenant: String!,
  projectKey: String!,
  text: String!,          // Candidate text
  status: String!,        // pending|accepted|rejected
  qaScore: Float?,
  qaVerdict: String?,
  suggestions: [String],
  prompt: String?,        // User input that generated this
  querySessionId: String?, // Groups candidates from same query
  source: String?,        // chat|draft|manual
  requirementRef: String?, // If accepted, the REQ-XXX-NNN
  requirementId: String?,  // If accepted, the Requirement node ID
  documentSlug: String?,   // Target document
  sectionId: String?,      // Target section
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

**Indexes**:
- `candidate_tenant_project` on `(tenant, projectKey)`
- `candidate_status` on `status`
- `candidate_session` on `querySessionId`

### Document
A structured document or surrogate upload.

```cypher
(:Document {
  id: String!,            // UUID
  slug: String!,          // URL-safe identifier
  name: String!,          // Display name
  description: String?,
  shortCode: String?,     // e.g., "SRD"
  tenant: String!,
  projectKey: String!,
  parentFolder: String?,  // Parent folder slug
  kind: String!,          // structured|surrogate
  originalFileName: String?, // For surrogates
  storedFileName: String?,   // For surrogates
  mimeType: String?,         // For surrogates
  fileSize: Integer?,        // For surrogates
  storagePath: String?,      // Relative path in workspace
  previewPath: String?,
  previewMimeType: String?,
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

**Indexes**:
- `document_slug` on `slug`
- `document_tenant_project` on `(tenant, projectKey)`

**Constraints**:
- `document_id_unique` - UNIQUE on `id`

### Folder
Organizational folder for documents.

```cypher
(:Folder {
  id: String!,
  slug: String!,
  name: String!,
  description: String?,
  tenant: String!,
  projectKey: String!,
  parentFolder: String?,
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

### DocumentSection
Section within a structured document.

```cypher
(:DocumentSection {
  id: String!,
  name: String!,
  description: String?,
  shortCode: String?,
  documentSlug: String!,
  tenant: String!,
  projectKey: String!,
  order: Integer!,
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

### ArchitectureDiagram
Architecture diagram metadata.

```cypher
(:ArchitectureDiagram {
  id: String!,
  name: String!,
  description: String?,
  tenant: String!,
  projectKey: String!,
  view: String!,          // block|internal|deployment|requirements_schema
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

**Indexes**:
- `diagram_id` on `id`
- `diagram_tenant_project` on `(tenant, projectKey)`

### ArchitectureBlockDefinition
Reusable block/component definition.

```cypher
(:ArchitectureBlockDefinition {
  id: String!,
  name: String!,
  kind: String!,          // system|subsystem|component|actor|external|interface
  stereotype: String?,
  description: String?,
  tenant: String!,
  projectKey: String!,
  ports: [Object],        // Array of {id, name, direction}
  documentIds: [String],  // Associated documents
  createdAt: DateTime!,
  updatedAt: DateTime!
})
```

**Indexes**:
- `block_definition_id` on `id`
- `block_tenant_project` on `(tenant, projectKey)`

### Baseline
Snapshot of requirements at a point in time.

```cypher
(:Baseline {
  id: String!,
  ref: String!,           // BASE-XXX-NNN
  tenant: String!,
  projectKey: String!,
  author: String?,
  label: String?,
  requirementRefs: [String], // Array of REQ-XXX-NNN
  createdAt: DateTime!
})
```

**Indexes**:
- `baseline_ref` on `ref`
- `baseline_tenant_project` on `(tenant, projectKey)`

**Constraints**:
- `baseline_id_unique` - UNIQUE on `id`

## Relationships

### Tenant → Project
```cypher
(:Tenant)-[:OWNS]->(:Project)
```
One tenant owns multiple projects.

### Project → Requirement
```cypher
(:Project)-[:CONTAINS]->(:Requirement)
```
One project contains multiple requirements.

### Project → Baseline
```cypher
(:Project)-[:HAS_BASELINE]->(:Baseline)
```
One project can have multiple baselines.

### Baseline → Requirement
```cypher
(:Baseline)-[:SNAPSHOT_OF]->(:Requirement)
```
One baseline captures many requirements.

### Requirement → Requirement (Trace Links)
```cypher
(:Requirement)-[:SATISFIES]->(:Requirement)
(:Requirement)-[:DERIVES]->(:Requirement)
(:Requirement)-[:VERIFIES]->(:Requirement)
(:Requirement)-[:IMPLEMENTS]->(:Requirement)
(:Requirement)-[:REFINES]->(:Requirement)
(:Requirement)-[:CONFLICTS]->(:Requirement)
```
Requirements can have typed trace links between them.

Properties on trace link relationships:
- `linkType: String!` - satisfies|derives|verifies|implements|refines|conflicts
- `description: String?` - Optional explanation
- `createdAt: DateTime!`
- `updatedAt: DateTime!`

### Document → Requirement
```cypher
(:Document)-[:CONTAINS]->(:Requirement)
```
A document contains multiple requirements (for structured documents).

### Document → DocumentSection
```cypher
(:Document)-[:HAS_SECTION]->(:DocumentSection)
```
A document has multiple sections.

### DocumentSection → Requirement
```cypher
(:DocumentSection)-[:CONTAINS]->(:Requirement)
```
A section contains multiple requirements.

### Folder → Document
```cypher
(:Folder)-[:CONTAINS]->(:Document)
```
Folders organize documents.

### Folder → Folder
```cypher
(:Folder)-[:CONTAINS]->(:Folder)
```
Folders can contain subfolders.

### ArchitectureDiagram → ArchitectureBlockDefinition
```cypher
(:ArchitectureDiagram)-[:PLACES {
  positionX: Float!,
  positionY: Float!,
  sizeWidth: Float!,
  sizeHeight: Float!,
  backgroundColor: String?,
  borderColor: String?,
  borderWidth: Integer?,
  borderStyle: String?,
  textColor: String?,
  fontSize: Integer?,
  fontWeight: String?,
  borderRadius: Integer?,
  placementCreatedAt: DateTime!,
  placementUpdatedAt: DateTime!
}]->(:ArchitectureBlockDefinition)
```
Diagrams place block definitions at specific positions.

### ArchitectureBlockDefinition → ArchitectureBlockDefinition (Connectors)
Stored as separate ArchitectureConnector records in the database, but conceptually:
```cypher
(:ArchitectureBlockDefinition)-[:CONNECTS_TO {
  kind: String!,          // association|flow|dependency|composition
  label: String?,
  sourcePortId: String?,
  targetPortId: String?,
  lineStyle: String?,
  markerStart: String?,
  markerEnd: String?,
  linePattern: String?,
  color: String?,
  strokeWidth: Integer?
}]->(:ArchitectureBlockDefinition)
```

## Query Patterns

### Get All Requirements for a Project
```cypher
MATCH (p:Project {tenantSlug: $tenant, slug: $project})-[:CONTAINS]->(r:Requirement)
RETURN r
ORDER BY r.createdAt DESC
```

### Get Requirements with Trace Links
```cypher
MATCH (r:Requirement {id: $requirementId})
OPTIONAL MATCH (r)-[link:SATISFIES|DERIVES|VERIFIES|IMPLEMENTS|REFINES|CONFLICTS]->(target:Requirement)
RETURN r, collect({type: type(link), target: target}) as links
```

### Get Baseline with Requirements
```cypher
MATCH (b:Baseline {id: $baselineId})-[:SNAPSHOT_OF]->(r:Requirement)
RETURN b, collect(r) as requirements
```

### Search Requirements by Text
```cypher
MATCH (r:Requirement)
WHERE r.tenant = $tenant
  AND r.projectKey = $project
  AND r.text CONTAINS $searchText
RETURN r
LIMIT 20
```

### Get Document Hierarchy
```cypher
MATCH (d:Document {tenant: $tenant, projectKey: $project})
OPTIONAL MATCH (d)-[:HAS_SECTION]->(s:DocumentSection)
OPTIONAL MATCH (s)-[:CONTAINS]->(r:Requirement)
RETURN d, collect(s) as sections, collect(r) as requirements
```

### Get Architecture Diagram with Blocks
```cypher
MATCH (d:ArchitectureDiagram {id: $diagramId})
MATCH (d)-[p:PLACES]->(b:ArchitectureBlockDefinition)
RETURN d, b, p
```

## Performance Considerations

### Index Usage
All primary lookup queries should use indexes:
- Tenant/project lookups use composite indexes
- Requirement ref lookups use ref index
- Time-based queries use createdAt index

### Query Optimization
1. **Use LIMIT**: Always limit result sets for list queries
2. **Use Parameters**: All queries use parameterized values ($tenant, $project)
3. **Avoid Cartesian Products**: Use OPTIONAL MATCH carefully
4. **Index Hints**: Can use `USING INDEX` for query hints if needed

### Monitoring
Check query performance with:
```cypher
EXPLAIN MATCH (r:Requirement {tenant: $tenant, projectKey: $project}) RETURN r
```

Or for detailed execution stats:
```cypher
PROFILE MATCH (r:Requirement {tenant: $tenant, projectKey: $project}) RETURN r
```

## Maintenance

### Creating Indexes
Run on initial setup:
```typescript
import { createDatabaseIndexes } from "./services/graph/schema.js";
await createDatabaseIndexes();
```

### Verifying Schema
```typescript
import { listDatabaseIndexes, listDatabaseConstraints } from "./services/graph/schema.js";

const indexes = await listDatabaseIndexes();
const constraints = await listDatabaseConstraints();
```

### Migrations
When schema changes are needed:
1. Add new index/constraint in `schema.ts`
2. Update this documentation
3. Test in development
4. Run migration in production
5. Monitor query performance

## Future Enhancements

### Planned Node Types
- `(:Need)` - Stakeholder needs
- `(:TestCase)` - Verification tests
- `(:Risk)` - Identified risks
- `(:User)` - User accounts
- `(:Role)` - Authorization roles

### Planned Relationships
- `(:Need)-[:SATISFIED_BY]->(:Requirement)`
- `(:TestCase)-[:VERIFIES]->(:Requirement)`
- `(:Risk)-[:MITIGATED_BY]->(:Requirement)`
- `(:User)-[:HAS_ROLE]->(:Role)`
- `(:User)-[:MEMBER_OF]->(:Tenant)`

### Vector Search
Consider adding for semantic similarity:
- Install Neo4j Vector Index plugin
- Add embedding vectors to Requirements
- Enable semantic trace link suggestions
