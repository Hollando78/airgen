# Auth Context Migration Status

## Overview
Migrating all graph operations from using `'system'` as `changedBy` to using actual authenticated `userId` for proper audit trails.

## ✅ Completed (4 files - 11 TODOs fixed)

### 1. trace.ts ✅
- `createTraceLink()` - Added `userId` parameter, passing to version creation
- `deleteTraceLink()` - Added `userId` parameter, passing to version creation
- **Routes updated**: `/routes/trace.ts` - Added `onRequest: [app.authenticate]` and passing `req.currentUser!.sub`

### 2. infos.ts ✅
- `createInfo()` - Added `userId` parameter in params object
- `updateInfo()` - Added `userId` parameter as 5th argument
- `deleteInfo()` - Added `userId` parameter as 4th argument

### 3. linksets.ts ✅
- `createLinkset()` - Added `userId` parameter in params object
- `updateLinkset()` - Added `userId` parameter in params object
- `deleteLinkset()` - Added `userId` parameter in params object

### 4. surrogates.ts ✅
- `createSurrogateReference()` - Added `userId` parameter in params object
- `deleteSurrogateReference()` - Added `userId` parameter as 4th argument

## ⏳ Remaining (6 files - ~18 TODOs)

### 5. documents/documents-crud.ts (3 TODOs)
Functions to update:
- `createDocument()` - line ~XXX
- `updateDocument()` - line ~XXX
- `deleteDocument()` - line ~XXX

### 6. documents/documents-sections.ts (3 TODOs)
Functions to update:
- `createDocumentSection()` - line ~XXX
- `updateDocumentSection()` - line ~XXX
- `deleteDocumentSection()` - line ~XXX

### 7. architecture/diagrams.ts (3 TODOs)
Functions to update:
- `createArchitectureDiagram()` - line ~XXX
- `updateArchitectureDiagram()` - line ~XXX
- `deleteArchitectureDiagram()` - line ~XXX

### 8. architecture/blocks.ts (3 TODOs)
Functions to update:
- `createPlacedBlock()` - line ~XXX
- `updatePlacedBlock()` - line ~XXX
- `deletePlacedBlock()` - line ~XXX

### 9. architecture/connectors.ts (3 TODOs)
Functions to update:
- `createArchitectureConnector()` - line ~XXX
- `updateArchitectureConnector()` - line ~XXX
- `deleteArchitectureConnector()` - line ~XXX

### 10. requirements/requirements-crud.ts (3 TODOs)
Functions to update:
- `createRequirement()` - line ~XXX
- `updateRequirement()` - line ~XXX
- `deleteRequirement()` - line ~XXX

## Pattern for Updates

### Service Function Signature
**Before:**
```typescript
export async function createX(params: {
  tenant: string;
  // ... other params
}): Promise<XRecord> {
```

**After:**
```typescript
export async function createX(params: {
  tenant: string;
  // ... other params
  userId: string;
}): Promise<XRecord> {
```

### Version Creation Call
**Before:**
```typescript
await createXVersion(tx, {
  // ... params
  changedBy: 'system', // TODO: Get from auth context
  changeType: 'created',
  // ... more params
});
```

**After:**
```typescript
await createXVersion(tx, {
  // ... params
  changedBy: params.userId, // or userId if positional param
  changeType: 'created',
  // ... more params
});
```

### Route Handler
**Before:**
```typescript
app.post("/endpoint", {
  schema: { /* ... */ }
}, async (req) => {
  await createX({
    // params
  });
});
```

**After:**
```typescript
app.post("/endpoint", {
  onRequest: [app.authenticate],  // ← Add this
  schema: { /* ... */ }
}, async (req) => {
  await createX({
    // params
    userId: req.currentUser!.sub  // ← Add this
  });
});
```

## Next Steps

1. ✅ Update remaining 6 service files (18 functions)
2. ⏳ Update all route handlers to pass `userId`
3. ⏳ Test with curl/Postman
4. ⏳ Run existing tests to ensure nothing broke
5. ⏳ Verify audit trail in Neo4j

## Testing Commands

```bash
# Test trace link creation with auth
TOKEN="<jwt-token>"
curl -X POST http://localhost:8787/api/trace-links \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "hollando",
    "projectKey": "main-battle-tank",
    "sourceRequirementId": "req-1",
    "targetRequirementId": "req-2",
    "linkType": "satisfies"
  }'

# Check version history in Neo4j
MATCH (v:TraceLinkVersion)
WHERE v.changedBy <> 'system'
RETURN v.changedBy, v.changeType, v.createdAt
ORDER BY v.createdAt DESC
LIMIT 10
```

## Audit Trail Benefits

After completion, every graph operation will have:
- Real user IDs instead of 'system'
- Complete audit trail for compliance
- Ability to track who made what changes
- Support for user-specific change reports
- Rollback attribution
