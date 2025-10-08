# Requirements History & Change Tracking Implementation Plan

## Current State Analysis

### ✅ What We Already Have

#### Basic Timestamps
- `createdAt`: When requirement was created
- `updatedAt`: Automatically updated on every change
- Location: `requirements-crud.ts:73-74`

#### Soft Delete Tracking
- `deletedAt`: Timestamp when deleted
- `deletedBy`: User who deleted it
- `restoredAt`: Timestamp when restored from deletion
- `deleted`: Boolean flag
- Location: `requirements-crud.ts:82-84`

#### Content Integrity
- `contentHash`: SHA-256 hash of requirement content (text, pattern, verification)
- Used to detect if markdown files drift from Neo4j database
- Automatically computed and updated when content changes
- Location: `requirements-crud.ts:81, 372-376`
- Implementation: `lib/requirement-hash.ts`

#### Archive Tracking
- `archived`: Boolean flag to archive requirements
- Archive/unarchive operations update `updatedAt`

### ❌ What We're Missing

#### Version History
- No `RequirementVersion` or `RequirementHistory` nodes
- No snapshots of previous requirement states
- No change log of what fields were modified

#### Change Tracking by User
- No `createdBy` or `updatedBy` fields on requirements
- No tracking of WHO made changes (only `deletedBy` for soft deletes)
- No authentication context passed to update functions

#### Diff Capability
- No way to compare current version vs previous versions
- No change history to show what changed between versions
- `contentHash` only detects IF something changed, not WHAT changed

#### Audit Trail
- No comprehensive audit log of all changes
- No tracking of field-level changes (e.g., "pattern changed from 'event' to 'state'")

---

## Implementation Plan

## Phase 1: Core Infrastructure (Database & Types)

### 1.1 Create RequirementVersion Node Type in Neo4j

Add a new `RequirementVersion` node type with properties:

```typescript
RequirementVersion {
  versionId: string;           // UUID for this version
  requirementId: string;       // Link to parent Requirement.id
  versionNumber: number;       // Auto-incremented (1, 2, 3...)
  timestamp: string;           // ISO datetime
  changedBy: string;           // User identifier (email or ID)
  changeType: string;          // "created" | "updated" | "archived" | "restored" | "deleted"
  changeDescription?: string;  // Optional human-readable description

  // Snapshot of requirement state at this version
  text: string;
  pattern?: string;
  verification?: string;
  rationale?: string;
  complianceStatus?: string;
  complianceRationale?: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string;        // JSON stringified array
  tags?: string;               // JSON stringified array
  attributes?: string;         // JSON stringified object
  contentHash: string;         // Hash of this version's content
}
```

### 1.2 Create Graph Relationships

```cypher
// Link requirement to its versions
(Requirement)-[:HAS_VERSION]->(RequirementVersion)

// Create version chain (optional, for efficient traversal)
(RequirementVersion)-[:PREVIOUS_VERSION]->(RequirementVersion)
```

Example graph structure:
```
(Requirement {id: "hollando:main-battle-tank:SRD-001"})
  -[:HAS_VERSION]-> (Version v1 {versionNumber: 1, changedBy: "alice@example.com"})
  -[:HAS_VERSION]-> (Version v2 {versionNumber: 2, changedBy: "bob@example.com"})
                       -[:PREVIOUS_VERSION]-> (Version v1)
  -[:HAS_VERSION]-> (Version v3 {versionNumber: 3, changedBy: "alice@example.com"})
                       -[:PREVIOUS_VERSION]-> (Version v2)
```

### 1.3 Update TypeScript Types

**File: `src/services/workspace.ts`**

