# Refactoring Plan: admin-users.ts

## Current State Analysis

**File:** `backend/src/routes/admin-users.ts` (1,234 lines)

### Identified Concerns

The file currently handles 7 distinct responsibilities:

1. **Route Registration** - Fastify route setup and configuration
2. **Request Validation** - Zod schema definitions (5 schemas)
3. **Authorization Logic** - Permission checking for super-admins and tenant-admins
4. **Business Logic** - User CRUD operations and permission management
5. **Data Transformation** - Converting DB models to API responses
6. **Email Notifications** - Sending emails on user creation/modification
7. **OpenAPI Documentation** - Extensive inline schema definitions

### Code Breakdown

- **Lines 1-45**: Imports and type definitions
- **Lines 47-96**: Validation schemas (5 Zod schemas)
- **Lines 99-202**: Helper functions (5 functions)
- **Lines 208-1234**: Route handlers (8 routes in one large function)
  - GET `/admin/users` (104 lines)
  - GET `/admin/users/:id` (69 lines)
  - POST `/admin/users` (171 lines)
  - PATCH `/admin/users/:id` (111 lines)
  - PATCH `/admin/users/:id/permissions` (193 lines)
  - POST `/admin/users/:id/permissions/grant` (143 lines)
  - POST `/admin/users/:id/permissions/revoke` (119 lines)
  - DELETE `/admin/users/:id` (64 lines)

### Issues

1. **Violation of Single Responsibility Principle**: File handles routing, authorization, business logic, and data transformation
2. **Code Duplication**: Authorization checks repeated in every handler
3. **Long Route Handlers**: Individual handlers range from 64-193 lines
4. **Mixed Concerns**: Business logic embedded in HTTP handlers
5. **Testing Difficulty**: Hard to unit test business logic separately from HTTP layer
6. **Poor Reusability**: Business logic can't be reused outside of HTTP context
7. **Maintenance Burden**: Changes to business logic require navigating large route handlers

## Refactoring Strategy

### Principles

- **Separation of Concerns**: Each layer has one responsibility
- **Dependency Injection**: Services are injected into routes
- **Single Responsibility**: Each function/class has one clear purpose
- **DRY**: Eliminate code duplication through abstraction
- **Testability**: Enable unit testing at each layer

### Target Architecture

```
Routes Layer          → Handle HTTP request/response
  ↓
Middleware Layer      → Common authorization checks
  ↓
Service Layer         → Business logic and orchestration
  ↓
Repository Layer      → Database operations (already exists)
```

## Refactoring Plan

### Phase 1: Extract Validation Schemas (Low Risk)

**Goal**: Move Zod schemas to separate file for better organization

**Files to Create:**
- `backend/src/validation/admin-users.schemas.ts`

**Tasks:**
1. Create new validation schemas file
2. Export all 5 Zod schemas:
   - `createUserSchema`
   - `updateUserSchema`
   - `updatePermissionsSchema`
   - `grantPermissionSchema`
   - `revokePermissionSchema`
3. Import schemas in admin-users.ts
4. Verify no behavior changes

**Impact:** Reduces admin-users.ts by ~50 lines

### Phase 2: Extract Authorization Service (Medium Risk)

**Goal**: Centralize authorization logic for reusability and testing

**Files to Create:**
- `backend/src/services/UserAuthorizationService.ts`

**Classes/Methods:**
```typescript
class UserAuthorizationService {
  isSuperAdmin(user: AuthUser): boolean
  getAdministeredTenants(user: AuthUser): Set<string>
  canManageUser(currentUser: AuthUser, targetUserId: string): Promise<boolean>
  canGrantPermission(currentUser: AuthUser, targetScope: PermissionScope): boolean
  canRevokePermission(currentUser: AuthUser, targetScope: PermissionScope): boolean
}
```

**Tasks:**
1. Create UserAuthorizationService class
2. Move helper functions (`isSuperAdmin`, `getAdministeredTenants`, `canManageUser`)
3. Add new methods for permission-specific authorization
4. Inject PermissionRepository into service
5. Write unit tests for authorization logic
6. Replace helper function calls with service calls in routes

**Impact:** Reduces admin-users.ts by ~75 lines, adds testable authorization layer

### Phase 3: Extract User Management Service (High Risk)

**Goal**: Move business logic out of route handlers into testable service layer

**Files to Create:**
- `backend/src/services/UserManagementService.ts`

**Classes/Methods:**
```typescript
class UserManagementService {
  // User CRUD
  listUsers(requestingUser: AuthUser): Promise<EnhancedUser[]>
  getUserById(userId: string, requestingUser: AuthUser): Promise<EnhancedUser | null>
  createUser(data: CreateUserInput, requestingUser: AuthUser): Promise<EnhancedUser>
  updateUser(userId: string, updates: UpdateUserInput, requestingUser: AuthUser): Promise<EnhancedUser>
  deleteUser(userId: string, requestingUser: AuthUser): Promise<boolean>

  // Permission management
  updateUserPermissions(userId: string, permissions: UserPermissions, requestingUser: AuthUser): Promise<EnhancedUser>
  grantPermission(userId: string, permission: PermissionGrant, requestingUser: AuthUser): Promise<EnhancedUser>
  revokePermission(userId: string, permission: PermissionRevoke, requestingUser: AuthUser): Promise<EnhancedUser>

  // Data transformation
  toEnhancedUser(user: User): Promise<EnhancedUser | null>
  sanitizeUser(user: EnhancedUser): SanitizedUser
}
```

**Tasks:**
1. Create UserManagementService class
2. Inject UserRepository, PermissionRepository, UserAuthorizationService, EmailService
3. Extract business logic from each route handler into service methods
4. Include authorization checks in service methods
5. Handle email notifications in service layer
6. Write comprehensive unit tests for service
7. Refactor route handlers to thin wrappers that call service methods

