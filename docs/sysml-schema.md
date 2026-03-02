# SysML v2 Neo4j Schema (Draft)

**Status:** Working draft for Phase 0  
**Owners:** Backend platform team (graph services), SysML SMEs  
**Last Updated:** 2025-10-26

This document proposes the unified Neo4j schema that will replace the existing `architecture`/`sysml-lite` structures. The goal is to keep the model idiomatic to SysML v2 while remaining compatible with AIRgen’s multi-tenant graph and tracing services.

---

## 1. Design Principles

- **SysML-native vocabulary** – node labels and relationship names follow the OMG SysML v2 specification where practical (`SYSML_BLOCK`, `SYSML_REQUIREMENT`, etc.).
- **Tenant isolation** – every node and edge carries `tenant` and `projectKey` properties; no cross-tenant relationships.
- **Version aware** – elements track `versionId` and `lifecycleState` for eventual integration with requirement baselines.
- **Trace-ready** – relationships chosen to align with AIRgen trace engine (`SATISFIES`, `ALLOCATES_TO`, etc.).
- **Composable packages** – packages provide containment and inheritance of default viewpoints.
- **Extensible metadata** – optional JSON payloads are stored under `metadata` for model-level extensions without schema churn.

---

## 2. Core Node Labels

| Label | Description | Key Properties | Notes |
| --- | --- | --- | --- |
| `SYSML_PACKAGE` | Organizational container (model roots, views, library packages) | `id`, `name`, `packageKind`, `tenant`, `projectKey`, `isRoot`, `defaultViewpoints`, `metadata` | Replaces `ArchitecturePackage` nodes |
| `SYSML_ELEMENT` | Base label applied to all element nodes | `id`, `sysmlId`, `name`, `elementType`, `lifecycleState`, `stereotype`, `documentation`, `createdAt`, `updatedAt`, `tenant`, `projectKey`, `versionId`, `metadata` | Actual element types extend this with extra labels |
| `SYSML_BLOCK` | Structure elements (part, reference, value) | Inherits `SYSML_ELEMENT`; adds `blockKind`, `isAbstract`, `defaultDiagramStyle` | Equivalent to current block definitions |
| `SYSML_INTERFACE` | Interface blocks | Inherits `SYSML_ELEMENT`; adds `protocol`, `direction`, `rate` | |
| `SYSML_PORT` | Proxy/full ports | Inherits `SYSML_ELEMENT`; adds `portKind`, `direction`, `conjugated`, `typeRef` | `metadata` stores signal definitions |
| `SYSML_CONNECTION` | Connectors between parts/ports | `id`, `connectionType`, `label`, `lineStyle`, `metadata`, `tenant`, `projectKey`, `diagramId` | Replaces `ArchitectureConnector` |
| `SYSML_DIAGRAM` | Diagram container (block def/internal/deployment) | `id`, `diagramType`, `name`, `description`, `viewport`, `layoutEngine`, `tenant`, `projectKey`, `versionId`, `metadata` | Holds layout only |
| `SYSML_VIEWPOINT` | Saved viewpoint definitions | `id`, `name`, `description`, `elementTypes`, `diagramTypes`, `tenant`, `projectKey`, `metadata` | Seeded at migration |
| `SYSML_REQUIREMENT` | Optional tag applied when requirement nodes need SysML-specific relationships | Re-uses existing requirement nodes; label added in migration |
| `SYSML_ACTIVITY`, `SYSML_STATE`, `SYSML_USECASE`, etc. | Additional element labels introduced incrementally | Each inherits `SYSML_ELEMENT` | Document as they are introduced |

---

## 3. Relationships