Add new type:
```typescript
export type RequirementVersionRecord = {
  versionId: string;
  requirementId: string;
  versionNumber: number;
  timestamp: string;
  changedBy: string;
  changeType: "created" | "updated" | "archived" | "restored" | "deleted";
  changeDescription?: string;
  // All requirement fields as snapshot
  text: string;
  pattern?: RequirementPattern;
  verification?: VerificationMethod;
  rationale?: string;
  complianceStatus?: string;
  complianceRationale?: string;
  qaScore?: number;
  qaVerdict?: string;
  suggestions?: string[];
  tags?: string[];
  attributes?: Record<string, string | number | boolean | null>;
  contentHash: string;
};
```

Update `RequirementRecord`:
```typescript
export type RequirementRecord = {
  // ... existing fields ...
  createdBy?: string;  // NEW
  updatedBy?: string;  // NEW
  versionNumber?: number;  // NEW - current version number
};
```

Update `RequirementInput` in `requirements-crud.ts`:
```typescript
export type RequirementInput = {
  // ... existing fields ...
  userId?: string;  // NEW - user making the change
};
```

---

## Phase 2: Capture User Context

### 2.1 Add User Context Extraction

**File: `src/routes/requirements-api.ts`**

Extract user from JWT/session in route handlers:

```typescript
app.post("/requirements", {
  // ... existing config ...
}, async (request, reply) => {
  const payload = requirementSchema.parse(request.body);

  // Extract user from auth context
  const userId = request.user?.email || request.user?.id || "system";

  const requirement = await createRequirement({
    ...payload,
    userId  // Pass user context
  });

  return requirement;
});
```

### 2.2 Update CRUD Function Signatures

**File: `src/services/graph/requirements/requirements-crud.ts`**

Update function signatures to accept userId:

```typescript
export async function createRequirement(
  input: RequirementInput & { userId?: string }
): Promise<RequirementRecord>

export async function updateRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  updates: {
    // ... existing fields ...
    userId?: string;  // NEW
  }
): Promise<RequirementRecord | null>

export async function archiveRequirements(
  tenant: string,
  projectKey: string,
  requirementIds: string[],
  userId?: string  // NEW
): Promise<{ archived: number }>
```

---

## Phase 3: Version Creation Logic

### 3.1 Create Version Helper Function

**File: `src/services/graph/requirements/requirements-versions.ts` (NEW)**

```typescript
import { ManagedTransaction } from "neo4j-driver";
import { randomUUID } from "crypto";

export async function createRequirementVersion(
  tx: ManagedTransaction,
  params: {
    requirementId: string;
    tenantSlug: string;
    projectSlug: string;
    changedBy: string;
    changeType: "created" | "updated" | "archived" | "restored" | "deleted";
    changeDescription?: string;
    // Current requirement state
    text: string;
    pattern?: string | null;
    verification?: string | null;
    rationale?: string;
    complianceStatus?: string;
    complianceRationale?: string;
    qaScore?: number;
    qaVerdict?: string;
    suggestions?: string[];
    tags?: string[];
    attributes?: Record<string, any>;
    contentHash: string;
  }
): Promise<void> {
  const versionId = randomUUID();
  const now = new Date().toISOString();

  // Get current version number
  const versionCountResult = await tx.run(
    `
      MATCH (req:Requirement {id: $requirementId})
      OPTIONAL MATCH (req)-[:HAS_VERSION]->(v:RequirementVersion)
      RETURN count(v) as versionCount
    `,
    { requirementId: params.requirementId }
  );

  const versionNumber = versionCountResult.records[0].get("versionCount").toNumber() + 1;

  // Create version node
  await tx.run(
    `
      MATCH (req:Requirement {id: $requirementId})
      CREATE (version:RequirementVersion {
        versionId: $versionId,
        requirementId: $requirementId,
        versionNumber: $versionNumber,
        timestamp: $timestamp,
        changedBy: $changedBy,
        changeType: $changeType,
        changeDescription: $changeDescription,
        text: $text,
        pattern: $pattern,
        verification: $verification,
        rationale: $rationale,
        complianceStatus: $complianceStatus,
        complianceRationale: $complianceRationale,
        qaScore: $qaScore,
        qaVerdict: $qaVerdict,
        suggestions: $suggestions,
        tags: $tags,
        attributes: $attributes,
        contentHash: $contentHash
      })
      CREATE (req)-[:HAS_VERSION]->(version)

      // Link to previous version
      WITH version
      MATCH (req:Requirement {id: $requirementId})-[:HAS_VERSION]->(prevVersion:RequirementVersion)
      WHERE prevVersion.versionNumber = $versionNumber - 1
      CREATE (version)-[:PREVIOUS_VERSION]->(prevVersion)
    `,
    {
      requirementId: params.requirementId,
      versionId,
      versionNumber,
      timestamp: now,
      changedBy: params.changedBy,
      changeType: params.changeType,
      changeDescription: params.changeDescription || null,
      text: params.text,
      pattern: params.pattern || null,
      verification: params.verification || null,
      rationale: params.rationale || null,
      complianceStatus: params.complianceStatus || null,
      complianceRationale: params.complianceRationale || null,
      qaScore: params.qaScore || null,
      qaVerdict: params.qaVerdict || null,
      suggestions: params.suggestions ? JSON.stringify(params.suggestions) : null,
      tags: params.tags ? JSON.stringify(params.tags) : null,
      attributes: params.attributes ? JSON.stringify(params.attributes) : null,
      contentHash: params.contentHash
    }
  );
}
```

