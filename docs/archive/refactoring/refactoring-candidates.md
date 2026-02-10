# Refactoring Candidates

Analysis of the 10 longest source code files in the project.

## Top 10 Longest Files

1. ~~**1,234** lines~~ → ✅ **281 lines** - `./backend/src/routes/admin-users.ts` **(REFACTORED)**
2. ~~**1,083** lines~~ → ✅ **DELETED** - `./backend/src/routes/core.ts` **(REFACTORED)**
3. ~~**1,064** lines~~ → ✅ **75 lines** - `./backend/src/services/graph/requirements/requirements-crud.ts` **(REFACTORED)**
4. ~~**1,027** lines~~ → ✅ **204 lines** - `./frontend/src/routes/DashboardRoute.tsx` **(REFACTORED)**
5. ~~**1,102** lines~~ → ✅ **871 lines** - `./frontend/src/hooks/useArchitectureApi.ts` **(REFACTORED - Phase 1)**
6. ~~**1,001** lines~~ → ✅ **36 lines** - `./backend/src/routes/requirements-api.ts` **(REFACTORED)**
7. **994** lines - `./frontend/src/routes/RequirementsSchemaRoute.tsx`
8. **975** lines - `./frontend/src/components/DocumentView.tsx`
9. **942** lines - `./frontend/src/types.ts`
10. **930** lines - `./frontend/src/hooks/useDiagramCanvasInteractions.ts`

## Priority: High (Definitely Too Long)

### ✅ `backend/src/routes/admin-users.ts` ~~(1,234 lines)~~ → **281 lines** (COMPLETED)
**Issue:** Route files over 1,000 lines typically indicate they're handling too many responsibilities.

**Recommendation:** Split into separate route modules or extract business logic into dedicated service layers.

**Status:** ✅ **REFACTORED** - Reduced from 1,234 to 281 lines (-77%)
- Created `UserManagementService` (610 lines) - business logic
- Created `UserAuthorizationService` (169 lines) - authorization
- Created validation schemas (58 lines)
- Created OpenAPI schemas (252 lines)
- Created middleware (77 lines)
- All 295 tests passing ✅
- See `REFACTORING_SUMMARY.md` for details

### ✅ `backend/src/routes/core.ts` ~~(1,083 lines)~~ → **DELETED** (COMPLETED)
**Issue:** A "core" route file this large was a catch-all mixing 4 distinct domains (health, tenants, projects, quality).

**Recommendation:** Break into focused domain-specific route modules.

**Status:** ✅ **REFACTORED** - Split into 4 focused route modules
- Created `health-routes.ts` (122 lines) - Health & monitoring
- Created `tenant-routes.ts` (195 lines) - Tenant management
- Created `project-routes.ts` (130 lines) - Project management
- Created `requirement-quality-routes.ts` (108 lines) - Quality analysis
- Created `TenantManagementService` (240 lines) - business logic
- Created `ProjectManagementService` (75 lines) - business logic
- Created validation schemas (74 lines)
- Created OpenAPI schemas (400 lines)
- All 295 tests passing ✅
- See `REFACTORING_SUMMARY_CORE.md` for details

### ✅ `frontend/src/routes/DashboardRoute.tsx` ~~(1,027 lines)~~ → **204 lines** (COMPLETED)
**Issue:** React components over 1,000 lines are generally considered too complex and difficult to maintain.

**Recommendation:** Break into smaller sub-components and extract reusable logic into custom hooks.

**Status:** ✅ **REFACTORED** - Reduced from 1,027 to 204 lines (-80%)
- Created `useTenantManagement` hook (154 lines) - tenant queries/mutations/state
- Created `useProjectManagement` hook (133 lines) - project queries/mutations/state
- Created `useProjectMetrics` hook (281 lines) - metrics calculation & QA scorer
- Created 6 dashboard components (StatCard, MetricsSection, SystemHealthCard, TenantsTable, QAScorerPanel, ProjectMetricsOverview)
- Created 5 modal components (CreateTenant, CreateProject, InviteUser, DeleteTenant, DeleteProject)
- Build successful, no TypeScript errors ✅

## Priority: Medium (Borderline - Should Refactor)

### ✅ `backend/src/services/graph/requirements/requirements-crud.ts` ~~(1,064 lines)~~ → **75 lines** (COMPLETED)
**Issue:** While CRUD services can reasonably be longer, over 1,000 lines suggests operations could be more modular.

