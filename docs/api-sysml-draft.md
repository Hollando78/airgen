# SysML Service API Contract (Draft)

**Status:** Working draft for Phase 0  
**Owners:** Backend platform team, API guild  
**Last Updated:** 2025-10-26

This document defines the Fastify routes that will back the `/sysml-models` workspace. Routes follow AIRgen’s existing conventions: tenant/project scoping, JWT auth, and Zod validation.

---

## 1. Base Conventions

- **Base path:** `/api/:tenant/:project/sysml`
- **Auth:** JWT (`Authorization: Bearer <token>`). Requires `modeling:read` or `modeling:write` scopes depending on verb.
- **Content-Type:** `application/json` for request/response bodies.
- **Error contract:** Standard `HttpError` payload:
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Invalid port id"
  }
  ```
- **Pagination:** `?cursor=` and `?limit=` query parameters where list endpoints may return >100 elements.
- **Idempotency:** `PUT`/`PATCH` operations accept `If-Unmodified-Since` header to prevent lost updates.
- **Validation:** Zod schemas in `backend/src/routes/sysml/schemas.ts`.

---

## 2. Service Status

| Route | Method | Description | Notes |
| --- | --- | --- | --- |
| `/status` | `GET` | Returns feature-flag + readiness metadata (`ready`, `phase`, `version`) | Lightweight polling endpoint for UI shell |

Response example:

```json
{
  "status": {
    "ready": false,
    "phase": "architecture",
    "message": "SysML services are undergoing Phase 0 architecture setup.",
    "version": "phase0-sysml-scaffold"
  }
}
```

---

## 3. Packages & Viewpoints

| Route | Method | Description | Notes |
| --- | --- | --- | --- |
| `/packages` | `GET` | List packages (optionally filtered by parent) | Query: `includeArchived` (boolean). Returns `x-sysml-implementation: phase-0`. |
| `/packages` | `POST` | Create package | Body: `{ name, packageKind, parentId?, defaultViewpoints?, metadata? }` |
| `/packages/:packageId` | `PATCH` | Update package metadata | Partial updates allowed (`name`, `packageKind`, `defaultViewpoints`, `metadata`). |
| `/packages/:packageId` | `DELETE` | Soft-delete package | Flags `lifecycleState = 'archived'`; returns `204` on success. |
| `/viewpoints` | `GET` | List available viewpoints | Supports upcoming seeds |
| `/viewpoints` | `POST` | Create custom viewpoint | Feature flagged for evaluation builds |

Sample request:

```http
POST /api/acme/skylab/sysml/packages
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Propulsion Models",
  "packageKind": "model",
  "parentId": "SYSML_PACKAGE:root",
  "defaultViewpoints": ["bdd", "ibd"]
}
```

Response (`201 Created`):
```json
{
  "id": "1fc0d4f1-61cf-4999-9a78-a92d6f6fd8b6",
  "name": "Propulsion Models",
  "packageKind": "model",
  "parentId": "SYSML_PACKAGE:root",
  "defaultViewpoints": ["bdd", "ibd"],
  "tenant": "acme",
  "projectKey": "skylab",
  "createdAt": "2025-10-26T18:22:11.913Z",
  "updatedAt": "2025-10-26T18:22:11.913Z"
}
```

---

## 4. Elements (Blocks, Ports, etc.)

| Route | Method | Description |
| --- | --- | --- |
| `/elements` | `GET` | Filterable element search (`elementType`, `packageId`, `search`, `limit`). Returns `x-sysml-implementation: phase-0`. |
| `/elements/:elementId` | `GET` | Retrieve element details with basic relationships (incoming/outgoing IDs). |
| `/elements` | `POST` | Create element; Phase 0 supports `block` only (draft state). |
| `/elements/:elementId` | `PATCH` | Update metadata or lifecycle (Phase 0: block fields; other types Phase 1). |
| `/elements/:elementId` | `DELETE` | Soft-delete (Phase 0 sets `lifecycleState = 'retired'`). |
| `/elements/:elementId/ports` | `POST` | Create port on a block/interface (Phase 1). |
| `/elements/:elementId/ports/:portId` | `PATCH` | Update port definition (Phase 1). |
| `/elements/:elementId/ports/:portId` | `DELETE` | Remove port definition (Phase 1). |
| `/elements/:elementId/relationships` | `POST` | Create structural relationships (`HAS_PART`, etc.) (Phase 0: block-only, metadata optional). |
| `/elements/:elementId/relationships/:relationshipId` | `DELETE` | Remove relationship (Phase 0). |

Element payload example (future block definition):

```json
{
  "elementType": "block",
  "name": "Engine Controller",
  "packageId": "1fc0d4f1-61cf-4999-9a78-a92d6f6fd8b6",
  "blockKind": "component",
  "stereotype": "control",
  "documentation": "Manages engine throttle and telemetry.",
  "defaultDiagramStyle": {
    "width": 320,
    "height": 180
  }
}
```

Sample response for current Phase 0 read endpoints:

```json
{
  "elements": [
    {
      "id": "element-1",
      "sysmlId": "sysml-1",
      "name": "Engine Controller",
      "elementType": "block",
      "packageId": "pkg-1",
      "tenant": "demo",
      "projectKey": "sysml-eval",
      "lifecycleState": "draft",
      "createdAt": "2025-10-26T20:12:44.102Z",
      "updatedAt": "2025-10-26T20:12:44.102Z",
      "block": {
        "blockKind": "component",
        "defaultSize": { "width": 320, "height": 180 }
      }
    }
  ],
  "meta": {
    "implementationPhase": "phase-0",
    "message": "SysML element API is in Phase 0 read-only mode.",
    "count": 1
  }
}
```

> **Element metadata:** `block`, `interface`, and `port` elements include type-specific payloads (`block`, `interface`, `port` objects) with the fields surface today; these structures will expand as additional properties migrate from `sysml-modeler`.

Creation payload example (Phase 0 block):

```json
{
  "elementType": "block",
  "name": "Navigation Controller",
  "packageId": "pkg-1",
  "block": {
    "blockKind": "component",
    "isAbstract": false,
    "defaultSize": { "width": 320, "height": 180 }
  }
}
```

Response:

```json
{
  "element": {
    "id": "element-new",
    "sysmlId": "element-new",
    "name": "Navigation Controller",
    "elementType": "block",
    "packageId": "pkg-1",
    "tenant": "demo",
    "projectKey": "sysml-eval",
    "lifecycleState": "draft",
    "block": {
      "blockKind": "component",
      "defaultSize": { "width": 320, "height": 180 }
    },
    "createdAt": "2025-10-26T21:05:33.000Z",
    "updatedAt": "2025-10-26T21:05:33.000Z"
  }
}
```

```json
{
  "element": {
    "id": "element-1",
    "sysmlId": "sysml-1",
    "name": "Engine Controller",
    "elementType": "block",
    "packageId": "pkg-1",
    "tenant": "demo",
    "projectKey": "sysml-eval",
    "lifecycleState": "draft",
    "documentation": "Controls propulsion subsystem",
    "createdAt": "2025-10-26T20:12:44.102Z",
    "updatedAt": "2025-10-26T20:12:44.102Z",
    "block": {
      "blockKind": "component",
      "defaultSize": { "width": 320, "height": 180 },
      "defaultStyle": { "fill": "#ffffff" }
    }
  },
  "relationships": [
    {
      "id": "rel-1",
      "type": "HAS_PART",
      "direction": "outgoing",
      "targetId": "element-2",
      "metadata": { "multiplicity": "1..*" }
    }
  ]
}
```

Relationship creation (Phase 0 block example):

```json
{
  "targetElementId": "element-2",
  "type": "HAS_PART",
  "metadata": { "multiplicity": "1..*" }
}
```

Interface creation example:

```json
{
  "elementType": "interface",
  "name": "Thermal Bus",
  "packageId": "pkg-1",
  "interface": {
    "protocol": "CAN",
    "direction": "inout",
    "rate": 10
  }
}
```

Port creation example:

```json
{
  "elementType": "port",
  "name": "Throttle Out",
  "packageId": "pkg-1",
  "port": {
    "direction": "out",
    "portType": "flow",
    "conjugated": false,
    "typeRef": "ThrottleSignal"
  }
}
```

---

## 5. Diagrams

| Route | Method | Description | Notes |
| --- | --- | --- | --- |
| `/diagrams` | `GET` | List diagrams (filter by package, type, search term) | Returns `x-sysml-implementation: phase-0`. |
| `/diagrams/:diagramId` | `GET` | Fetch diagram with layout payloads (`nodes`, `connections`) | Read-only during Phase 0. |
| `/diagrams` | `POST` | Create diagram (bdd, ibd, deployment, requirements schema) | Phase 1+ |
| `/diagrams/:diagramId` | `PATCH` | Update metadata (`name`, `description`, `layoutEngine`) | Phase 1+ |
| `/diagrams/:diagramId` | `DELETE` | Archive diagram | Phase 1+ |
| `/diagrams/:diagramId/elements` | `PUT` | Replace layout payload (ReactFlow node/edge arrays) | Phase 1+ |
| `/diagrams/:diagramId/elements/:elementId` | `PATCH` | Update a single element’s layout overrides | Phase 1+ |
| `/diagrams/:diagramId/connections` | `POST` | Create connector for the diagram | Phase 1+ |
| `/diagrams/:diagramId/connections/:connectionId` | `PATCH` | Update connector style (line, marker, labels) | Phase 1+ |
| `/diagrams/:diagramId/connections/:connectionId` | `DELETE` | Remove connector | Phase 1+ |

Sample response (`GET /diagrams/:diagramId`):

```json
{
  "diagram": {
    "id": "diag-1",
    "name": "Propulsion Overview",
    "diagramType": "bdd",
    "tenant": "demo",
    "projectKey": "sysml-eval",
    "packageId": "pkg-1",
    "layoutEngine": "manual",
    "viewport": { "x": 0, "y": 0, "zoom": 1.1 },
    "metadata": { "colorScheme": "sysml" },
    "createdAt": "2025-10-26T20:15:01.102Z",
    "updatedAt": "2025-10-26T20:15:01.102Z"
  },
  "nodes": [
    {
      "elementId": "element-1",
      "position": { "x": 120, "y": 80 },
      "size": { "width": 320, "height": 180 },
      "styleOverrides": { "label": "Engine Controller" }
    }
  ],
  "connections": [
    {
      "connectionId": "conn-1",
      "sourceId": "element-1",
      "targetId": "element-2",
      "controlPoints": [{ "x": 160, "y": 120 }],
      "style": {
        "lineStyle": "straight",
        "color": "#000000"
      }
    }
  ]
}
```

Layout request body (`PUT /diagrams/:id/elements`):

```json
{
  "nodes": [
    {
      "elementId": "block-uuid",
      "position": { "x": 120, "y": 80 },
      "size": { "width": 280, "height": 160 },
      "styleOverrides": { "label": "Throttle Controller" }
    }
  ],
  "ports": [
    {
      "elementId": "port-uuid",
      "parentElementId": "block-uuid",
      "edge": "left",
      "offset": 45
    }
  ]
}
```

Response returns normalized layout, versioned timestamps, and optimistic locking token (`layoutRevision`).

---

## 6. Model Queries & Utilities

| Route | Method | Description |
| --- | --- | --- |
| `/search` | `POST` | Full-text search across elements (`query`, `types[]`, `limit`) |
| `/snapshots` | `POST` | Create diagram snapshot (future) |
| `/snapshots/:snapshotId` | `GET` | Fetch snapshot metadata |
| `/library` | `GET` | Retrieve shared block templates (replaces `architecture/blocks.ts` library call) |
| `/library/import` | `POST` | Import element from template |
| `/bulk` | `POST` | Batch operations (create/update multiple elements) |
| `/metrics` | `GET` | Aggregate metrics (element counts, diagrams per package) for dashboards |

---

## 7. Error Scenarios

- **404** – Element or diagram not found for tenant/project.
- **409** – Relationship conflicts (e.g., deleting block with active connectors).
- **422** – SysML validation failure (invalid multiplicity, missing port type).
- **429** – Rate limited; reuses global rate limit plugin.
- **500** – Neo4j errors surfaced as `Internal Server Error` with trace id.

---

## 8. Telemetry & Observability

Each route emits structured logs using `req.log.info()` with fields:
`{ route: 'sysml.diagrams.update', tenant, projectKey, userId, status }`.
Metrics exposed via Prometheus under `sysml_requests_total` and `sysml_request_duration_seconds`.

Audit events produced for `POST`/`PATCH`/`DELETE` calls, reusing existing event bus (`activity.ts`).

---

## 9. TODO / Open Questions

- Align naming with `sysml-modeler` REST interface for future reuse.
- Define maximum payload sizes for layout operations.
- Decide if `bulk` route should accept diff-based operations or full replacements.
- Confirm whether snapshots live in Neo4j or on disk (ties into backup strategy).
- Document feature flags for beta gating once Phase 2 begins.