| Relationship | Direction | Description |
| --- | --- | --- |
| `CONTAINS` | `SYSML_PACKAGE` → (`SYSML_PACKAGE` \| `SYSML_ELEMENT`) | Package hierarchy; enforces tenant/project match |
| `OWNS` | `SYSML_BLOCK` → `SYSML_PORT` | Block owns port definition |
| `HAS_PART` | `SYSML_BLOCK` → `SYSML_BLOCK` | Part properties; carries `multiplicity`, `aggregationKind` |
| `CONNECTS` | `SYSML_CONNECTION` → (`SYSML_PORT` \| `SYSML_BLOCK`) | Connects source/target; properties: `role` (`source`/`target`), `portId` |
| `VISUALIZES` | `SYSML_DIAGRAM` → `SYSML_ELEMENT` | Diagram includes element; properties: `position`, `size`, `styleOverrides` |
| `USES_VIEWPOINT` | `SYSML_DIAGRAM` → `SYSML_VIEWPOINT` | Diagram scoped to a viewpoint |
| `SATISFIES` | `SYSML_ELEMENT` → `REQUIREMENT` | Trace alignment (existing label) |
| `ALLOCATES_TO` | `SYSML_ELEMENT` → `REQUIREMENT` | Resource allocation trace |
| `DERIVES_FROM_SYSML` | `SYSML_ELEMENT` → `SYSML_ELEMENT` | Derivation relationships |
| `VERIFIED_BY_SYSML` | `SYSML_ELEMENT` → `TEST_CASE` | Hook to QA engine |
| `DOCUMENTS` | `DOCUMENT` → `SYSML_ELEMENT` | Reuse existing document link pattern |
| `HAS_VERSION` | `SYSML_ELEMENT` → `VERSION` | Reuse existing versioning nodes |

Relationship properties must include `tenant`, `projectKey`, `createdAt`, `updatedAt`, and any diagram-specific metadata (e.g., routing control points).

---

## 4. Property Reference

| Property | Type | Applies To | Description |
| --- | --- | --- | --- |
| `tenant` | string | All nodes/edges | Tenant slug; used for auth filters |
| `projectKey` | string | All nodes/edges | Project identifier |
| `sysmlId` | string | Elements | Stable SysML identifier (UUID) |
| `elementType` | enum | `SYSML_ELEMENT` | `block`, `interface`, `port`, `diagram`, etc. |
| `packageId` | string | `SYSML_ELEMENT` | Owning package identifier (mirrors `CONTAINS` hierarchy) |
| `lifecycleState` | enum | `SYSML_ELEMENT`, `SYSML_PACKAGE` | Elements: `draft`, `review`, `approved`, `deprecated`. Packages: `active`, `archived`. |
| `metadata` | map/json | Most nodes | Extensibility bucket; validated per element |
| `position` | map | `VISUALIZES` | `{ x, y, z? }` |
| `styleOverrides` | map | `VISUALIZES` | Canvas-level overrides; mirrors ReactFlow config |
| `connectionType` | enum | `SYSML_CONNECTION` | `flow`, `association`, `generalization`, etc. |
| `multiplicity` | string | `HAS_PART` | SysML multiplicity string (`1`, `0..*`, etc.) |
| `aggregationKind` | enum | `HAS_PART` | `composite`, `shared`, `none` |
| `viewpoint` | string | `SYSML_DIAGRAM` | Fallback viewpoint name when `USES_VIEWPOINT` missing |
| `metadata` | map/json | `HAS_PART`, `ALLOCATES_TO`, etc. | Relationship-level metadata (e.g., multiplicity) |

Element-specific payloads returned by the API include:
- `block` – block metadata (kind, abstract flag, default size/style).
- `interface` – protocol/direction/rate information for interface blocks.
- `port` – direction, type, conjugation, and protocol metadata for ports.

---

## 5. Indexes & Constraints

| Target | Constraint / Index |
| --- | --- |
| `SYSML_PACKAGE(id)` | `PRIMARY KEY` uniqueness |
| `SYSML_ELEMENT(id)` | `PRIMARY KEY` uniqueness |
| `SYSML_ELEMENT(sysmlId)` | Unique per tenant/project |
| `SYSML_DIAGRAM(id)` | `PRIMARY KEY` uniqueness |
| `SYSML_VIEWPOINT(id)` | `PRIMARY KEY` uniqueness |
| `VISUALIZES` relationships | Composite index on (`diagramId`, `elementId`) |
| `CONTAINS` relationships | Composite index on (`packageId`, `childId`) |
| `SATISFIES` relationships | Index for `elementId` lookups |
| Tenant/project filters | All element labels and relationships include indexes on (`tenant`, `projectKey`) for multi-tenant query performance |

