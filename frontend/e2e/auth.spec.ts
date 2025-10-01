import { test, expect } from '@playwright/test';
import { login, logout, isLoggedIn, getDefaultCredentials } from './helpers/auth-helpers';
import { clearBrowserState, waitForPageReady } from './helpers/test-setup';

/**
 * Authentication E2E Tests
 *
 * Tests the login and logout functionality
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear browser state before each test
    await clearBrowserState(page);
  });

  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    // Check for login form elements
    await expect(page.locator('input[name="username"], input[type="text"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    const credentials = getDefaultCredentials();

    // Navigate to login page
    await page.goto('/login');
    await waitForPageReady(page);

    // Fill in credentials
    await page.fill('input[name="username"], input[type="text"]', credentials.username);
    await page.fill('input[name="password"], input[type="password"]', credentials.password);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation away from login
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 10000,
    });

    // Verify we're logged in
    const loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);

    // Take screenshot for verification
    await page.screenshot({ path: 'playwright-report/screenshots/logged-in.png' });
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    // Fill in invalid credentials
    await page.fill('input[name="username"], input[type="text"]', 'invalid-user');
    await page.fill('input[name="password"], input[type="password"]', 'wrong-password');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait a bit for error to appear
    await page.waitForTimeout(2000);

    // Should still be on login page or show error
    const currentUrl = page.url();
    const hasError = await page.locator('[role="alert"], .error, [data-testid="error-message"]').isVisible().catch(() => false);

    // Either we're still on login page or there's an error message
    expect(currentUrl.includes('/login') || hasError).toBe(true);
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await login(page);

    // Verify logged in
    const loggedInBefore = await isLoggedIn(page);
    expect(loggedInBefore).toBe(true);

    // Logout
    await logout(page);

    // Wait for redirect to login
    await page.waitForURL((url) => url.pathname.includes('/login'), {
      timeout: 5000,
    });

    // Verify we're logged out
    expect(page.url()).toContain('/login');
  });

  test('should redirect to login when accessing protected routes without auth', async ({ page }) => {
    // Try to access a protected route
    await page.goto('/requirements');

    // Should be redirected to login or show login prompt
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const hasLoginForm = await page.locator('input[name="username"], input[type="text"]').isVisible().catch(() => false);

    // Either URL contains login or login form is visible
    expect(currentUrl.includes('/login') || hasLoginForm).toBe(true);
  });

  test('should persist session after page reload', async ({ page }) => {
    // Login
    await login(page);

    // Verify logged in
    let loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);

    // Reload the page
    await page.reload();
    await waitForPageReady(page);

    // Should still be logged in
    loggedIn = await isLoggedIn(page);
    expect(loggedIn).toBe(true);
  });
});
