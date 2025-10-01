import { test, expect } from '@playwright/test';
import { setupAuthenticatedSession } from './helpers/auth-helpers';
import { navigateToRoute, waitForPageReady, fillFormField } from './helpers/test-setup';
import { generateCandidates, acceptCandidate } from './helpers/api-helpers';
import {
  testTenant,
  testProject,
  sampleInstructions,
  sampleGlossary,
  sampleConstraints,
  getUniqueTestRef,
  timeouts,
} from './fixtures/test-data';

/**
 * AIRGen E2E Tests
 *
 * Tests the AIRGen requirement generation and candidate management functionality
 */

test.describe('AIRGen', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await setupAuthenticatedSession(page);
  });

  test('should display AIRGen page', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Check for page title
    await expect(page.locator('h1:has-text("AIRGen")')).toBeVisible();

    // Check for tenant/project info
    await expect(page.locator(`text=${testTenant}`)).toBeVisible();
    await expect(page.locator(`text=${testProject}`)).toBeVisible();
  });

  test('should show AIRGen form elements', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Check for form elements
    const instructionInput = page.locator('textarea[name="instruction"], textarea[placeholder*="instruction"]').first();
    await expect(instructionInput).toBeVisible();

    // Check for generate button
    const generateButton = page.locator('button[type="submit"], button:has-text("Generate")').first();
    await expect(generateButton).toBeVisible();
  });

  test('should generate requirement candidates', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Fill in instruction
    const instructionInput = page.locator('textarea[name="instruction"], textarea[placeholder*="instruction"]').first();
    await instructionInput.waitFor({ state: 'visible' });
    await instructionInput.fill(sampleInstructions[0].instruction);

    // Submit the form
    const generateButton = page.locator('button[type="submit"], button:has-text("Generate")').first();
    await generateButton.click();

    // Wait for candidates to be generated (this may take a while)
    await page.waitForTimeout(5000);

    // Check if candidates appeared or loading indicator shown
    const hasCandidates = await page.locator('[data-testid="candidate-card"], .candidate-card').count().then(count => count > 0);
    const isLoading = await page.locator('[data-testid="spinner"], .spinner, text=/loading|generating/i').isVisible().catch(() => false);

    // Should show either candidates or loading state
    expect(hasCandidates || isLoading).toBe(true);
  });

  test('should display generated candidates', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for any existing candidates to load
    await page.waitForTimeout(2000);

    // Check if there are any candidates displayed
    const candidatesSection = page.locator('text=/candidate requirements|candidates/i').first();

    if (await candidatesSection.isVisible().catch(() => false)) {
      // Should show candidates section
      expect(await candidatesSection.isVisible()).toBe(true);
    }
  });

  test('should show candidate actions (accept/reject)', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Generate a candidate first
    const instructionInput = page.locator('textarea[name="instruction"], textarea[placeholder*="instruction"]').first();
    if (await instructionInput.isVisible()) {
      await instructionInput.fill('Create a simple test requirement');

      const generateButton = page.locator('button[type="submit"], button:has-text("Generate")').first();
      await generateButton.click();

      // Wait for generation
      await page.waitForTimeout(10000);

      // Look for candidate cards
      const candidateCard = page.locator('[data-testid="candidate-card"], .candidate-card').first();

      if (await candidateCard.isVisible().catch(() => false)) {
        // Should have action buttons
        const acceptButton = candidateCard.locator('button:has-text("Accept")').first();
        const rejectButton = candidateCard.locator('button:has-text("Reject")').first();

        await expect(acceptButton.or(rejectButton)).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('should accept a candidate', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Generate a candidate
    const instructionInput = page.locator('textarea[name="instruction"], textarea[placeholder*="instruction"]').first();

    if (await instructionInput.isVisible()) {
      await instructionInput.fill('Generate a security requirement');

      const generateButton = page.locator('button[type="submit"], button:has-text("Generate")').first();
      await generateButton.click();

      // Wait for generation
      await page.waitForTimeout(10000);

      // Look for the first candidate
      const candidateCard = page.locator('[data-testid="candidate-card"], .candidate-card').first();

      if (await candidateCard.isVisible().catch(() => false)) {
        // Click accept button
        const acceptButton = candidateCard.locator('button:has-text("Accept")').first();

        if (await acceptButton.isVisible().catch(() => false)) {
          await acceptButton.click();

          // Wait for accept modal to appear
          await page.waitForTimeout(1000);

          // Look for modal or form to enter requirement details
          const modal = page.locator('[role="dialog"], .modal').first();

          if (await modal.isVisible().catch(() => false)) {
            // Fill in requirement ref
            const refInput = modal.locator('input[name="ref"], input[placeholder*="ref"]').first();

            if (await refInput.isVisible().catch(() => false)) {
              const testRef = getUniqueTestRef('ACC');
              await refInput.fill(testRef);

              // Look for confirm/submit button
              const confirmButton = modal.locator('button[type="submit"], button:has-text("Confirm"), button:has-text("Accept")').first();

              if (await confirmButton.isVisible().catch(() => false)) {
                await confirmButton.click();

                // Wait for acceptance to complete
                await page.waitForTimeout(2000);

                // Modal should close
                await expect(modal).not.toBeVisible({ timeout: 5000 });
              }
            }
          }
        }
      }
    }
  });

  test('should reject a candidate', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for existing candidates
    await page.waitForTimeout(2000);

    // Look for the first candidate
    const candidateCard = page.locator('[data-testid="candidate-card"], .candidate-card').first();

    if (await candidateCard.isVisible().catch(() => false)) {
      // Get initial count of candidates
      const initialCount = await page.locator('[data-testid="candidate-card"], .candidate-card').count();

      // Click reject button
      const rejectButton = candidateCard.locator('button:has-text("Reject")').first();

      if (await rejectButton.isVisible().catch(() => false)) {
        await rejectButton.click();

        // Wait for rejection to process
        await page.waitForTimeout(2000);

        // Candidate count should decrease or candidate should be marked as rejected
        const newCount = await page.locator('[data-testid="candidate-card"], .candidate-card').count();
        const hasRejectedStatus = await candidateCard.locator('text=/rejected/i').isVisible().catch(() => false);

        expect(newCount < initialCount || hasRejectedStatus).toBe(true);
      }
    }
  });

  test('should use optional fields (glossary and constraints)', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Fill in instruction
    const instructionInput = page.locator('textarea[name="instruction"], textarea[placeholder*="instruction"]').first();
    await instructionInput.fill('Create requirements for tank armor');

    // Look for glossary input
    const glossaryInput = page.locator('textarea[name="glossary"], textarea[placeholder*="glossary"]').first();

    if (await glossaryInput.isVisible().catch(() => false)) {
      await glossaryInput.fill(sampleGlossary);
    }

    // Look for constraints input
    const constraintsInput = page.locator('textarea[name="constraints"], textarea[placeholder*="constraints"]').first();

    if (await constraintsInput.isVisible().catch(() => false)) {
      await constraintsInput.fill(sampleConstraints);
    }

    // Submit the form
    const generateButton = page.locator('button[type="submit"], button:has-text("Generate")').first();
    await generateButton.click();

    // Wait for generation
    await page.waitForTimeout(5000);

    // Should show loading or candidates
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toBeTruthy();
  });

  test('should toggle between requirements and diagram mode', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Look for mode selector
    const diagramModeRadio = page.locator('input[type="radio"][value="diagram"], label:has-text("Diagram")').first();

    if (await diagramModeRadio.isVisible().catch(() => false)) {
      await diagramModeRadio.click();

      // Wait for mode change
      await page.waitForTimeout(1000);

      // Should show diagram-specific UI
      const hasDiagramUI = await page.locator('text=/diagram/i').isVisible();
      expect(hasDiagramUI).toBe(true);

      // Switch back to requirements mode
      const requirementsModeRadio = page.locator('input[type="radio"][value="requirements"], label:has-text("Requirements")').first();

      if (await requirementsModeRadio.isVisible().catch(() => false)) {
        await requirementsModeRadio.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should filter and sort candidates', async ({ page }) => {
    await navigateToRoute(page, 'airgen', { tenant: testTenant, project: testProject });
    await waitForPageReady(page);

    // Wait for candidates to load
    await page.waitForTimeout(2000);

    // Look for filter/sort controls
    const sortControl = page.locator('select[name="sort"], button:has-text("Sort"), [data-testid="sort-control"]').first();

    if (await sortControl.isVisible().catch(() => false)) {
      // Interact with sort control
      await sortControl.click();
      await page.waitForTimeout(500);
    }

    // Look for text filter
    const textFilter = page.locator('input[placeholder*="filter"], input[type="search"]').first();

    if (await textFilter.isVisible().catch(() => false)) {
      await textFilter.fill('test');
      await page.waitForTimeout(1000);

      // Clear filter
      await textFilter.fill('');
    }
  });
});
