# Custom Attributes Implementation Guide

## Status: PARTIAL - Foundation Complete, Schema Management Pending

This document outlines the implementation status and remaining work for custom attributes on requirements.

**What's Working:** Basic custom attributes can be stored and retrieved on requirements.
**What's Pending:** Dynamic schema configuration and UI for defining project-specific attribute types.

## Completed Steps

✅ **1. Frontend Types** (`/root/airgen/frontend/src/types.ts`)
- Added `attributes?: Record<string, string | number | boolean | null>` to `RequirementRecord`
- Added `attributes` to `CreateRequirementRequest`

✅ **2. Backend Types** (`/root/airgen/backend/src/services/graph/requirements/requirements-crud.ts`)
- Added `attributes` to `RequirementInput` type
- Updated `mapRequirement()` function to extract attributes from Neo4j nodes

## Remaining Implementation Steps

### 3. Neo4j CRUD Operations

**File**: `/root/airgen/backend/src/services/graph/requirements/requirements-crud.ts`

**CREATE operation** (around line 200):
```typescript
CREATE (requirement:Requirement {
  // ... existing fields
  attributes: $attributes  // Add this line
})
```

**UPDATE operation** (around line 370):
```typescript
export async function updateRequirement(
  tenant: string,
  project: string,
  requirementId: string,
  updates: {
    text?: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    sectionId?: string;
    attributes?: Record<string, string | number | boolean | null>;  // Add this
  }
): Promise<RequirementRecord | null> {
  // ... in the SET clause:
  if (updates.attributes !== undefined) {
    setClauses.push("requirement.attributes = $attributes");
    params.attributes = updates.attributes;
  }
}
```

### 4. API Validation

**File**: `/root/airgen/backend/src/routes/requirements-api.ts`

**Line ~247** (PATCH endpoint schema):
```typescript
const bodySchema = z.object({
  text: z.string().min(10).optional(),
  pattern: z.enum(["ubiquitous", "event", "state", "unwanted", "optional"]).optional(),
  verification: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
  sectionId: z.string().optional(),
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});
```

**Line ~39** (POST endpoint schema):
```typescript
const requirementSchema = z.object({
  // ... existing fields
  attributes: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});
```

### 5. Markdown Persistence

**File**: `/root/airgen/backend/src/services/workspace.ts`

The YAML frontmatter already supports arbitrary fields, so attributes will automatically be persisted.
Just ensure the `writeRequirementMarkdown()` function includes attributes in the frontmatter.

### 6. Attribute Schema Configuration

**Create new file**: `/root/airgen/backend/src/services/graph/attribute-schemas.ts`

```typescript
export type AttributeType = 'string' | 'number' | 'boolean' | 'select';

export type AttributeDefinition = {
  key: string;
  label: string;
  type: AttributeType;
  required?: boolean;
  options?: string[];  // For select type
  defaultValue?: string | number | boolean | null;
};

export type AttributeSchema = {
  id: string;
  tenant: string;
  projectKey: string;
  attributes: AttributeDefinition[];
  createdAt: string;
  updatedAt: string;
};

// Store in Neo4j as:
// (project:Project)-[:HAS_ATTRIBUTE_SCHEMA]->(schema:AttributeSchema)
```

**Add routes**: `/root/airgen/backend/src/routes/attribute-schemas.ts`
- GET `/attribute-schemas/:tenant/:project` - Get schema for project
- PUT `/attribute-schemas/:tenant/:project` - Update schema
- POST `/attribute-schemas/:tenant/:project/attributes` - Add attribute definition

### 7. Frontend Dynamic Columns

**File**: `/root/airgen/frontend/src/components/DocumentView/RequirementsTable.tsx`

```typescript
// 1. Fetch attribute schema
const { data: attributeSchema } = useQuery({
  queryKey: ["attribute-schema", tenant, project],
  queryFn: () => api.getAttributeSchema(tenant, project)
});

// 2. Add dynamic columns to visibleColumns state
const [visibleColumns, setVisibleColumns] = useState({
  // ... existing columns
  ...Object.fromEntries(
    (attributeSchema?.attributes || []).map(attr => [`attr_${attr.key}`, true])
  )
});

// 3. Render dynamic attribute columns
{attributeSchema?.attributes.map(attrDef =>
  visibleColumns[`attr_${attrDef.key}`] && (
    <td key={attrDef.key}>
      {editingField === `attr_${attrDef.key}` ? (
        attrDef.type === 'select' ? (
          <select {...}>
            {attrDef.options.map(opt => <option key={opt}>{opt}</option>)}
          </select>
        ) : (
          <input type={attrDef.type} {...} />
        )
      ) : (
        req.attributes?.[attrDef.key]
      )}
    </td>
  )
)}
```

### 8. Column Selector UI

**File**: `/root/airgen/frontend/src/components/DocumentView/RequirementsTable.tsx`

Update the column selector dropdown to include custom attribute columns:

```typescript
{attributeSchema?.attributes.map(attr => (
  <div key={`attr_${attr.key}`}>
    <input
      type="checkbox"
      checked={visibleColumns[`attr_${attr.key}`]}
      onChange={() => handleToggleColumn(`attr_${attr.key}`)}
    />
    {attr.label}
  </div>
))}
```

### 9. Attribute Schema Management UI

**Create new file**: `/root/airgen/frontend/src/components/AttributeSchemaEditor.tsx`

Admin panel to:
- Add/remove custom attribute definitions
- Define type (string/number/boolean/select)
- Set options for select fields
- Reorder attributes
- Set visibility defaults

## Example Usage

Once implemented, users can:

1. **Define schema** (one-time setup):
   ```json
   {
     "attributes": [
       { "key": "priority", "label": "Priority", "type": "select", "options": ["High", "Medium", "Low"] },
       { "key": "safety_level", "label": "Safety Level", "type": "select", "options": ["ASIL-A", "ASIL-B", "ASIL-C", "ASIL-D"] },
       { "key": "cost_estimate", "label": "Cost ($)", "type": "number" },
       { "key": "verified", "label": "Verified", "type": "boolean" }
     ]
   }
   ```

2. **Edit requirements**:
   - Double-click any custom attribute cell
   - Select from dropdown (for select type)
   - Enter value (for string/number type)
   - Toggle checkbox (for boolean type)

3. **Query/filter**:
   - Future: Add Cypher query support for custom attributes
   - Example: `MATCH (r:Requirement) WHERE r.attributes.priority = 'High'`

## Migration Plan

1. Existing requirements without attributes will have `attributes: {}` or `attributes: null`
2. Schema is optional - projects without a schema show no custom columns
3. Backward compatible - all existing code continues to work

## Testing Checklist

- [ ] Create requirement with custom attributes
- [ ] Update custom attributes via inline editing
- [ ] Verify attributes persist to markdown files
- [ ] Verify attributes stored in Neo4j
- [ ] Test attribute schema CRUD operations
- [ ] Test dynamic columns show/hide
- [ ] Test different attribute types (string/number/boolean/select)
- [ ] Test backward compatibility (requirements without attributes)

## Performance Considerations

- Custom attributes stored as JSON in Neo4j (indexed for querying)
- Column visibility preferences stored in localStorage
- Schema cached in React Query
- Debounce inline editing updates

## Next Steps

To complete this implementation:
1. Implement remaining Neo4j CRUD changes
2. Add API validation
3. Create attribute schema service & routes
4. Implement dynamic columns in UI
5. Create schema management UI
6. Add comprehensive tests
