# AIRGen Test Infrastructure

This document provides an overview of the comprehensive test infrastructure implemented for the AIRGen project.

## Overview

The test infrastructure includes:
- Backend API route tests using Vitest and Fastify
- Frontend component and hook tests using Vitest, React Testing Library, and Happy DOM
- Test helpers and utilities for both backend and frontend
- Mock services for external dependencies

## Backend Tests

### Configuration

- **Test Framework**: Vitest
- **Configuration File**: `/root/airgen/backend/vitest.config.ts`
- **Test Pattern**: `src/**/*.test.ts`

### Running Backend Tests

```bash
cd /root/airgen/backend
pnpm test          # Run all tests once
pnpm test:watch    # Run tests in watch mode (if configured)
```

### Backend Test Structure

```
backend/src/
├── __tests__/
│   └── helpers/
│       ├── test-app.ts          # Fastify test app factory
│       ├── test-data.ts         # Test data fixtures
│       └── mock-services.ts     # Service mocks
└── routes/
    └── __tests__/
        ├── auth.test.ts         # Authentication route tests
        ├── requirements-api.test.ts  # Requirements CRUD tests
        └── airgen.test.ts       # AI generation route tests
```

### Backend Test Helpers

#### `createTestApp()`
Creates a minimal Fastify instance for testing:
```typescript
const app = await createTestApp();
await app.register(yourRoutes);
await app.ready();
```

#### `createTestToken()`
Generates JWT tokens for authenticated requests:
```typescript
const token = await createTestToken(app, {
  sub: "user-123",
  email: "test@example.com",
  roles: ["user"]
});
```

#### `authenticatedInject()`
Helper for making authenticated requests:
```typescript
const response = await authenticatedInject(app, {
  method: "POST",
  url: "/api/endpoint",
  payload: { data: "value" },
  token: authToken
});
```

### Backend Test Coverage

#### Authentication Tests (`auth.test.ts`)
- ✅ Successful login with valid credentials
- ✅ Login failure with invalid credentials
- ✅ User not found scenarios
- ✅ Email format validation
- ✅ Password field validation
- ✅ Case-insensitive email matching
- ✅ Legacy password upgrade
- ✅ Current user retrieval with valid token
- ✅ Unauthorized access without token
- ✅ Invalid token handling
- ✅ Multi-tenant user support

#### Requirements API Tests (`requirements-api.test.ts`)
- ✅ Create requirement with valid data
- ✅ Create requirement with minimal data
- ✅ Field validation (required fields, minimum length)
- ✅ Pattern and verification enum validation
- ✅ QA metadata handling
- ✅ List requirements with pagination
- ✅ Sort requirements by multiple fields
- ✅ Retrieve specific requirement
- ✅ Update requirement (text, pattern, verification)
- ✅ Soft delete requirement
- ✅ Find duplicate references
- ✅ Create and list baselines

#### AIRGen Tests (`airgen.test.ts`)
- ✅ Generate requirement candidates from user input
- ✅ Authentication requirement
- ✅ Input validation
- ✅ Glossary and constraints support
- ✅ Attached documents handling
- ✅ Diagram generation mode
- ✅ Error handling
- ✅ List candidates
- ✅ Accept candidate (create requirement)
- ✅ Reject candidate
- ✅ Return rejected candidate to pending
- ✅ Tenant/project ownership validation

## Frontend Tests

### Configuration

- **Test Framework**: Vitest
- **DOM Environment**: Happy DOM
- **Testing Library**: React Testing Library
- **Configuration File**: `/root/airgen/frontend/vitest.config.ts`
- **Setup File**: `/root/airgen/frontend/src/__tests__/setup.ts`

### Running Frontend Tests

```bash
cd /root/airgen/frontend
pnpm test          # Run all tests once
pnpm test:watch    # Run tests in watch mode
pnpm test:ui       # Run tests with UI
```

### Frontend Test Structure

```
frontend/src/
├── __tests__/
│   ├── setup.ts                 # Global test setup
│   ├── helpers/
│   │   ├── test-utils.tsx       # Custom render functions
│   │   └── test-data.ts         # Test data fixtures
│   ├── components/
│   │   └── LoginModal.test.tsx  # LoginModal component tests
│   └── hooks/
│       └── useTenantProject.test.ts  # Hook tests
```

### Frontend Test Helpers

#### Custom Render Functions

##### `renderWithProviders()`
Renders component with all necessary providers:
```typescript
renderWithProviders(<YourComponent />);
```

Includes:
- QueryClientProvider
- BrowserRouter
- AuthProvider
- TenantProjectProvider

##### `renderWithQueryClient()`
For testing components that only need React Query:
```typescript
renderWithQueryClient(<YourComponent />);
```

##### `renderWithRouter()`
For testing components that only need routing:
```typescript
renderWithRouter(<YourComponent />);
```

#### Mock Utilities

##### `createMockResponse()`
Creates mock fetch responses:
```typescript
const response = createMockResponse({ token: "abc123" }, 200);
```

##### `mockFetch()`
Mocks global fetch:
```typescript
mockFetch(vi.fn().mockImplementation((url) => {
  if (url.includes("/api/auth/login")) {
    return Promise.resolve(createMockResponse({ token: "..." }));
  }
}));
```

### Frontend Test Coverage

