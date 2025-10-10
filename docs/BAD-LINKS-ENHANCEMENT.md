# Bad Links Detection Enhancement

## Summary

Enhanced the **Admin Requirements Route** bad links detection to identify TraceLinks that exist without corresponding DocumentLinksets.

## Problem

The Admin Requirements Route's "Bad Links" tab previously only detected:
1. **Broken links** - TraceLinks pointing to deleted/archived requirements
2. **Duplicate links** - Multiple TraceLinks to the same target with the same link type

However, it didn't detect **orphaned TraceLinks** - links that exist between two valid requirements but lack the required DocumentLinkset metadata node that groups links by document pairs.

## Solution

### Backend Changes

**File**: `/root/airgen/backend/src/routes/admin-requirements.ts`

Enhanced the Cypher query in the `/admin/requirements/bad-links` endpoint to:

1. **Find documents containing source and target requirements** for each TraceLink
2. **Check if a DocumentLinkset exists** for that document pair
3. **Mark links as `missing_linkset`** when:
   - TraceLink exists
   - Both source and target requirements exist and are valid
   - Both requirements are in documents
   - No DocumentLinkset connects those two documents

#### Key Query Addition (lines 350-389)

```cypher
// Get the documents containing source and target requirements
OPTIONAL MATCH (sourceDoc:Document)-[:CONTAINS]->(sourceReqForDoc:Requirement)
WHERE traceLink IS NOT NULL
  AND sourceReqForDoc.id = CASE
    WHEN traceLink.sourceRequirementId = requirement.id THEN requirement.id
    ELSE (CASE WHEN fromReq IS NOT NULL THEN fromReq.id ELSE NULL END)
  END

OPTIONAL MATCH (targetDoc:Document)-[:CONTAINS]->(targetReqForDoc:Requirement)
WHERE traceLink IS NOT NULL
  AND targetReqForDoc.id = CASE
    WHEN traceLink.sourceRequirementId = requirement.id THEN (CASE WHEN toReq IS NOT NULL THEN toReq.id ELSE NULL END)
    ELSE requirement.id
  END

// Check if a DocumentLinkset exists for this document pair
OPTIONAL MATCH (sourceDoc)<-[:LINKS_FROM]-(linkset:DocumentLinkset)-[:LINKS_TO]->(targetDoc)
WHERE linkset.tenant = $tenantSlug AND linkset.projectKey = $projectSlug

// Add isMissingLinkset check
isMissingLinkset: traceLink IS NOT NULL AND toReq IS NOT NULL AND fromReq IS NOT NULL
  AND sourceDoc IS NOT NULL AND targetDoc IS NOT NULL AND linkset IS NULL
```

### Frontend Changes

**File**: `/root/airgen/frontend/src/routes/AdminRequirementsRoute.tsx`

1. **Updated TypeScript type** (line 26):
   ```typescript
   brokenLinksMetadata?: Array<{ linkId: string; type: 'broken' | 'duplicate' | 'missing_linkset' }>;
   ```

2. **Added UI badge** for missing linksets (lines 431-442):
   ```tsx
   {missingLinksetCount > 0 && (
     <span style={{
       fontSize: '0.75rem',
       padding: '0.25rem 0.5rem',
       borderRadius: '0.25rem',
       backgroundColor: '#dbeafe',
       color: '#1e40af',
       fontWeight: '500'
     }}>
       {missingLinksetCount} Missing Linkset
     </span>
   )}
   ```

## Detection Types

The "Bad Links" tab now detects **three types** of link issues:

| Type | Badge Color | Description |
|------|------------|-------------|
| **Broken** | Red | TraceLink points to deleted/archived requirement |
| **Duplicate** | Yellow | Multiple TraceLinks to same target with same link type |
| **Missing Linkset** | Blue | TraceLink exists but no DocumentLinkset for document pair |

## Testing

### Test Case: main-battle-tank Project

**Initial State** (after October 10 backup restore):
- 4 TraceLinks existed
- 0 DocumentLinksets (missing metadata layer)
- All 4 links were orphaned

**Test Results**:
1. ✅ Enhanced query correctly identified all 4 TraceLinks as `missing_linkset`
2. ✅ Reconstructed 2 DocumentLinksets for 2 document pairs:
   - `system-requirements-document` ↔ `turret-spec` (2 TraceLinks)
   - `user-requirements-document` ↔ `system-requirements-document` (2 TraceLinks)
3. ✅ After reconstruction, query correctly returned 0 bad links

### Document Pairs

TraceLinks are grouped by document pairs via DocumentLinksets:

```
user-requirements-document (URD)
  └─ derives ─> system-requirements-document (SRD)
                  └─ satisfies ─> turret-spec (TRT)
```

## Related Scripts

Created diagnostic and repair scripts:

- `backend/test-bad-links-query.ts` - Test the enhanced bad links query
- `backend/check-linksets-status.ts` - Inspect TraceLinks and DocumentLinksets
- `backend/cleanup-orphaned-linksets.ts` - Remove orphaned DocumentLinksets
- `backend/reconstruct-all-linksets.ts` - Rebuild DocumentLinksets from TraceLinks

## Graph Structure

### Correct Structure
```
(DocumentLinkset)-[:LINKS_FROM]->(Document A)
(DocumentLinkset)-[:LINKS_TO]->(Document B)
(Document A)-[:CONTAINS]->(Requirement 1)
(Document B)-[:CONTAINS]->(Requirement 2)
(Project)-[:HAS_TRACE_LINK]->(TraceLink)
(TraceLink)-[:FROM_REQUIREMENT]->(Requirement 1)
(TraceLink)-[:TO_REQUIREMENT]->(Requirement 2)
```

### Orphaned Link (now detected)
```
(Document A)-[:CONTAINS]->(Requirement 1)
(Document B)-[:CONTAINS]->(Requirement 2)
(Project)-[:HAS_TRACE_LINK]->(TraceLink)
(TraceLink)-[:FROM_REQUIREMENT]->(Requirement 1)
(TraceLink)-[:TO_REQUIREMENT]->(Requirement 2)
❌ NO DocumentLinkset connecting Documents A and B
```

## Benefits

1. **Data Integrity** - Ensures all TraceLinks have proper metadata grouping
2. **Backup Verification** - Detects incomplete backup restores
3. **Admin Visibility** - UI clearly shows which requirements have orphaned links
4. **Automated Detection** - No manual database queries needed

## Future Enhancements

Consider adding:
- Auto-repair option (create missing DocumentLinksets automatically)
- Detect DocumentLinksets with no TraceLinks (reverse orphan check)
- Validation in backup/restore process

---

**Last Updated**: 2025-10-10
**Related Issue**: "Bad Links on Admin Requirements Route needs to be able to detect links with no Link Set"
**Status**: ✅ Complete and tested