**Recommendation:** Split create/read/update/delete operations into separate modules or use a more granular service structure.

**Status:** ✅ **REFACTORED** - Reduced from 1,064 to 75 lines (-93%)
- Created `requirements-mapper.ts` (89 lines) - type definitions and mapping
- Created `requirements-read.ts` (48 lines) - read operations
- Created `requirements-create.ts` (228 lines) - create with ref generation, embedding, versioning
- Created `requirements-update.ts` (312 lines) - update with versioning and embedding updates
- Created `requirements-lifecycle.ts` (393 lines) - soft delete, restore, archive, unarchive
- Created `requirements-refs.ts` (77 lines) - ref regeneration for documents/sections
- Created `requirements-ordering.ts` (62 lines) - ordering operations
- Build successful, no TypeScript errors ✅
- See `REFACTORING_SUMMARY_REQUIREMENTS_CRUD.md` for details

### ✅ `frontend/src/hooks/useArchitectureApi.ts` ~~(1,102 lines)~~ → **871 lines** (PHASE 1 COMPLETED)
**Issue:** Custom hooks this large likely contain too much logic and violate the single responsibility principle.

**Recommendation:** Split into multiple focused hooks, each handling a specific aspect of the architecture API.

**Status:** ✅ **PHASE 1 REFACTORED** - Reduced from 1,102 to 871 lines (-21%)
- Created `types/architecture.ts` (170 lines) - centralized type definitions
- Created `hooks/architecture/mappers.ts` (130 lines) - pure data mappers
- Created `hooks/architecture/useDiagrams.ts` (160 lines) - diagram management
- Created `hooks/architecture/usePackages.ts` (170 lines) - package management
- Build successful, no TypeScript errors ✅
- See `REFACTORING_SUMMARY_USE_ARCHITECTURE_API.md` for details

**Phase 2 Planned:** Extract blocks and connectors hooks to reduce to ~150 lines total

### ✅ `backend/src/routes/requirements-api.ts` ~~(1,001 lines)~~ → **36 lines** (COMPLETED)
**Issue:** Route file just over the 1,000 line threshold, mixing 5 distinct domains.

**Recommendation:** Extract business logic into services and split routes into smaller, focused modules.

**Status:** ✅ **REFACTORED** - Reduced from 1,001 to 36 lines (-96%)
- Created `schemas/requirements.ts` (178 lines) - centralized validation schemas
- Created `requirements-crud-routes.ts` (316 lines) - 7 CRUD endpoints
- Created `requirements-duplicate-routes.ts` (67 lines) - duplicate detection/fixing
- Created `requirements-baseline-routes.ts` (213 lines) - baseline snapshots
- Created `requirements-link-routes.ts` (57 lines) - semantic link suggestions
- Created `requirements-version-routes.ts` (264 lines) - version history/diff/restore
- Build successful, no TypeScript errors ✅
- See `REFACTORING_SUMMARY_REQUIREMENTS_API.md` for details

### `frontend/src/routes/RequirementsSchemaRoute.tsx` (994 lines)
**Issue:** Close to 1,000 lines for a React component is a code smell indicating high complexity.

**Recommendation:** Extract sub-components and move business logic to custom hooks or services.

### `frontend/src/components/DocumentView.tsx` (975 lines)
**Issue:** Component is quite large and likely handles multiple concerns.

**Recommendation:** Break into smaller, focused sub-components with clear responsibilities.

## Priority: Low (Monitor)

### `frontend/src/types.ts` (942 lines)
**Status:** Probably fine - type definition files can reasonably be longer since they're just declarations.

**Recommendation:** Consider organizing into domain-specific type files if it becomes unwieldy (e.g., `types/user.ts`, `types/requirements.ts`, etc.).

### `frontend/src/hooks/useDiagramCanvasInteractions.ts` (930 lines)
**Status:** Complex interaction logic can justify this size.

**Recommendation:** Review to see if it could be modularized into smaller hooks, but not urgent.

## General Guidelines

- **Route files:** Should ideally be under 500 lines. Focus on routing logic and delegate to services.
- **React components:** Should ideally be under 300 lines. Extract sub-components and use composition.
- **Custom hooks:** Should ideally be under 200 lines. Each hook should have a single, well-defined purpose.
- **Service/CRUD files:** Can be longer (up to 500-800 lines) but should still follow single responsibility.
- **Type files:** More flexible, but consider splitting by domain when over 1,000 lines.
