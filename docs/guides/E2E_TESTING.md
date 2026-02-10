# E2E Testing Guide for AIRGen

This guide covers end-to-end (E2E) testing for the AIRGen application using Playwright.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Writing New Tests](#writing-new-tests)
- [Test Structure](#test-structure)
- [Debugging Tests](#debugging-tests)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The E2E test suite uses [Playwright](https://playwright.dev/) to test critical user flows across multiple browsers (Chromium, Firefox, and WebKit). The tests validate the complete application stack from frontend to backend.

### Test Coverage

Current E2E tests cover:

- **Authentication** (`auth.spec.ts`)
  - Login/logout flows
  - Invalid credentials handling
  - Session persistence
  - Protected route access

- **Requirements** (`requirements.spec.ts`)
  - Requirements listing and viewing
  - Search and filtering
  - Requirement details view
  - Navigation flows

- **AIRGen** (`airgen.spec.ts`)
  - Requirement generation
  - Candidate management (accept/reject)
  - Mode switching (requirements/diagrams)
  - Optional fields (glossary, constraints)

## Setup

### Prerequisites

- Node.js 18+ and pnpm installed
- Backend server running on `http://localhost:8787` (or configured API_PROXY_TARGET)
- Test database with sample data

### Installation

1. Install Playwright dependencies:

```bash
cd frontend
pnpm install
```

2. Install Playwright browsers:

```bash
npx playwright install
```

3. (Optional) Set environment variables:

Create a `.env.test` file in the frontend directory:

```env
# Base URL for the application
BASE_URL=http://localhost:5173

# API proxy target
API_PROXY_TARGET=http://localhost:8787

# Test credentials
TEST_USERNAME=admin
TEST_PASSWORD=admin123

# Test tenant/project
TEST_TENANT=hollando
TEST_PROJECT=main-battle-tank
```

## Running Tests

### Run All Tests (Headless)

```bash
cd frontend
pnpm e2e
```

### Run Tests with UI Mode

UI mode provides an interactive debugging experience:

```bash
pnpm e2e:ui
```

### Run Tests in Debug Mode

Debug mode allows you to step through tests:

```bash
pnpm e2e:debug
```

### Run Specific Test File

```bash
npx playwright test e2e/auth.spec.ts
```

### Run Tests in Specific Browser

```bash
# Chromium only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# WebKit only
npx playwright test --project=webkit
```

### Run Single Test

```bash
npx playwright test -g "should login with valid credentials"
```

### View Test Report

After running tests, view the HTML report:

```bash
pnpm e2e:report
```

## Writing New Tests

### Test File Structure

Create test files in the `frontend/e2e/` directory:

```typescript
import { test, expect } from '@playwright/test';
import { setupAuthenticatedSession } from './helpers/auth-helpers';
import { navigateToRoute, waitForPageReady } from './helpers/test-setup';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup authenticated session if needed
    await setupAuthenticatedSession(page);
  });

  test('should perform some action', async ({ page }) => {
    // Navigate to route
    await navigateToRoute(page, 'route-name', {
      tenant: 'hollando',
      project: 'main-battle-tank'
    });

    // Wait for page to be ready
    await waitForPageReady(page);

    // Your test assertions
    await expect(page.locator('h1')).toBeVisible();
  });
});
```

### Using Helpers

The test suite includes several helper modules:

#### Test Setup Helpers (`helpers/test-setup.ts`)

```typescript
import {
  navigateToRoute,
  waitForPageReady,
  waitForElementStable,
  fillFormField,
  clearBrowserState,
  takeScreenshot,
} from './helpers/test-setup';

// Navigate with context
await navigateToRoute(page, 'requirements', { tenant, project });

// Wait for page to be fully loaded
await waitForPageReady(page);

// Fill form fields safely
await fillFormField(page, 'input[name="title"]', 'Test Title');

// Take screenshot
await takeScreenshot(page, 'test-screenshot');
```

#### Authentication Helpers (`helpers/auth-helpers.ts`)

```typescript
import {
  login,
  logout,
  isLoggedIn,
  setupAuthenticatedSession,
} from './helpers/auth-helpers';

// Quick setup for authenticated tests
await setupAuthenticatedSession(page);

// Manual login
await login(page, { username: 'admin', password: 'admin123' });

// Check login status
const authenticated = await isLoggedIn(page);

// Logout
await logout(page);
```

#### API Helpers (`helpers/api-helpers.ts`)

```typescript
import {
  listRequirements,
  createRequirement,
  deleteRequirement,
  generateCandidates,
} from './helpers/api-helpers';

const options = { tenant: 'hollando', project: 'main-battle-tank' };

// Create test data
await createRequirement(page, options, {
  ref: 'TEST-001',
  title: 'Test Requirement',
  text: 'Test description',
  type: 'functional',
});

// Cleanup test data
await deleteRequirement(page, options, 'TEST-001');
```

#### Test Data Fixtures (`fixtures/test-data.ts`)

```typescript
import {
  testTenant,
  testProject,
  sampleRequirements,
  getUniqueTestRef,
  timeouts,
} from './fixtures/test-data';

// Use predefined test data
const requirement = sampleRequirements[0];

// Generate unique test reference
const ref = getUniqueTestRef('TEST');

// Use predefined timeouts
await page.waitForTimeout(timeouts.medium);
```

### Best Practices for Writing Tests

1. **Use Page Object Pattern** for complex pages:

```typescript
class RequirementsPage {
  constructor(private page: Page) {}

  async navigate(tenant: string, project: string) {
    await navigateToRoute(this.page, 'requirements', { tenant, project });
  }

  async search(query: string) {
    await this.page.fill('input[type="search"]', query);
  }

  async getRequirementCount() {
    return await this.page.locator('.requirement-row').count();
  }
}
```

2. **Use test.describe.serial** for dependent tests:

```typescript
test.describe.serial('Dependent tests', () => {
  test('step 1', async ({ page }) => { /* ... */ });
  test('step 2', async ({ page }) => { /* ... */ });
});
```

3. **Use test.beforeEach** for common setup:

```typescript
test.beforeEach(async ({ page }) => {
  await setupAuthenticatedSession(page);
  await navigateToRoute(page, 'requirements');
});
```

4. **Use test.afterEach** for cleanup:

```typescript
test.afterEach(async ({ page }) => {
  await deleteRequirement(page, options, testRef);
});
```

5. **Use data-testid attributes** for reliable selectors:

```typescript
// In React component
<button data-testid="submit-button">Submit</button>

// In test
await page.click('[data-testid="submit-button"]');
```

## Test Structure

### Directory Layout

```
frontend/
├── e2e/
│   ├── helpers/
│   │   ├── test-setup.ts       # Common setup utilities
│   │   ├── auth-helpers.ts     # Authentication helpers
│   │   └── api-helpers.ts      # API interaction helpers
│   ├── fixtures/
│   │   └── test-data.ts        # Test data and fixtures
│   ├── auth.spec.ts            # Authentication tests
│   ├── requirements.spec.ts    # Requirements tests
│   └── airgen.spec.ts          # AIRGen tests
├── playwright.config.ts         # Playwright configuration
└── package.json
```

### Configuration

The `playwright.config.ts` file contains:

- **Test directory**: `./e2e`
- **Base URL**: `http://localhost:5173` (configurable via `BASE_URL` env var)
- **Browsers**: Chromium, Firefox, WebKit
- **Retries**: 1 locally, 2 on CI
- **Screenshots**: On failure
- **Videos**: On first retry
- **Web server**: Auto-starts Vite dev server

## Debugging Tests

### Visual Debugging with UI Mode

The best way to debug tests is using UI mode:

```bash
pnpm e2e:ui
```

Features:
- Watch tests run in real-time
- Inspect DOM and network requests
- Time-travel through test steps
- Edit and re-run tests

### Debug Mode

Run tests with the inspector:

```bash
pnpm e2e:debug
```

Or debug a specific test:

```bash
npx playwright test --debug -g "test name"
```

### Console Logging

Add console.log statements in tests:

```typescript
test('my test', async ({ page }) => {
  console.log('Current URL:', page.url());
  const text = await page.textContent('h1');
  console.log('Title:', text);
});
```

### Screenshots and Videos

Screenshots and videos are automatically captured on failure. To force a screenshot:

```typescript
await page.screenshot({ path: 'debug-screenshot.png' });
```

### Trace Viewer

Traces are captured on first retry. View them:

```bash
npx playwright show-trace trace.zip
```

### VS Code Extension

Install the [Playwright VS Code extension](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright) for:
- Run tests from editor
- Set breakpoints
- View test results inline

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/e2e.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: npx playwright install --with-deps
        working-directory: frontend

      - name: Start backend
        run: |
          cd backend
          pnpm install
          pnpm build
          pnpm start &

      - name: Run E2E tests
        run: pnpm e2e
        working-directory: frontend
        env:
          CI: true

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: frontend/playwright-report/
          retention-days: 30
```

### GitLab CI

Create `.gitlab-ci.yml`:

```yaml
e2e-tests:
  image: mcr.microsoft.com/playwright:v1.49.0-jammy
  stage: test
  script:
    - npm install -g pnpm
    - pnpm install
    - cd frontend
    - pnpm e2e
  artifacts:
    when: always
    paths:
      - frontend/playwright-report/
    expire_in: 1 week
```

### Jenkins

```groovy
pipeline {
    agent any

    stages {
        stage('Install') {
            steps {
                sh 'pnpm install'
                sh 'npx playwright install --with-deps'
            }
        }

        stage('E2E Tests') {
            steps {
                sh 'cd frontend && pnpm e2e'
            }
        }
    }

    post {
        always {
            publishHTML([
                reportDir: 'frontend/playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Report'
            ])
        }
    }
}
```

## Best Practices

### 1. Test Independence

Each test should be independent and not rely on other tests:

```typescript
// ❌ Bad - depends on previous test
test('create requirement', async ({ page }) => { /* ... */ });
test('edit requirement', async ({ page }) => { /* ... */ }); // Assumes created

// ✅ Good - each test is independent
test('edit requirement', async ({ page }) => {
  // Create requirement first
  await createRequirement(page, options, testData);
  // Then edit it
  // ...
  // Cleanup
  await deleteRequirement(page, options, testData.ref);
});
```

### 2. Use Meaningful Assertions

```typescript
// ❌ Bad
await expect(page.locator('div')).toBeVisible();

// ✅ Good
await expect(page.locator('[data-testid="requirement-title"]'))
  .toHaveText('Expected Title');
```

### 3. Wait for Conditions, Not Timeouts

```typescript
// ❌ Bad
await page.waitForTimeout(5000);

// ✅ Good
await page.waitForSelector('[data-testid="requirement-list"]');
await page.waitForLoadState('networkidle');
```

### 4. Handle Flaky Tests

```typescript
// Use retry logic
test('flaky test', async ({ page }) => {
  await expect(async () => {
    await page.click('button');
    await expect(page.locator('.result')).toBeVisible();
  }).toPass({
    timeout: 10000,
    intervals: [1000, 2000],
  });
});
```

### 5. Clean Up Test Data

```typescript
test('with cleanup', async ({ page }) => {
  const testRef = getUniqueTestRef();

  try {
    await createRequirement(page, options, { ref: testRef, /* ... */ });
    // Test logic
  } finally {
    await deleteRequirement(page, options, testRef);
  }
});
```

### 6. Use Test Fixtures

```typescript
import { test as base } from '@playwright/test';

const test = base.extend({
  authenticatedPage: async ({ page }, use) => {
    await setupAuthenticatedSession(page);
    await use(page);
  },
});

test('use fixture', async ({ authenticatedPage }) => {
  // Already authenticated
});
```

## Troubleshooting

### Tests Fail Locally But Pass in CI

- Check Node.js and browser versions
- Clear `node_modules` and reinstall: `pnpm install`
- Update Playwright browsers: `npx playwright install`

### Timeout Errors

Increase timeout in `playwright.config.ts`:

```typescript
use: {
  actionTimeout: 10000,
  navigationTimeout: 30000,
}
```

Or per test:

```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000);
  // ...
});
```

### Element Not Found

Use better selectors:

```typescript
// ❌ Fragile
await page.click('button');

