# Linkset Schema Design

## Overview
Replace individual trace links with document-level linksets that contain collections of requirement links.

## Neo4j Schema

### Current Structure
```
Project -[:HAS_TRACE_LINK]-> TraceLink -[:FROM_REQUIREMENT]-> Requirement
                                      -[:TO_REQUIREMENT]-> Requirement
Requirement -[:LINKS_TO]-> Requirement
```

### New Linkset Structure
```
Project -[:HAS_LINKSET]-> DocumentLinkset -[:FROM_DOCUMENT]-> Document
                                         -[:TO_DOCUMENT]-> Document
Document -[:LINKED_TO]-> Document
```

## Node Types

### DocumentLinkset
```cypher
CREATE (linkset:DocumentLinkset {
  id: "linkset-{timestamp}",
  tenant: "hollando",
  projectKey: "main-battle-tank",
  sourceDocumentSlug: "user-requirements-document", 
  targetDocumentSlug: "system-requirements-document",
  linkCount: 15,
  links: [
    {
      id: "link-1",
      sourceRequirementId: "URD-KEY-001",
      targetRequirementId: "SRD-FUN-005", 
      linkType: "satisfies",
      description: "User login satisfies authentication requirement",
      createdAt: "2025-01-15T10:30:00Z",
      updatedAt: "2025-01-15T10:30:00Z"
    },
    // ... more links
  ],
  createdAt: "2025-01-15T10:30:00Z",
  updatedAt: "2025-01-15T12:45:00Z"
})
```

## Benefits

### 1. Performance
- **Single query** to get all links between two documents
- **Reduced Neo4j edges** from N*M to 1 per document pair
- **Faster filtering** by document pair

### 2. Scalability  
- **Atomic updates** - add/remove links in single transaction
- **Bulk operations** - import/export entire linksets
- **Version control** - track linkset changes over time

### 3. User Experience
- **Document-centric view** - natural grouping by document pairs
- **Bulk operations** - create multiple links between documents at once
- **Visual clarity** - single connection line with expandable details

## API Changes

### New Endpoints
```typescript
// Linkset CRUD
GET /linksets/{tenant}/{project}
GET /linksets/{tenant}/{project}/{sourceDoc}/{targetDoc}
POST /linksets/{tenant}/{project}
PUT /linksets/{tenant}/{project}/{linksetId}
DELETE /linksets/{tenant}/{project}/{linksetId}

// Individual link operations within linksets  
POST /linksets/{tenant}/{project}/{linksetId}/links
DELETE /linksets/{tenant}/{project}/{linksetId}/links/{linkId}
```

### Type Definitions
```typescript
export type DocumentLinkset = {
  id: string;
  tenant: string;
  projectKey: string;
  sourceDocumentSlug: string;
  targetDocumentSlug: string;
  sourceDocument: DocumentRecord;
  targetDocument: DocumentRecord;
  linkCount: number;
  links: TraceLinkItem[];
  createdAt: string;
  updatedAt: string;
};

export type TraceLinkItem = {
  id: string;
  sourceRequirementId: string;
  targetRequirementId: string;
  linkType: TraceLinkType;
  description?: string;
  createdAt: string;
  updatedAt: string;
};
```

## Migration Strategy

### Phase 1: Dual Schema
- Keep existing TraceLink nodes
- Create new DocumentLinkset nodes
- Sync both during transition

### Phase 2: Data Migration
- Convert existing links to linksets
- Group by document pairs
- Preserve all metadata

### Phase 3: Cleanup
- Remove old TraceLink nodes
- Update all API endpoints
- Update frontend components

## Frontend Benefits

### Visual Links
```typescript
// Before: Filter 100+ individual links
const relevantLinks = traceLinks.filter(link => 
  matchesDocuments(link, leftDoc, rightDoc)
);

// After: Direct linkset lookup
const linkset = linksets.find(ls => 
  ls.sourceDocumentSlug === leftDoc.slug && 
  ls.targetDocumentSlug === rightDoc.slug
);
```

### Performance
- **Instant filtering** - no complex requirement ID parsing
- **Predictable queries** - always fetch by document pair
- **Smaller payloads** - only relevant linksets loaded