**Impact:** Reduces admin-users.ts by ~600 lines, creates testable business logic layer

### Phase 4: Extract OpenAPI Schemas (Low Risk)

**Goal**: Move OpenAPI schema definitions to separate file for cleaner routes

**Files to Create:**
- `backend/src/schemas/admin-users-api.schemas.ts`

**Tasks:**
1. Create OpenAPI schema definitions file
2. Extract all route schema definitions (request/response schemas)
3. Export schema objects
4. Import and use in route registration
5. Consider using a schema builder pattern to reduce duplication

**Impact:** Reduces admin-users.ts by ~200 lines

### Phase 5: Create Authorization Middleware (Medium Risk)

**Goal**: Create reusable middleware for common authorization patterns

**Files to Create:**
- `backend/src/middleware/admin-auth.middleware.ts`

**Middleware Functions:**
```typescript
requireSuperAdmin(req, reply, done)
requireTenantAdmin(req, reply, done)
requireUserManagementPermission(req, reply, done)
```

**Tasks:**
1. Create middleware functions using UserAuthorizationService
2. Apply middleware to routes via preHandler arrays
3. Simplify route handlers by removing redundant auth checks

**Impact:** Further reduces duplication in route handlers

### Phase 6: Simplify Route Handlers (Medium Risk)

**Goal**: Reduce route handlers to thin HTTP layer

**Target Structure:**
```typescript
app.get("/admin/users", {
  preHandler: [app.authenticate, requireUserManagementPermission],
  schema: adminUserSchemas.listUsers
}, async (req, reply) => {
  const users = await userManagementService.listUsers(req.currentUser);
  return { users };
});
```

**Tasks:**
1. Refactor each handler to:
   - Validate request (using Zod schemas)
   - Call service method
   - Return response
2. Move all business logic, authorization, and error handling to service layer
3. Keep handlers under 20 lines each

**Impact:** Reduces route handlers to minimal HTTP glue code

### Phase 7: Consider Route Splitting (Optional)

**Goal**: If still too large, split into multiple route files

**Potential Files:**
- `backend/src/routes/admin-users-crud.ts` - User CRUD operations
- `backend/src/routes/admin-users-permissions.ts` - Permission management

**Tasks:**
1. Group related routes together
2. Share service instances between route files
3. Register route groups separately

**Impact:** Could split remaining code into 2-3 smaller, focused files

## Expected Results

### Before Refactoring
- **1 file**: admin-users.ts (1,234 lines)
- **Responsibilities**: 7 mixed concerns
- **Testability**: Poor (requires HTTP mocking)
- **Reusability**: None (logic locked in routes)

### After Refactoring
- **Route file**: admin-users.ts (~200-300 lines)
- **Service layer**:
  - UserManagementService.ts (~300-400 lines)
  - UserAuthorizationService.ts (~150-200 lines)
- **Supporting files**:
  - Validation schemas (~60 lines)
  - OpenAPI schemas (~200 lines)
  - Middleware (~50 lines)
- **Responsibilities**: Clearly separated by layer
- **Testability**: Excellent (unit tests for services, integration tests for routes)
- **Reusability**: High (services can be used in other contexts)

### Benefits

1. **Maintainability**: Changes to business logic don't require touching route definitions
2. **Testability**: Can unit test authorization and business logic without HTTP layer
3. **Reusability**: Services can be used by other parts of the application (CLI, background jobs, etc.)
4. **Clarity**: Each file has a clear, single purpose
5. **Performance**: No performance impact, purely organizational
6. **Documentation**: Easier to understand and onboard new developers

## Risk Assessment

### Low Risk
- Extracting validation schemas (pure data, no logic)
- Extracting OpenAPI schemas (documentation only)

### Medium Risk
- Creating authorization service (logic extraction, needs thorough testing)
- Creating middleware (changes request flow)
- Simplifying route handlers (requires careful refactoring)

### High Risk
- Creating user management service (complex business logic extraction)
- Needs comprehensive test coverage before and after
- Should be done incrementally, one route at a time

## Testing Strategy

### Before Refactoring
1. Ensure existing integration tests pass
2. Add integration tests for any uncovered routes
3. Document current behavior

### During Refactoring
1. **For each service created:**
   - Write unit tests for all public methods
   - Test authorization logic thoroughly
   - Test error cases and edge cases
   - Achieve >90% code coverage

2. **For each route refactored:**
   - Ensure integration tests still pass
   - Compare request/response behavior with original
   - Test error responses match original

### After Refactoring
1. Run full integration test suite
2. Perform manual testing of admin user flows
3. Verify no regressions in functionality

## Implementation Order

1. ✅ Phase 1: Extract validation schemas (1-2 hours)
2. ✅ Phase 2: Extract authorization service (3-4 hours)
3. ✅ Phase 3: Extract user management service (8-12 hours)
4. ✅ Phase 4: Extract OpenAPI schemas (2-3 hours)
5. ✅ Phase 5: Create authorization middleware (2-3 hours)
6. ✅ Phase 6: Simplify route handlers (4-6 hours)
7. ⚠️ Phase 7: Consider route splitting (2-3 hours, if needed)

**Total Estimated Time:** 22-33 hours

## Success Criteria

- [ ] All existing integration tests pass
- [ ] All services have >90% unit test coverage
- [ ] Route handlers are under 30 lines each
- [ ] Business logic is fully decoupled from HTTP layer
- [ ] No code duplication in authorization checks
- [ ] All files under 500 lines
- [ ] Documentation updated to reflect new architecture
