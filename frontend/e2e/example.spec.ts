import { test, expect } from '@playwright/test';

/**
 * Example E2E Test
 *
 * This is a simple example test to verify Playwright is working correctly.
 * You can use this as a template for writing new tests.
 */

test.describe('Example Tests', () => {
  test('should load the homepage', async ({ page }) => {
    // Navigate to the base URL
    await page.goto('/');

    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');

    // Check that we got a response (page title or body exists)
    const hasContent = await page.locator('body').isVisible();
    expect(hasContent).toBe(true);

    // Take a screenshot
    await page.screenshot({ path: 'playwright-report/screenshots/homepage.png' });
  });

  test('should have a valid HTML document', async ({ page }) => {
    await page.goto('/');

    // Check for basic HTML structure
    const html = await page.locator('html').isVisible();
    expect(html).toBe(true);

    // Check for a body element
    const body = await page.locator('body').isVisible();
    expect(body).toBe(true);
  });

  test('should respond to navigation', async ({ page }) => {
    await page.goto('/');

    // Get current URL
    const currentUrl = page.url();
    expect(currentUrl).toBeTruthy();

    // URL should contain the base URL
    expect(currentUrl).toContain('localhost');
  });
});