### 3.2 Integrate Versioning into createRequirement

**File: `src/services/graph/requirements/requirements-crud.ts`**

```typescript
export async function createRequirement(
  input: RequirementInput & { userId?: string }
): Promise<RequirementRecord> {
  // ... existing code ...

  const result = await session.executeWrite(async (tx: ManagedTransaction) => {
    // Create requirement (existing code)
    const createResult = await tx.run(/* ... */);

    // Create initial version (v1)
    const requirement = createResult.records[0].get("requirement");
    await createRequirementVersion(tx, {
      requirementId: requirement.properties.id,
      tenantSlug,
      projectSlug,
      changedBy: input.userId || "system",
      changeType: "created",
      text: input.text,
      pattern: input.pattern,
      verification: input.verification,
      rationale: input.rationale,
      complianceStatus: input.complianceStatus,
      complianceRationale: input.complianceRationale,
      qaScore: input.qaScore,
      qaVerdict: input.qaVerdict,
      suggestions: input.suggestions,
      tags: input.tags,
      attributes: input.attributes,
      contentHash
    });

    return requirement;
  });

  // ... rest of function ...
}
```

### 3.3 Integrate Versioning into updateRequirement

```typescript
export async function updateRequirement(
  tenant: string,
  projectKey: string,
  requirementId: string,
  updates: {
    // ... existing fields ...
    userId?: string;
  }
): Promise<RequirementRecord | null> {
  // ... existing code ...

  const result = await session.executeWrite(async (tx: ManagedTransaction) => {
    // Check if this is a meaningful change (not just metadata)
    const needsVersion = updates.text !== undefined ||
                         updates.pattern !== undefined ||
                         updates.verification !== undefined ||
                         updates.complianceStatus !== undefined ||
                         updates.rationale !== undefined;

    if (needsVersion) {
      // Fetch current state BEFORE update
      const currentReq = await tx.run(
        `MATCH (req:Requirement {id: $requirementId}) RETURN req`,
        { requirementId }
      );

      if (currentReq.records.length > 0) {
        const current = mapRequirement(currentReq.records[0].get("req"));

        // Create version snapshot BEFORE update
        await createRequirementVersion(tx, {
          requirementId,
          tenantSlug,
          projectSlug,
          changedBy: updates.userId || "system",
          changeType: "updated",
          text: current.text,
          pattern: current.pattern,
          verification: current.verification,
          rationale: current.rationale,
          complianceStatus: current.complianceStatus,
          complianceRationale: current.complianceRationale,
          qaScore: current.qaScore,
          qaVerdict: current.qaVerdict,
          suggestions: current.suggestions,
          tags: current.tags,
          attributes: current.attributes,
          contentHash: current.contentHash!
        });
      }
    }

    // Apply update (existing code)
    await tx.run(/* ... */);

    // ... rest of function ...
  });
}
```