// ✅ Robust
await page.click('[data-testid="submit-button"]');
await page.click('button:has-text("Submit")');
```

### Tests Pass Individually But Fail Together

Tests may not be cleaning up properly. Add afterEach hooks:

```typescript
test.afterEach(async ({ page }) => {
  await clearTestData(page, options);
});
```

### Backend Not Running

Ensure backend is running before tests:

```bash
# Terminal 1
cd backend
pnpm dev

# Terminal 2
cd frontend
pnpm e2e
```

Or configure `webServer` in `playwright.config.ts` to start both frontend and backend.

### Screenshots Not Captured

Ensure `playwright-report/screenshots` directory exists:

```bash
mkdir -p frontend/playwright-report/screenshots
```

## Next Steps for Expanding Coverage

### Additional Test Scenarios

1. **Navigation Tests**
   - Test all routes and navigation flows
   - Breadcrumb navigation
   - Browser back/forward buttons

2. **Forms and Validation**
   - Test form validation errors
   - Required field handling
   - File uploads

3. **Error Handling**
   - Network errors
   - API errors
   - Offline scenarios

4. **Performance Tests**
   - Page load times
   - Large data sets
   - Concurrent users

5. **Accessibility Tests**
   - Keyboard navigation
   - Screen reader compatibility
   - ARIA attributes

6. **Mobile/Responsive Tests**
   - Test on mobile viewports
   - Touch interactions
   - Responsive layouts

7. **Integration Tests**
   - Multi-user scenarios
   - Real-time updates
   - WebSocket connections

### Example: Adding Accessibility Tests

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('should not have accessibility violations', async ({ page }) => {
  await page.goto('/requirements');

  const accessibilityScanResults = await new AxeBuilder({ page })
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
```

### Example: Adding Performance Tests

```typescript
test('page should load quickly', async ({ page }) => {
  const startTime = Date.now();
  await page.goto('/requirements');
  const loadTime = Date.now() - startTime;

  expect(loadTime).toBeLessThan(3000); // 3 seconds
});
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)
- [Playwright Community](https://playwright.dev/community/welcome)

## Support

For questions or issues with E2E tests:
1. Check this documentation
2. Review existing test examples in `frontend/e2e/`
3. Consult Playwright documentation
4. Open an issue in the project repository
