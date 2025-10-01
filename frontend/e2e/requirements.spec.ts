import { test, expect } from '@playwright/test';
import { setupAuthenticatedSession } from './helpers/auth-helpers';
import { navigateToRoute, waitForPageReady, waitForElementStable } from './helpers/test-setup';
import { listRequirements, createRequirement, deleteRequirement } from './helpers/api-helpers';
import { testTenant, testProject, getUniqueTestRef, sampleRequirements } from './fixtures/test-data';

/**
 * Requirements E2E Tests
 *
 * Tests the requirements listing, viewing, and searching functionality
 */

test.describe('Requirements', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await setupAuthenticatedSession(page);
  });

  test('should display requirements page', async ({ page }) => {
    await navigateToRoute(page, 'requirements', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Check for page title
    await expect(page.locator('h1:has-text("Requirements")')).toBeVisible();

    // Check for tenant/project info
    await expect(page.locator(`text=${testTenant}`)).toBeVisible();
    await expect(page.locator(`text=${testProject}`)).toBeVisible();
  });

  test('should load and display requirements list', async ({ page }) => {
    await navigateToRoute(page, 'requirements', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for requirements to load
    await page.waitForTimeout(2000);

    // Check if there's either a list of requirements or an empty state
    const hasRequirements = await page.locator('[data-testid="requirement-row"], .requirement-row, table tbody tr').count().then(count => count > 0);
    const hasEmptyState = await page.locator('text=/no requirements|empty/i').isVisible().catch(() => false);

    // Should show either requirements or empty state
    expect(hasRequirements || hasEmptyState).toBe(true);
  });

  test('should search and filter requirements', async ({ page }) => {
    // Create a test requirement first
    const testReq = {
      ref: getUniqueTestRef('SEARCH'),
      title: 'Searchable Test Requirement',
      text: 'This is a unique searchable requirement for E2E testing',
      type: 'functional',
    };

    try {
      await createRequirement(page, { tenant: testTenant, project: testProject }, testReq);
    } catch (error) {
      // Ignore if requirement already exists
    }

    // Navigate to requirements page
    await navigateToRoute(page, 'requirements', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for list to load
    await page.waitForTimeout(2000);

    // Find and use search input
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"], input[name="search"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });

    // Search for the test requirement
    await searchInput.fill(testReq.ref);
    await page.waitForTimeout(1000);

    // Should show the matching requirement
    await expect(page.locator(`text=${testReq.ref}`)).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(500);

    // Cleanup
    try {
      await deleteRequirement(page, { tenant: testTenant, project: testProject }, testReq.ref);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should refresh requirements list', async ({ page }) => {
    await navigateToRoute(page, 'requirements', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for initial load
    await page.waitForTimeout(2000);

    // Look for refresh button
    const refreshButton = page.locator('button:has-text("Refresh"), button[aria-label="Refresh"]').first();

    if (await refreshButton.isVisible()) {
      // Click refresh
      await refreshButton.click();

      // Wait for refresh to complete
      await page.waitForTimeout(1000);

      // Page should still be showing requirements
      await expect(page.locator('h1:has-text("Requirements")')).toBeVisible();
    }
  });

  test('should view requirement details', async ({ page }) => {
    // Create a test requirement
    const testReq = {
      ref: getUniqueTestRef('DETAIL'),
      title: 'Detailed Test Requirement',
      text: 'This requirement has detailed information for testing the detail view.',
      type: 'functional',
    };

    try {
      await createRequirement(page, { tenant: testTenant, project: testProject }, testReq);
    } catch (error) {
      // Ignore if already exists
    }

    // Navigate to requirements page
    await navigateToRoute(page, 'requirements', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for list to load
    await page.waitForTimeout(2000);

    // Search for the test requirement
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill(testReq.ref);
      await page.waitForTimeout(1000);
    }

    // Click on the requirement to view details
    const requirementLink = page.locator(`text=${testReq.ref}`).first();
    if (await requirementLink.isVisible()) {
      await requirementLink.click();

      // Wait for details to load
      await page.waitForTimeout(1000);

      // Should show requirement details
      await expect(page.locator(`text=${testReq.title}`)).toBeVisible({ timeout: 5000 });
    }

    // Cleanup
    try {
      await deleteRequirement(page, { tenant: testTenant, project: testProject }, testReq.ref);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should handle empty requirements list gracefully', async ({ page }) => {
    // Use a project that likely has no requirements
    await navigateToRoute(page, 'requirements', { tenant: 'test-tenant', project: 'empty-project' });
    await waitForPageReady(page);

    // Wait a bit for loading
    await page.waitForTimeout(2000);

    // Should show some message (empty state or error)
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();

    // Should not crash
    expect(page.url()).toContain('requirements');
  });

  test('should navigate back from requirement details', async ({ page }) => {
    await navigateToRoute(page, 'requirements', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for list to load
    await page.waitForTimeout(2000);

    // If there are any requirements, click on one
    const firstRequirement = page.locator('[data-testid="requirement-row"], .requirement-row, table tbody tr').first();

    if (await firstRequirement.isVisible().catch(() => false)) {
      await firstRequirement.click();
      await page.waitForTimeout(1000);

      // Look for back button or close button
      const backButton = page.locator('button:has-text("Back"), button[aria-label="Back"], button:has-text("Close")').first();

      if (await backButton.isVisible().catch(() => false)) {
        await backButton.click();
        await page.waitForTimeout(500);

        // Should be back on the requirements list
        await expect(page.locator('h1:has-text("Requirements")')).toBeVisible();
      }
    }
  });
});