---

## Phase 4: History & Diff API

### 4.1 Get Requirement History

**File: `src/services/graph/requirements/requirements-versions.ts`**

```typescript
export async function getRequirementHistory(
  tenant: string,
  projectKey: string,
  requirementId: string
): Promise<RequirementVersionRecord[]> {
  const session = getSession();
  try {
    const result = await session.run(
      `
        MATCH (req:Requirement {id: $requirementId})
        MATCH (req)-[:HAS_VERSION]->(version:RequirementVersion)
        RETURN version
        ORDER BY version.versionNumber DESC
      `,
      { requirementId }
    );

    return result.records.map(record => {
      const v = record.get("version").properties;
      return {
        versionId: String(v.versionId),
        requirementId: String(v.requirementId),
        versionNumber: v.versionNumber.toNumber(),
        timestamp: String(v.timestamp),
        changedBy: String(v.changedBy),
        changeType: String(v.changeType),
        changeDescription: v.changeDescription ? String(v.changeDescription) : undefined,
        text: String(v.text),
        pattern: v.pattern ? String(v.pattern) : undefined,
        verification: v.verification ? String(v.verification) : undefined,
        rationale: v.rationale ? String(v.rationale) : undefined,
        complianceStatus: v.complianceStatus ? String(v.complianceStatus) : undefined,
        complianceRationale: v.complianceRationale ? String(v.complianceRationale) : undefined,
        qaScore: v.qaScore ? v.qaScore.toNumber() : undefined,
        qaVerdict: v.qaVerdict ? String(v.qaVerdict) : undefined,
        suggestions: v.suggestions ? JSON.parse(v.suggestions) : undefined,
        tags: v.tags ? JSON.parse(v.tags) : undefined,
        attributes: v.attributes ? JSON.parse(v.attributes) : undefined,
        contentHash: String(v.contentHash)
      };
    });
  } finally {
    await session.close();
  }
}
```

### 4.2 Get Diff Between Versions

```typescript
export type RequirementDiff = {
  field: string;
  oldValue: any;
  newValue: any;
  changed: boolean;
};

export async function getRequirementDiff(
  tenant: string,
  projectKey: string,
  requirementId: string,
  fromVersion: number,
  toVersion: number
): Promise<RequirementDiff[]> {
  const history = await getRequirementHistory(tenant, projectKey, requirementId);

  const from = history.find(v => v.versionNumber === fromVersion);
  const to = history.find(v => v.versionNumber === toVersion);

  if (!from || !to) {
    throw new Error("Version not found");
  }

  const fields: (keyof RequirementVersionRecord)[] = [
    "text", "pattern", "verification", "rationale",
    "complianceStatus", "complianceRationale",
    "qaScore", "qaVerdict", "suggestions", "tags", "attributes"
  ];

  const diff: RequirementDiff[] = [];

  for (const field of fields) {
    const oldValue = from[field];
    const newValue = to[field];
    const changed = JSON.stringify(oldValue) !== JSON.stringify(newValue);

    diff.push({
      field,
      oldValue,
      newValue,
      changed
    });
  }

  return diff;
}
```

### 4.3 Add API Routes

**File: `src/routes/requirements-api.ts`**