Neo4j migration `backend/scripts/migrate-add-sysml.ts` will create these constraints and seed default viewpoints.

---

## 6. Diagram Representation

- **Layout data** lives in `VISUALIZES.styleOverrides` and `SYSML_CONNECTION` properties to keep diagrams stateless.
- **Snapshots** (future): `SYSML_DIAGRAM` can link to `DIAGRAM_SNAPSHOT` nodes for versioning without cloning all element nodes.
- **ReactFlow bridge**: `layoutEngine` property stores enum (`manual`, `dagre`, `fcose`) to support existing layout helpers.

---

## 7. Migration Strategy

1. **Read-only shadowing** – new services will write to SysML schema while existing UI still reads `architecture` nodes.
2. **Reconciliation job** – nightly job copies changes between old and new structures until the new UI ships.
3. **Cutover** – once `/sysml-models` route is live, freeze `architecture` writes and expose migration toggle in admin UI.
4. **Cleanup** – drop `architecture` nodes after evaluation period or keep behind feature flag for rollback.

Open items:
- Decide whether existing Neo4j `Package` nodes need re-labelling vs. new nodes.
- Clarify if `SYSML_REQUIREMENT` is a secondary label or a dedicated node copy.
- Coordinate with trace service to avoid duplicate relationship names.

---

## 8. Sample Cypher Fragments

```cypher
// Create a block inside a package
MATCH (pkg:SYSML_PACKAGE { id: $packageId, tenant: $tenant, projectKey: $project })
CREATE (block:SYSML_BLOCK:SYSML_ELEMENT {
  id: randomUUID(),
  sysmlId: $sysmlId,
  name: $name,
  elementType: 'block',
  blockKind: $blockKind,
  tenant: $tenant,
  projectKey: $project,
  lifecycleState: 'draft',
  createdAt: datetime(),
  updatedAt: datetime()
})
CREATE (pkg)-[:CONTAINS {
  tenant: $tenant,
  projectKey: $project,
  createdAt: datetime(),
  updatedAt: datetime()
}]->(block);
```

```cypher
// Attach a port and connector
MATCH
  (block:SYSML_BLOCK { id: $blockId, tenant: $tenant, projectKey: $project }),
  (targetBlock:SYSML_BLOCK { id: $targetBlockId, tenant: $tenant, projectKey: $project })
CREATE
  (port:SYSML_PORT:SYSML_ELEMENT {
    id: randomUUID(),
    name: $portName,
    elementType: 'port',
    direction: $direction,
    tenant: $tenant,
    projectKey: $project,
    createdAt: datetime(),
    updatedAt: datetime()
  }),
  (block)-[:OWNS { tenant: $tenant, projectKey: $project }]->(port),
  (conn:SYSML_CONNECTION {
    id: randomUUID(),
    connectionType: 'flow',
    tenant: $tenant,
    projectKey: $project,
    createdAt: datetime(),
    updatedAt: datetime()
  })-[:CONNECTS { role: 'source', tenant: $tenant, projectKey: $project }]->(port),
  (conn)-[:CONNECTS { role: 'target', tenant: $tenant, projectKey: $project }]->(targetBlock);
```

---

## 9. Next Steps

- Validate schema with domain SMEs and align property names with `sysml-modeler` export format.
- Prototype `mapSysMLEntry()` backend mapper returning the new shape for React.
- Produce ERD + sequence diagrams (`docs/sysml-schema-diagrams/`) – pending once schema is signed off.
- Feed constraints into migration script and unit tests (`backend/tests/services/sysml/`).