#### LoginModal Tests (`LoginModal.test.tsx`)
- ✅ Renders when open
- ✅ Doesn't render when closed
- ✅ User input handling (email, password)
- ✅ Empty form validation
- ✅ Successful login flow
- ✅ Login failure handling
- ✅ Loading states
- ✅ Modal close on cancel
- ✅ Modal close on backdrop click
- ✅ Form clearing after successful login
- ✅ Network error handling
- ✅ HTML5 validation attributes

#### useTenantProject Hook Tests (`useTenantProject.test.ts`)
- ✅ Initialize with null values
- ✅ Load state from localStorage
- ✅ Set tenant with persistence
- ✅ Set project with persistence
- ✅ Clear project when tenant is null
- ✅ Keep project when changing tenant
- ✅ Reset both tenant and project
- ✅ Multiple project switches
- ✅ Handle corrupted localStorage
- ✅ Handle partial localStorage data
- ✅ Persist across re-renders
- ✅ Error when used outside provider
- ✅ localStorage updates on every change
- ✅ Stable function references

## Mock Services

### Backend Mocks (`mock-services.ts`)

Provides mock implementations for:
- Neo4j graph operations (createRequirement, listRequirements, etc.)
- Workspace operations (readRequirementMarkdown, writeRequirementMarkdown)
- Dev users operations (listDevUsers, verifyDevUserPassword)
- OpenAI API calls

Usage:
```typescript
import { setupSuccessfulMocks, resetAllMocks } from "../../__tests__/helpers/mock-services";

beforeEach(() => {
  setupSuccessfulMocks();
});

afterEach(() => {
  resetAllMocks();
});
```

### Frontend Mocks (`setup.ts`)

Automatically mocks:
- `window.matchMedia`
- `localStorage` (with in-memory implementation)
- `IntersectionObserver`
- `ResizeObserver`

## Test Data Fixtures

### Backend Test Data
Located in `/root/airgen/backend/src/__tests__/helpers/test-data.ts`:
- `testUsers`: User fixtures (admin, regular user, multi-tenant user)
- `testRequirements`: Requirement fixtures
- `testCandidates`: Candidate generation fixtures

### Frontend Test Data
Located in `/root/airgen/frontend/src/__tests__/helpers/test-data.ts`:
- `testUsers`: User objects
- `testTokens`: JWT tokens
- `testLoginCredentials`: Login data
- `testTenantProjects`: Tenant/project selections
- `testRequirements`: Requirement objects

## Best Practices

### Writing Tests

1. **Always clean up after tests**:
   ```typescript
   afterEach(async () => {
     await app.close();
     resetAllMocks();
     localStorage.clear();
   });
   ```

2. **Use descriptive test names**:
   ```typescript
   it("should return 401 when user provides invalid credentials", async () => {
     // test implementation
   });
   ```

3. **Test both happy paths and error cases**:
   - Success scenarios
   - Validation errors
   - Not found errors
   - Authentication errors
   - Network errors

4. **Use test fixtures for consistency**:
   ```typescript
   import { testUsers } from "../helpers/test-data";
   ```

5. **Wait for async operations**:
   ```typescript
   await waitFor(() => {
     expect(screen.getByText("Success")).toBeInTheDocument();
   });
   ```

### Coverage Goals

Current test coverage focuses on:
- Critical authentication flows
- Core CRUD operations
- AI generation workflows
- User interactions
- State management

## Known Limitations

### Backend
1. Some tests require proper service mocking to pass (see test output)
2. Integration with Neo4j is mocked, not tested against real database
3. File system operations are mocked

### Frontend
1. Some complex components with external dependencies may need additional mocking
2. E2E flows are not yet implemented
3. Visual regression tests not included

## Next Steps for Additional Tests

### High Priority
1. **Document management tests**: Test document upload, parsing, and linking
2. **Architecture diagram tests**: Test diagram creation and manipulation
3. **Trace link tests**: Test traceability link creation and validation
4. **Integration tests**: Test full workflows end-to-end

### Medium Priority
1. **Graph service tests**: Direct tests for Neo4j operations
2. **Workspace service tests**: File system operations
3. **OpenAI integration tests**: Mocked AI responses
4. **Component tests**: Additional UI components (DocumentTree, RequirementContextMenu, etc.)

### Low Priority
1. **Performance tests**: Load testing for API endpoints
2. **Security tests**: Authentication bypass attempts, injection attacks
3. **Visual regression tests**: Screenshot comparison
4. **Accessibility tests**: ARIA compliance, keyboard navigation

## Troubleshooting

### Tests failing with "Cannot find module"
```bash
cd /root/airgen/backend && pnpm install
cd /root/airgen/frontend && pnpm install
```

### Tests timing out
Increase timeout in vitest.config.ts:
```typescript
test: {
  testTimeout: 20000  // Increase from 10000
}
```

### localStorage not working in tests
The setup file provides a mock implementation. Make sure tests import from setup:
```typescript
import "@testing-library/jest-dom";
```

### Mocks not resetting between tests
Always call `resetAllMocks()` in `afterEach`:
```typescript
afterEach(() => {
  resetAllMocks();
  vi.clearAllMocks();
});
```

## Contributing

When adding new features:
1. Write tests alongside implementation
2. Follow existing test patterns
3. Update this documentation
4. Ensure all tests pass before committing

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Fastify Testing](https://www.fastify.io/docs/latest/Guides/Testing/)
- [Testing Best Practices](https://testingjavascript.com/)