```typescript
// Get requirement history
app.get("/requirements/:tenant/:project/:id/history", {
  schema: {
    params: {
      type: "object",
      properties: {
        tenant: { type: "string" },
        project: { type: "string" },
        id: { type: "string" }
      }
    }
  }
}, async (request, reply) => {
  const { tenant, project, id } = request.params as any;

  const history = await getRequirementHistory(tenant, project, id);
  return { history };
});

// Get diff between versions
app.get("/requirements/:tenant/:project/:id/diff", {
  schema: {
    params: {
      type: "object",
      properties: {
        tenant: { type: "string" },
        project: { type: "string" },
        id: { type: "string" }
      }
    },
    querystring: {
      type: "object",
      properties: {
        from: { type: "integer" },
        to: { type: "integer" }
      },
      required: ["from", "to"]
    }
  }
}, async (request, reply) => {
  const { tenant, project, id } = request.params as any;
  const { from, to } = request.query as any;

  const diff = await getRequirementDiff(tenant, project, id, from, to);
  return { diff };
});

// Restore to previous version
app.post("/requirements/:tenant/:project/:id/restore/:versionNumber", {
  schema: {
    params: {
      type: "object",
      properties: {
        tenant: { type: "string" },
        project: { type: "string" },
        id: { type: "string" },
        versionNumber: { type: "integer" }
      }
    }
  }
}, async (request, reply) => {
  const { tenant, project, id, versionNumber } = request.params as any;
  const userId = request.user?.email || "system";

  // Get the version to restore
  const history = await getRequirementHistory(tenant, project, id);
  const versionToRestore = history.find(v => v.versionNumber === versionNumber);

  if (!versionToRestore) {
    return reply.code(404).send({ error: "Version not found" });
  }

  // Update requirement with version data
  const updated = await updateRequirement(tenant, project, id, {
    text: versionToRestore.text,
    pattern: versionToRestore.pattern,
    verification: versionToRestore.verification,
    rationale: versionToRestore.rationale,
    complianceStatus: versionToRestore.complianceStatus,
    complianceRationale: versionToRestore.complianceRationale,
    userId
  });

  return updated;
});
```

---

## Phase 5: Frontend UI Components

### 5.1 History Panel Component

**File: `src/components/RequirementHistory.tsx` (NEW)**

```typescript
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";

export function RequirementHistory({
  tenant,
  project,
  requirementId
}: {
  tenant: string;
  project: string;
  requirementId: string;
}) {
  const historyQuery = useQuery({
    queryKey: ["requirement-history", tenant, project, requirementId],
    queryFn: async () => {
      const response = await client.get(
        `/requirements/${tenant}/${project}/${requirementId}/history`
      );
      return response.data.history;
    }
  });

  if (historyQuery.isLoading) return <div>Loading history...</div>;
  if (historyQuery.error) return <div>Error loading history</div>;

  return (
    <div className="history-panel">
      <h3>Change History</h3>
      <div className="timeline">
        {historyQuery.data?.map((version: any) => (
          <div key={version.versionId} className="history-entry">
            <div className="version-badge">v{version.versionNumber}</div>
            <div className="version-details">
              <div className="change-type">{version.changeType}</div>
              <div className="timestamp">{new Date(version.timestamp).toLocaleString()}</div>
              <div className="changed-by">by {version.changedBy}</div>
              {version.changeDescription && (
                <div className="description">{version.changeDescription}</div>
              )}
            </div>
            <button onClick={() => viewDiff(version.versionNumber)}>
              View Changes
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 5.2 Diff Viewer Component

**File: `src/components/RequirementDiff.tsx` (NEW)**

```typescript
import { useQuery } from "@tanstack/react-query";
import { client } from "../lib/client";

