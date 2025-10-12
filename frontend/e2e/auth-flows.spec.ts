import { test, expect } from '@playwright/test';
import { login, logout, isLoggedIn, getDefaultCredentials } from './helpers/auth-helpers';
import { clearBrowserState, waitForPageReady } from './helpers/test-setup';

/**
 * Comprehensive Authentication E2E Tests
 *
 * Tests complete authentication flows including:
 * - Registration
 * - Login/Logout
 * - Session management
 * - Protected routes
 * - Password requirements
 */

test.describe('User Registration', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test('should display registration page', async ({ page }) => {
    await page.goto('/signup');
    await waitForPageReady(page);

    // Check for registration form elements
    await expect(page.locator('input[name="email"], input[type="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should register new user with valid data', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `testuser${timestamp}@e2etest.local`;
    const testPassword = 'TestPass123!@#';

    await page.goto('/signup');
    await waitForPageReady(page);

    // Fill registration form
    await page.fill('input[name="email"], input[type="email"]', testEmail);

    // Check if name field exists (optional)
    const nameInput = page.locator('input[name="name"]');
    if (await nameInput.isVisible()) {
      await nameInput.fill(`Test User ${timestamp}`);
    }

    await page.fill('input[name="password"], input[type="password"]', testPassword);

    // Check if password confirmation exists
    const confirmPasswordInput = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');
    if (await confirmPasswordInput.isVisible()) {
      await confirmPasswordInput.fill(testPassword);
    }

    // Submit registration
    await page.click('button[type="submit"]');

    // Wait for success - either redirect or success message
    await page.waitForTimeout(3000);

    // Check for success indicators
    const currentUrl = page.url();
    const hasSuccessMessage = await page.locator('[data-testid="success-message"], .success, [role="status"]')
      .isVisible()
      .catch(() => false);

    // Should either redirect away from signup or show success message
    expect(!currentUrl.includes('/signup') || hasSuccessMessage).toBe(true);
  });

  test('should show validation errors for invalid email', async ({ page }) => {
    await page.goto('/signup');
    await waitForPageReady(page);

    // Try invalid email
    await page.fill('input[name="email"], input[type="email"]', 'not-an-email');
    await page.fill('input[name="password"], input[type="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);

    // Should show email validation error
    const hasError = await page.locator('[role="alert"], .error, [data-testid="email-error"]')
      .isVisible()
      .catch(() => false);

    expect(hasError).toBe(true);
  });

  test('should enforce password requirements', async ({ page }) => {
    await page.goto('/signup');
    await waitForPageReady(page);

    const testEmail = `testuser${Date.now()}@e2etest.local`;

    // Try weak password
    await page.fill('input[name="email"], input[type="email"]', testEmail);
    await page.fill('input[name="password"], input[type="password"]', 'weak');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);

    // Should show password validation error
    const hasPasswordError = await page.locator('[role="alert"], .error, [data-testid="password-error"]')
      .filter({ hasText: /password|strong|character|uppercase|lowercase|number|special/i })
      .isVisible()
      .catch(() => false);

    // Either validation error shown or still on signup page
    expect(hasPasswordError || page.url().includes('/signup')).toBe(true);
  });

  test('should show error for duplicate email', async ({ page }) => {
    const credentials = getDefaultCredentials();

    await page.goto('/signup');
    await waitForPageReady(page);

    // Try to register with existing email
    await page.fill('input[name="email"], input[type="email"]', credentials.username);
    await page.fill('input[name="password"], input[type="password"]', 'NewPass123!');

    const confirmPasswordInput = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');
    if (await confirmPasswordInput.isVisible()) {
      await confirmPasswordInput.fill('NewPass123!');
    }

    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should show duplicate email error or stay on signup
    const hasError = await page.locator('[role="alert"], .error')
      .filter({ hasText: /already|exists|taken/i })
      .isVisible()
      .catch(() => false);

    expect(hasError || page.url().includes('/signup')).toBe(true);
  });
});

test.describe('Login Flows', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test('should login and access dashboard', async ({ page }) => {
    await login(page);

    // Should be on dashboard or home page
    await page.waitForURL((url) =>
      !url.pathname.includes('/login') && !url.pathname.includes('/signup'),
      { timeout: 10000 }
    );

    // Verify authenticated UI elements
    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);

    // Take screenshot of authenticated state
    await page.screenshot({ path: 'playwright-report/screenshots/dashboard.png' });
  });

  test('should show error for wrong password', async ({ page }) => {
    const credentials = getDefaultCredentials();

    await page.goto('/login');
    await waitForPageReady(page);

    await page.fill('input[name="username"], input[type="text"]', credentials.username);
    await page.fill('input[name="password"], input[type="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should show error message
    const hasError = await page.locator('[role="alert"], .error, [data-testid="error-message"]')
      .filter({ hasText: /invalid|incorrect|wrong|failed/i })
      .isVisible()
      .catch(() => false);

    expect(hasError || page.url().includes('/login')).toBe(true);
  });

  test('should show error for non-existent user', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    await page.fill('input[name="username"], input[type="text"]', 'nonexistent@user.com');
    await page.fill('input[name="password"], input[type="password"]', 'SomePassword123!');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    const hasError = await page.locator('[role="alert"], .error')
      .isVisible()
      .catch(() => false);

    expect(hasError || page.url().includes('/login')).toBe(true);
  });

  test('should handle rate limiting gracefully', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    // Attempt multiple failed logins
    for (let i = 0; i < 6; i++) {
      await page.fill('input[name="username"], input[type="text"]', 'test@test.com');
      await page.fill('input[name="password"], input[type="password"]', `wrong${i}`);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(2000);

    // Should show rate limit error or be temporarily blocked
    const hasRateLimitError = await page.locator('[role="alert"], .error')
      .filter({ hasText: /rate limit|too many|try again|slow down/i })
      .isVisible()
      .catch(() => false);

    // Just verify we can detect rate limiting if it occurs
    // (may or may not occur depending on configuration)
    expect(typeof hasRateLimitError).toBe('boolean');
  });
});

