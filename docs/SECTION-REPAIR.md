# Requirement Section Repair

## Summary

Fixed requirement section assignments after October 10 backup restore where all requirements were incorrectly grouped into generic "Unsectioned Requirements" sections instead of their proper categorized sections.

## Problem

After the backup restore, **all 32 requirements lost their specific section assignments**:

### Before Repair (Incorrect State)
```
system-requirements-document:
  └─ Unsectioned Requirements (16 requirements)
      ├─ SRD-ARCH-004, SRD-ARCH-005  (should be in Architecture)
      ├─ SRD-DEF-001, SRD-DEF-002    (should be in Defensive)
      ├─ SRD-FUN-006, SRD-FUN-007... (should be in Functional)
      └─ ... (all mixed together)

turret-spec:
  └─ Unsectioned Requirements (6 requirements)
      └─ TRT-ENV-001, TRT-FUN-003... (all mixed together)

user-requirements-document:
  └─ Unsectioned Requirements (10 requirements)
      └─ URD-KEY-001, URD-KEY-002... (all in one section)
```

### After Repair (Correct State)
```
system-requirements-document:
  ├─ ARCH: System Architecture (2 requirements)
  ├─ DEF: Defensive Requirements (2 requirements)
  ├─ FUN: Functional Requirements (7 requirements)
  ├─ ENV: Environmental (1 requirement)
  ├─ MTN: Maintainability (1 requirement)
  ├─ LGL: Legislation (1 requirement)
  ├─ LETH: Lethality (1 requirement)
  └─ RED: Readiness (1 requirement)

turret-spec:
  ├─ ENV: Environmental (2 requirements)
  ├─ PHY: Physical (1 requirement)
  ├─ FUN: Functional Requirements (2 requirements)
  └─ INT: Interfaces (1 requirement)

user-requirements-document:
  └─ KEY: Key Requirements (10 requirements)
```

## Root Cause

During the October 10 backup restore:
1. Requirements were imported successfully with their proper reference IDs
2. Document sections were created with correct metadata (names, shortCodes, etc.)
3. **But the requirement-to-section relationships were not properly restored**
4. Instead, catch-all "Unsectioned Requirements" sections were created
5. All requirements were connected to these generic sections

## Solution

### Detection Pattern

Requirements follow a naming convention: `{DOC_CODE}-{SECTION_CODE}-{NUMBER}`

Examples:
- `SRD-ARCH-004` → **S**ystem **R**equirements **D**ocument, **ARCH**itecture section
- `URD-KEY-001` → **U**ser **R**equirements **D**ocument, **KEY** requirements section
- `TRT-FUN-003` → **T**u**R**re**T** spec, **FUN**ctional section

### Repair Process

**Step 1: Identify Orphaned Requirements**
```cypher
MATCH (doc:Document)-[:HAS_SECTION]->(unsectionedSection:DocumentSection)
WHERE unsectionedSection.name = 'Unsectioned Requirements'
MATCH (unsectionedSection)-[:CONTAINS]->(req:Requirement)
RETURN req.ref, doc.slug
```

**Step 2: Parse Section Code from Requirement Reference**
```typescript
const refParts = reqRef.split('-');  // ['SRD', 'ARCH', '004']
const sectionCode = refParts[1];     // 'ARCH'
```

**Step 3: Find Target Section by Short Code**
```cypher
MATCH (doc:Document)-[:HAS_SECTION]->(section:DocumentSection)
WHERE section.shortCode = $sectionCode  // 'ARCH'
RETURN section
```

**Step 4: Move Requirement**
```cypher
MATCH (currentSection:DocumentSection)-[oldRel:CONTAINS]->(req:Requirement)
MATCH (targetSection:DocumentSection {shortCode: $sectionCode})
DELETE oldRel
CREATE (targetSection)-[:CONTAINS]->(req)
```

