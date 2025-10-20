# Refactoring Candidates

Analysis of the 10 longest source code files in the project.

## Top 10 Longest Files

1. ~~**1,234** lines~~ → ✅ **281 lines** - `./backend/src/routes/admin-users.ts` **(REFACTORED)**
2. **1,083** lines - `./backend/src/routes/core.ts`
3. **1,064** lines - `./backend/src/services/graph/requirements/requirements-crud.ts`
4. **1,027** lines - `./frontend/src/routes/DashboardRoute.tsx`
5. **1,026** lines - `./frontend/src/hooks/useArchitectureApi.ts`
6. **1,001** lines - `./backend/src/routes/requirements-api.ts`
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

### `backend/src/routes/core.ts` (1,083 lines)
**Issue:** A "core" route file this large might be a catch-all that should be broken into domain-specific routes.

**Recommendation:** Break into focused domain-specific route modules (e.g., separate files for different API endpoints).

### `frontend/src/routes/DashboardRoute.tsx` (1,027 lines)
**Issue:** React components over 1,000 lines are generally considered too complex and difficult to maintain.

**Recommendation:** Break into smaller sub-components and extract reusable logic into custom hooks.

## Priority: Medium (Borderline - Should Refactor)

### `backend/src/services/graph/requirements/requirements-crud.ts` (1,064 lines)
**Issue:** While CRUD services can reasonably be longer, over 1,000 lines suggests operations could be more modular.

**Recommendation:** Split create/read/update/delete operations into separate modules or use a more granular service structure.

### `frontend/src/hooks/useArchitectureApi.ts` (1,026 lines)
**Issue:** Custom hooks this large likely contain too much logic and violate the single responsibility principle.

**Recommendation:** Split into multiple focused hooks, each handling a specific aspect of the architecture API.

### `backend/src/routes/requirements-api.ts` (1,001 lines)
**Issue:** Route file just over the 1,000 line threshold.

**Recommendation:** Extract business logic into services and split routes into smaller, focused modules.

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