export function RequirementDiff({
  tenant,
  project,
  requirementId,
  fromVersion,
  toVersion
}: {
  tenant: string;
  project: string;
  requirementId: string;
  fromVersion: number;
  toVersion: number;
}) {
  const diffQuery = useQuery({
    queryKey: ["requirement-diff", tenant, project, requirementId, fromVersion, toVersion],
    queryFn: async () => {
      const response = await client.get(
        `/requirements/${tenant}/${project}/${requirementId}/diff`,
        { params: { from: fromVersion, to: toVersion } }
      );
      return response.data.diff;
    }
  });

  if (diffQuery.isLoading) return <div>Loading diff...</div>;
  if (diffQuery.error) return <div>Error loading diff</div>;

  return (
    <div className="diff-viewer">
      <h3>Changes from v{fromVersion} to v{toVersion}</h3>
      <table className="diff-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Old Value</th>
            <th>New Value</th>
          </tr>
        </thead>
        <tbody>
          {diffQuery.data?.filter((d: any) => d.changed).map((diff: any) => (
            <tr key={diff.field}>
              <td className="field-name">{diff.field}</td>
              <td className="old-value">
                <pre>{formatValue(diff.oldValue)}</pre>
              </td>
              <td className="new-value">
                <pre>{formatValue(diff.newValue)}</pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
```

### 5.3 Integrate into Requirements Table

**File: `src/components/DocumentView/RequirementsTable/RequirementRow.tsx`**

Add history icon/button to each requirement row:

```typescript
<button
  onClick={() => setShowHistory(true)}
  title="View history"
>
  <HistoryIcon />
</button>

{showHistory && (
  <Modal onClose={() => setShowHistory(false)}>
    <RequirementHistory
      tenant={tenant}
      project={project}
      requirementId={requirement.id}
    />
  </Modal>
)}
```

---

## Migration Strategy

### Step 1: Add Version Tracking to Existing Requirements

Create a migration script to add initial versions for all existing requirements:

**File: `scripts/migrate-add-requirement-versions.ts`**

```typescript
import { initGraph, getSession } from "../src/services/graph/driver.js";

await initGraph();
const session = getSession();

try {
  // Get all requirements
  const result = await session.run(`
    MATCH (req:Requirement)
    WHERE NOT (req)-[:HAS_VERSION]->()
    RETURN req.id as id, req
  `);

  console.log(`Found ${result.records.length} requirements without versions`);

  for (const record of result.records) {
    const req = record.get("req").properties;
    const requirementId = String(req.id);

    // Create initial version (v1)
    await session.run(`
      MATCH (req:Requirement {id: $requirementId})
      CREATE (version:RequirementVersion {
        versionId: randomUUID(),
        requirementId: $requirementId,
        versionNumber: 1,
        timestamp: req.createdAt,
        changedBy: "system",
        changeType: "created",
        text: req.text,
        pattern: req.pattern,
        verification: req.verification,
        rationale: req.rationale,
        complianceStatus: req.complianceStatus,
        complianceRationale: req.complianceRationale,
        qaScore: req.qaScore,
        qaVerdict: req.qaVerdict,
        suggestions: req.suggestions,
        tags: req.tags,
        attributes: req.attributes,
        contentHash: req.contentHash
      })
      CREATE (req)-[:HAS_VERSION]->(version)
    `, { requirementId });

    console.log(`Created v1 for ${requirementId}`);
  }

  console.log("Migration complete!");
} finally {
  await session.close();
}
```

---

## Estimated Effort

- **Phase 1** (Database & Types): 2-3 days
- **Phase 2** (User Context): 1 day
- **Phase 3** (Version Logic): 3-5 days
- **Phase 4** (API): 2-3 days
- **Phase 5** (UI): 5-7 days
- **Migration & Testing**: 2-3 days

**Total: 2-3 weeks** for full implementation

---

## Testing Strategy

1. **Unit Tests**: Test version creation, diff calculation
2. **Integration Tests**: Test full flow from update to version creation
3. **Performance Tests**: Ensure version queries don't slow down requirement loading
4. **Migration Tests**: Test migration script on production data copy

---

## Future Enhancements

- **Selective field versioning**: Don't version QA scores, only content changes
- **Version compression**: Archive old versions to separate nodes
- **Change notifications**: Notify users when requirements they're watching change
- **Blame view**: Show who last modified each part of a requirement
- **Rollback workflows**: Approval process for reverting to old versions
