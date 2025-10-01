# E2E Tests

This directory contains end-to-end tests for the AIRGen application using Playwright.

## Quick Start

```bash
# Install dependencies (if not already done)
pnpm install

# Install Playwright browsers
npx playwright install

# Run all tests
pnpm e2e

# Run tests with UI
pnpm e2e:ui

# Run tests in debug mode
pnpm e2e:debug
```

## Directory Structure

```
e2e/
├── helpers/           # Helper functions for tests
│   ├── test-setup.ts    # Common setup utilities
│   ├── auth-helpers.ts  # Authentication helpers
│   └── api-helpers.ts   # API interaction helpers
├── fixtures/          # Test data and fixtures
│   └── test-data.ts
├── auth.spec.ts       # Authentication tests
├── requirements.spec.ts # Requirements tests
├── airgen.spec.ts     # AIRGen tests
├── example.spec.ts    # Example test
└── README.md          # This file
```

## Test Files

### auth.spec.ts
Tests authentication flows:
- Login with valid/invalid credentials
- Logout
- Session persistence
- Protected route access

### requirements.spec.ts
Tests requirements management:
- List requirements
- View requirement details
- Search and filter
- Navigation

### airgen.spec.ts
Tests AIRGen functionality:
- Generate requirement candidates
- Accept/reject candidates
- Mode switching (requirements/diagrams)
- Use optional fields (glossary, constraints)

### example.spec.ts
Simple example tests to verify Playwright setup.

## Writing New Tests

1. Create a new `.spec.ts` file in this directory
2. Import necessary helpers from `helpers/`
3. Use test data from `fixtures/test-data.ts`
4. Follow the patterns in existing test files

Example:

```typescript
import { test, expect } from '@playwright/test';
import { setupAuthenticatedSession } from './helpers/auth-helpers';
import { navigateToRoute, waitForPageReady } from './helpers/test-setup';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedSession(page);
  });

  test('should do something', async ({ page }) => {
    await navigateToRoute(page, 'my-route');
    await waitForPageReady(page);

    await expect(page.locator('h1')).toBeVisible();
  });
});
```

## Helper Modules

### test-setup.ts
Common utilities:
- `navigateToRoute()` - Navigate with tenant/project context
- `waitForPageReady()` - Wait for page to be fully loaded
- `fillFormField()` - Fill form fields safely
- `takeScreenshot()` - Take screenshots
- `clearBrowserState()` - Clear localStorage and cookies

### auth-helpers.ts
Authentication utilities:
- `login()` - Login via UI
- `logout()` - Logout
- `isLoggedIn()` - Check authentication status
- `setupAuthenticatedSession()` - Quick setup for authenticated tests

### api-helpers.ts
API interaction utilities:
- `listRequirements()` - Fetch requirements via API
- `createRequirement()` - Create test data
- `deleteRequirement()` - Cleanup test data
- `generateCandidates()` - Generate AIRGen candidates

### test-data.ts
Test fixtures:
- `testTenant` - Default test tenant
- `testProject` - Default test project
- `sampleRequirements` - Sample requirement data
- `sampleInstructions` - Sample AIRGen instructions
- `getUniqueTestRef()` - Generate unique test IDs

## Documentation

For complete documentation, see [E2E_TESTING.md](../../E2E_TESTING.md) in the project root.

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