**Step 5: Cleanup Empty Sections**
```cypher
MATCH (section:DocumentSection {name: 'Unsectioned Requirements'})
WHERE NOT (section)-[:CONTAINS]->()
DETACH DELETE section
```

## Repair Results

### Execution Summary
- **Total requirements processed**: 32
- **Successfully moved**: 32 (100%)
- **Failed to move**: 0
- **Empty sections deleted**: 3

### Detailed Breakdown

#### System Requirements Document (16 requirements)
| Section | Code | Count | Requirements |
|---------|------|-------|-------------|
| System Architecture | ARCH | 2 | SRD-ARCH-004, SRD-ARCH-005 |
| Defensive Requirements | DEF | 2 | SRD-DEF-001, SRD-DEF-002 |
| Functional Requirements | FUN | 7 | SRD-FUN-006/007/008/009/010/011/014 |
| Environmental | ENV | 1 | SRD-ENV-012 |
| Maintainability | MTN | 1 | SRD-MTN-013 |
| Legislation | LGL | 1 | SRD-LGL-015 |
| Lethality | LETH | 1 | SRD-LETH-016 |
| Readiness | RED | 1 | SRD-RED-003 |

#### Turret Spec (6 requirements)
| Section | Code | Count | Requirements |
|---------|------|-------|-------------|
| Environmental | ENV | 2 | TRT-ENV-001, TRT-ENV-004 |
| Physical | PHY | 1 | TRT-PHY-002 |
| Functional Requirements | FUN | 2 | TRT-FUN-003, TRT-FUN-006 |
| Interfaces | INT | 1 | TRT-INT-005 |

#### User Requirements Document (10 requirements)
| Section | Code | Count | Requirements |
|---------|------|-------|-------------|
| Key Requirements | KEY | 10 | URD-KEY-001 through URD-KEY-010 |

## Diagnostic Scripts Created

### `check-requirement-sections.ts`
- Lists all requirements and their section relationships
- Identifies requirements with section-based IDs but no section
- Shows empty sections
- Analyzes ID patterns

### `analyze-requirement-section-mapping.ts`
- Examines requirement properties
- Shows section metadata
- Tests matching logic between refs and section codes

### `repair-requirement-sections.ts`
- **Main repair script**
- Parses section codes from requirement references
- Moves requirements to proper sections
- Provides detailed progress and verification

### `cleanup-empty-unsectioned.ts`
- Removes empty "Unsectioned Requirements" sections
- Verifies document structure after cleanup

## Verification

After repair, verified that:
✅ All 32 requirements have proper section assignments
✅ Requirements are grouped by their section codes
✅ No requirements remain in "Unsectioned Requirements"
✅ Empty catch-all sections have been deleted
✅ Section metadata (names, shortCodes, order) is intact
✅ Document structure is correct

## Prevention

To prevent this issue in future restores:

1. **Backup Verification**: The `verify-restore-data.ts` script should check:
   - Requirements are properly distributed across sections
   - No excessive use of "Unsectioned Requirements" sections
   - Section assignments match requirement reference patterns

2. **Backup Process**: Ensure DocumentSection → CONTAINS → Requirement relationships are properly captured in backups

3. **Import Process**: When importing requirements, verify section relationships are created based on requirement ref patterns

## Impact

**User-Facing Impact**:
- ✅ Requirements now appear in correct sections in the UI
- ✅ Document structure matches intended organization
- ✅ Section-based navigation and filtering works correctly
- ✅ Reports and exports show proper categorization

**Data Integrity**:
- ✅ Graph structure matches application expectations
- ✅ No orphaned or misplaced requirements
- ✅ Section metadata preserved

## Related Issues

- October 10 backup restore - Missing DocumentLinksets (fixed separately)
- Section heading display showing `null` in some queries (cosmetic query issue, data is correct)

---

**Date**: 2025-10-10
**Status**: ✅ Complete - All requirements properly assigned to sections
**Files Modified**: None (graph database only)
**Scripts Created**: 4 diagnostic/repair scripts in `/root/airgen/backend/`