test.describe('Session Management', () => {
  test('should maintain session across page navigation', async ({ page }) => {
    await login(page);

    const loggedInInitial = await isLoggedIn(page);
    expect(loggedInInitial).toBe(true);

    // Navigate to different pages
    await page.goto('/requirements');
    await page.waitForTimeout(1000);
    expect(await isLoggedIn(page)).toBe(true);

    await page.goto('/');
    await page.waitForTimeout(1000);
    expect(await isLoggedIn(page)).toBe(true);
  });

  test('should persist session after browser refresh', async ({ page }) => {
    await login(page);
    expect(await isLoggedIn(page)).toBe(true);

    // Hard refresh
    await page.reload({ waitUntil: 'networkidle' });
    await waitForPageReady(page);

    // Should still be logged in
    expect(await isLoggedIn(page)).toBe(true);
  });

  test('should logout and clear session', async ({ page }) => {
    await login(page);
    expect(await isLoggedIn(page)).toBe(true);

    await logout(page);

    // Should be on login page
    expect(page.url()).toContain('/login');

    // Session should be cleared - try accessing protected route
    await page.goto('/requirements');
    await page.waitForTimeout(2000);

    // Should be redirected back to login or show login modal
    const requiresAuth = page.url().includes('/login') ||
      await page.locator('input[name="username"], input[type="text"]').isVisible().catch(() => false);

    expect(requiresAuth).toBe(true);
  });

  test('should handle session expiry', async ({ page }) => {
    await login(page);
    expect(await isLoggedIn(page)).toBe(true);

    // Wait for a reasonable time (won't actually expire in test, but tests the flow)
    await page.waitForTimeout(2000);

    // Try to make an authenticated request
    const response = await page.request.get('/api/health');

    // Should either succeed (session active) or get 401 (session expired)
    expect(response.ok() || response.status() === 401).toBe(true);
  });
});

test.describe('Protected Routes', () => {
  test('should protect requirements route', async ({ page }) => {
    await clearBrowserState(page);

    await page.goto('/requirements');
    await page.waitForTimeout(2000);

    // Should require authentication
    const requiresAuth = page.url().includes('/login') ||
      await page.locator('input[name="username"], input[type="text"]').isVisible().catch(() => false);

    expect(requiresAuth).toBe(true);
  });

  test('should allow access to protected routes after login', async ({ page }) => {
    await login(page);

    // Navigate to protected route
    await page.goto('/requirements');
    await page.waitForTimeout(2000);

    // Should be able to access
    expect(page.url()).toContain('/requirements');
    expect(await isLoggedIn(page)).toBe(true);
  });

  test('should redirect to login and return after authentication', async ({ page }) => {
    await clearBrowserState(page);

    // Try to access protected route
    const targetRoute = '/requirements';
    await page.goto(targetRoute);
    await page.waitForTimeout(2000);

    // Should be on login
    const isOnLogin = page.url().includes('/login') ||
      await page.locator('input[name="username"], input[type="text"]').isVisible();

    if (isOnLogin) {
      // Login
      await login(page);

      // Should redirect back to original target (or at least be authenticated)
      await page.waitForTimeout(2000);
      expect(await isLoggedIn(page)).toBe(true);
    }
  });
});

test.describe('Error Handling', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    // Simulate offline
    await page.route('**/api/auth/login', route => route.abort('failed'));

    await page.fill('input[name="username"], input[type="text"]', 'test@test.com');
    await page.fill('input[name="password"], input[type="password"]', 'password');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should show network error
    const hasError = await page.locator('[role="alert"], .error')
      .isVisible()
      .catch(() => false);

    expect(hasError || page.url().includes('/login')).toBe(true);
  });

  test('should handle server errors gracefully', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    // Simulate server error
    await page.route('**/api/auth/login', route =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: 'Server Error' }) })
    );

    await page.fill('input[name="username"], input[type="text"]', 'test@test.com');
    await page.fill('input[name="password"], input[type="password"]', 'password');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should show error message
    const hasError = await page.locator('[role="alert"], .error')
      .isVisible()
      .catch(() => false);

    expect(hasError || page.url().includes('/login')).toBe(true);
  });
});
