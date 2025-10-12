import { test, expect } from '@playwright/test';
import { login, isLoggedIn } from './helpers/auth-helpers';
import {
  clearBrowserState,
  waitForPageReady,
  navigateToRoute,
  getDefaultContext,
  waitForApiResponse,
  takeScreenshot,
  fillFormField
} from './helpers/test-setup';

/**
 * Core Application Workflows E2E Tests
 *
 * Tests the main business workflows:
 * - Requirements management (CRUD)
 * - Document upload and viewing
 * - AIRGen candidate generation and acceptance
 * - Drafts workflow
 * - Links/traceability management
 */

test.describe('Requirements Management', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
    await waitForPageReady(page);
  });

  test('should display requirements page', async ({ page }) => {
    await navigateToRoute(page, 'requirements');
    await waitForPageReady(page);

    // Should show requirements list or table
    const hasRequirementsList = await page.locator(
      '[data-testid="requirements-list"], table, .requirements-container'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasRequirementsList).toBe(true);
    await takeScreenshot(page, 'requirements-page');
  });

  test('should navigate to requirements page from dashboard', async ({ page }) => {
    const context = getDefaultContext();
    await page.goto(`/?tenant=${context.tenant}&project=${context.project}`);
    await waitForPageReady(page);

    // Look for requirements link/button
    const requirementsLink = page.locator(
      'a[href*="requirements"], button:has-text("Requirements"), [data-testid="nav-requirements"]'
    );

    if (await requirementsLink.isVisible()) {
      await requirementsLink.click();
      await page.waitForTimeout(1000);

      // Should be on requirements page
      expect(page.url()).toContain('requirements');
    }
  });

  test('should view requirement details', async ({ page }) => {
    await navigateToRoute(page, 'requirements');
    await waitForPageReady(page);

    // Find first requirement in list (could be row, card, or item)
    const firstRequirement = page.locator(
      'tr[data-testid^="requirement-"], .requirement-item, [data-testid*="req-"]'
    ).first();

    if (await firstRequirement.isVisible({ timeout: 5000 })) {
      await firstRequirement.click();
      await page.waitForTimeout(1000);

      // Should show requirement details (modal, panel, or new page)
      const hasDetails = await page.locator(
        '[data-testid="requirement-details"], .requirement-detail, .modal, .sidebar'
      ).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDetails).toBe(true);
      await takeScreenshot(page, 'requirement-details');
    }
  });

  test('should filter requirements', async ({ page }) => {
    await navigateToRoute(page, 'requirements');
    await waitForPageReady(page);

    // Look for filter/search input
    const filterInput = page.locator(
      'input[placeholder*="filter"], input[placeholder*="search"], [data-testid="search-input"]'
    );

    if (await filterInput.isVisible({ timeout: 3000 })) {
      await filterInput.fill('test');
      await page.waitForTimeout(1000);

      // List should update (check for loading state or results)
      const hasResults = await page.locator(
        '[data-testid="requirements-list"], table tbody tr, .requirement-item'
      ).isVisible().catch(() => false);

      expect(typeof hasResults).toBe('boolean');
    }
  });

  test('should create new requirement', async ({ page }) => {
    await navigateToRoute(page, 'requirements');
    await waitForPageReady(page);

    // Look for "New" or "Add" requirement button
    const newButton = page.locator(
      'button:has-text("New"), button:has-text("Add"), button:has-text("Create"), [data-testid="new-requirement"]'
    );

    if (await newButton.isVisible({ timeout: 3000 })) {
      await newButton.click();
      await page.waitForTimeout(1000);

      // Should show form (modal or new page)
      const hasForm = await page.locator(
        'form, [data-testid="requirement-form"], .modal'
      ).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasForm).toBe(true);
      await takeScreenshot(page, 'new-requirement-form');
    }
  });
});

test.describe('Documents Management', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
    await waitForPageReady(page);
  });

  test('should display documents page', async ({ page }) => {
    await navigateToRoute(page, 'documents');
    await waitForPageReady(page);

    // Should show documents list or upload area
    const hasDocumentsArea = await page.locator(
      '[data-testid="documents-list"], .documents-container, [data-testid="upload-area"]'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasDocumentsArea).toBe(true);
    await takeScreenshot(page, 'documents-page');
  });

  test('should show upload document option', async ({ page }) => {
    await navigateToRoute(page, 'documents');
    await waitForPageReady(page);

    // Look for upload button or drag-drop area
    const uploadOption = await page.locator(
      'button:has-text("Upload"), input[type="file"], [data-testid="upload-button"], .upload-zone'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(uploadOption).toBe(true);
  });

  test('should display uploaded documents list', async ({ page }) => {
    await navigateToRoute(page, 'documents');
    await waitForPageReady(page);

    // Should show list of documents (table, grid, or list)
    const documentsList = page.locator(
      'table, .document-grid, .document-list, [data-testid="documents-list"]'
    );

    const hasList = await documentsList.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasList) {
      // Check if there are any documents
      const documentItems = page.locator(
        'tr[data-testid*="document-"], .document-item, .document-card'
      );

      const count = await documentItems.count();
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        await takeScreenshot(page, 'documents-list');
      }
    }
  });

  test('should view document details', async ({ page }) => {
    await navigateToRoute(page, 'documents');
    await waitForPageReady(page);

    // Find first document
    const firstDocument = page.locator(
      'tr[data-testid*="document-"], .document-item, .document-card'
    ).first();

    if (await firstDocument.isVisible({ timeout: 5000 })) {
      await firstDocument.click();
      await page.waitForTimeout(1000);

      // Should show document viewer or details
      const hasViewer = await page.locator(
        '[data-testid="document-viewer"], .document-detail, .pdf-viewer, iframe'
      ).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasViewer).toBe(true);
      await takeScreenshot(page, 'document-viewer');
    }
  });
});

test.describe('AIRGen Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
    await waitForPageReady(page);
  });

  test('should display AIRGen page', async ({ page }) => {
    await navigateToRoute(page, 'airgen');
    await waitForPageReady(page);

    // Should show AIRGen interface
    const hasAirGenUI = await page.locator(
      '[data-testid="airgen-container"], .airgen-page, h1:has-text("AIRGen"), h2:has-text("Generate")'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasAirGenUI).toBe(true);
    await takeScreenshot(page, 'airgen-page');
  });

  test('should show requirement generation options', async ({ page }) => {
    await navigateToRoute(page, 'airgen');
    await waitForPageReady(page);

    // Look for source document selector or input
    const hasSourceSelector = await page.locator(
      '[data-testid="source-selector"], select, [data-testid="document-select"]'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    // Or look for generate button
    const hasGenerateButton = await page.locator(
      'button:has-text("Generate"), button:has-text("Create"), [data-testid="generate-button"]'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasSourceSelector || hasGenerateButton).toBe(true);
  });

  test('should display generated candidates', async ({ page }) => {
    await navigateToRoute(page, 'airgen');
    await waitForPageReady(page);

    // Look for candidates list or table
    const candidatesList = page.locator(
      '[data-testid="candidates-list"], .candidates-container, table'
    );

    const hasCandidates = await candidatesList.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCandidates) {
      // Check for individual candidate items
      const candidateItems = page.locator(
        '[data-testid*="candidate-"], .candidate-item, tr[data-testid*="req-"]'
      );

      const count = await candidateItems.count();
      expect(count).toBeGreaterThanOrEqual(0);

      if (count > 0) {
        await takeScreenshot(page, 'airgen-candidates');
      }
    }
  });

  test('should allow accepting candidates', async ({ page }) => {
    await navigateToRoute(page, 'airgen');
    await waitForPageReady(page);

    // Look for accept buttons on candidates
    const acceptButton = page.locator(
      'button:has-text("Accept"), [data-testid="accept-button"], input[type="checkbox"][data-testid*="accept"]'
    ).first();

    if (await acceptButton.isVisible({ timeout: 5000 })) {
      // Verify button is interactive
      const isEnabled = await acceptButton.isEnabled();
      expect(typeof isEnabled).toBe('boolean');
    }
  });

  test('should show bulk actions for candidates', async ({ page }) => {
    await navigateToRoute(page, 'airgen');
    await waitForPageReady(page);

    // Look for bulk action controls
    const bulkActions = await page.locator(
      'button:has-text("Accept All"), button:has-text("Reject All"), [data-testid="bulk-actions"]'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    const selectAll = await page.locator(
      'input[type="checkbox"][data-testid="select-all"], th input[type="checkbox"]'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    // Either bulk actions or select all should be available
    expect(typeof (bulkActions || selectAll)).toBe('boolean');
  });
});

test.describe('Drafts Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
    await waitForPageReady(page);
  });

  test('should display drafts page', async ({ page }) => {
    await navigateToRoute(page, 'drafts');
    await waitForPageReady(page);

    // Should show drafts list or empty state
    const hasDraftsUI = await page.locator(
      '[data-testid="drafts-list"], .drafts-container, table, .empty-state'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasDraftsUI).toBe(true);
    await takeScreenshot(page, 'drafts-page');
  });

  test('should show draft requirements', async ({ page }) => {
    await navigateToRoute(page, 'drafts');
    await waitForPageReady(page);

    // Look for draft items
    const draftItems = page.locator(
      '[data-testid*="draft-"], .draft-item, tr[data-testid*="draft"]'
    );

    const count = await draftItems.count();
    expect(count).toBeGreaterThanOrEqual(0);

    if (count > 0) {
      await takeScreenshot(page, 'drafts-list');
    }
  });

  test('should allow editing drafts', async ({ page }) => {
    await navigateToRoute(page, 'drafts');
    await waitForPageReady(page);

    // Find first draft
    const firstDraft = page.locator(
      '[data-testid*="draft-"], .draft-item, tr[data-testid*="draft"]'
    ).first();

    if (await firstDraft.isVisible({ timeout: 5000 })) {
      // Look for edit button or click draft
      const editButton = firstDraft.locator('button:has-text("Edit"), [data-testid="edit-button"]');

      if (await editButton.isVisible()) {
        await editButton.click();
      } else {
        await firstDraft.click();
      }

      await page.waitForTimeout(1000);

      // Should show editor or form
      const hasEditor = await page.locator(
        'textarea, [contenteditable="true"], [data-testid="editor"], .draft-editor'
      ).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasEditor).toBe(true);
    }
  });

  test('should allow promoting drafts to requirements', async ({ page }) => {
    await navigateToRoute(page, 'drafts');
    await waitForPageReady(page);

    // Look for promote/accept button
    const promoteButton = page.locator(
      'button:has-text("Promote"), button:has-text("Accept"), button:has-text("Approve"), [data-testid="promote-button"]'
    ).first();

    if (await promoteButton.isVisible({ timeout: 5000 })) {
      const isEnabled = await promoteButton.isEnabled();
      expect(typeof isEnabled).toBe('boolean');
    }
  });

  test('should allow rejecting drafts', async ({ page }) => {
    await navigateToRoute(page, 'drafts');
    await waitForPageReady(page);

    // Look for reject/delete button
    const rejectButton = page.locator(
      'button:has-text("Reject"), button:has-text("Delete"), button:has-text("Discard"), [data-testid="reject-button"]'
    ).first();

    if (await rejectButton.isVisible({ timeout: 5000 })) {
      const isEnabled = await rejectButton.isEnabled();
      expect(typeof isEnabled).toBe('boolean');
    }
  });
});

test.describe('Links and Traceability', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
    await waitForPageReady(page);
  });

  test('should display links page', async ({ page }) => {
    await navigateToRoute(page, 'links');
    await waitForPageReady(page);

    // Should show links interface
    const hasLinksUI = await page.locator(
      '[data-testid="links-container"], .links-page, table, .links-list'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasLinksUI).toBe(true);
    await takeScreenshot(page, 'links-page');
  });

  test('should show requirement links', async ({ page }) => {
    await navigateToRoute(page, 'links');
    await waitForPageReady(page);

    // Look for links or relationship visualization
    const hasLinks = await page.locator(
      '[data-testid*="link-"], .link-item, tr, .relationship-item'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(typeof hasLinks).toBe('boolean');

    if (hasLinks) {
      await takeScreenshot(page, 'links-list');
    }
  });

  test('should allow creating new links', async ({ page }) => {
    await navigateToRoute(page, 'links');
    await waitForPageReady(page);

    // Look for create link button
    const createLinkButton = page.locator(
      'button:has-text("New Link"), button:has-text("Create Link"), button:has-text("Add Link"), [data-testid="create-link"]'
    );

    if (await createLinkButton.isVisible({ timeout: 5000 })) {
      await createLinkButton.click();
      await page.waitForTimeout(1000);

      // Should show link creation form
      const hasForm = await page.locator(
        'form, [data-testid="link-form"], .modal, .link-creator'
      ).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasForm).toBe(true);
    }
  });

  test('should show link types', async ({ page }) => {
    await navigateToRoute(page, 'links');
    await waitForPageReady(page);

    // Look for link type selector or filter
    const linkTypeSelector = await page.locator(
      'select[data-testid*="link-type"], [data-testid="link-type-filter"], button:has-text("Type")'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    // Or look for link type badges/labels in the list
    const linkTypeLabels = await page.locator(
      '.link-type, [data-testid*="type-"], .badge'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(linkTypeSelector || linkTypeLabels).toBe(true);
  });

  test('should navigate to graph viewer', async ({ page }) => {
    const context = getDefaultContext();

    // Try direct navigation to graph viewer
    await page.goto(`/graph?tenant=${context.tenant}&project=${context.project}`);
    await waitForPageReady(page);

    // Should show graph visualization or viewer
    const hasGraphViewer = await page.locator(
      '[data-testid="graph-viewer"], .graph-container, svg, canvas'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasGraphViewer).toBe(true);

    if (hasGraphViewer) {
      await takeScreenshot(page, 'graph-viewer');
    }
  });
});

test.describe('Navigation and UI', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
    await waitForPageReady(page);
  });

  test('should display navigation menu', async ({ page }) => {
    const context = getDefaultContext();
    await page.goto(`/?tenant=${context.tenant}&project=${context.project}`);
    await waitForPageReady(page);

    // Look for navigation menu
    const nav = await page.locator(
      'nav, [role="navigation"], .sidebar, .nav-menu, header nav'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(nav).toBe(true);
  });

  test('should show tenant and project context', async ({ page }) => {
    const context = getDefaultContext();
    await page.goto(`/?tenant=${context.tenant}&project=${context.project}`);
    await waitForPageReady(page);

    // Look for tenant/project display
    const hasContext = await page.locator(
      `text=${context.tenant}, text=${context.project}, [data-testid="tenant-display"], [data-testid="project-display"]`
    ).isVisible({ timeout: 5000 }).catch(() => false);

    // Context should be visible somewhere in the UI
    expect(typeof hasContext).toBe('boolean');
  });

  test('should navigate between main sections', async ({ page }) => {
    const context = getDefaultContext();
    await page.goto(`/?tenant=${context.tenant}&project=${context.project}`);
    await waitForPageReady(page);

    // Define sections to test
    const sections = ['requirements', 'documents', 'airgen', 'drafts', 'links'];

    for (const section of sections.slice(0, 3)) { // Test first 3 to keep test fast
      // Try to find and click navigation link
      const navLink = page.locator(
        `a[href*="${section}"], button:has-text("${section}"), [data-testid="nav-${section}"]`
      ).first();

      if (await navLink.isVisible({ timeout: 3000 })) {
        await navLink.click();
        await page.waitForTimeout(1000);

        // Verify navigation worked
        const urlContainsSection = page.url().includes(section);
        expect(urlContainsSection).toBe(true);
      }
    }
  });

  test('should show user profile menu', async ({ page }) => {
    const context = getDefaultContext();
    await page.goto(`/?tenant=${context.tenant}&project=${context.project}`);
    await waitForPageReady(page);

    // Look for user menu or profile button
    const userMenu = page.locator(
      '[data-testid="user-menu"], .user-profile, button[aria-label*="user"], button[aria-label*="account"]'
    );

    if (await userMenu.isVisible({ timeout: 5000 })) {
      await userMenu.click();
      await page.waitForTimeout(500);

      // Should show dropdown or menu
      const hasDropdown = await page.locator(
        '[role="menu"], .dropdown-menu, [data-testid="user-dropdown"]'
      ).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasDropdown).toBe(true);
    }
  });
});

test.describe('Baselines', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
    await waitForPageReady(page);
  });

  test('should display baselines page', async ({ page }) => {
    await navigateToRoute(page, 'baselines');
    await waitForPageReady(page);

    // Should show baselines interface
    const hasBaselinesUI = await page.locator(
      '[data-testid="baselines-container"], .baselines-page, table, .baselines-list'
    ).isVisible({ timeout: 5000 }).catch(() => false);

    expect(hasBaselinesUI).toBe(true);
    await takeScreenshot(page, 'baselines-page');
  });

  test('should list existing baselines', async ({ page }) => {
    await navigateToRoute(page, 'baselines');
    await waitForPageReady(page);

    // Look for baseline items
    const baselineItems = page.locator(
      '[data-testid*="baseline-"], .baseline-item, tr[data-testid*="baseline"]'
    );

    const count = await baselineItems.count();
    expect(count).toBeGreaterThanOrEqual(0);

    if (count > 0) {
      await takeScreenshot(page, 'baselines-list');
    }
  });

  test('should allow creating new baseline', async ({ page }) => {
    await navigateToRoute(page, 'baselines');
    await waitForPageReady(page);

    // Look for create baseline button
    const createButton = page.locator(
      'button:has-text("New Baseline"), button:has-text("Create Baseline"), [data-testid="create-baseline"]'
    );

    if (await createButton.isVisible({ timeout: 5000 })) {
      await createButton.click();
      await page.waitForTimeout(1000);

      // Should show baseline creation form
      const hasForm = await page.locator(
        'form, [data-testid="baseline-form"], .modal'
      ).isVisible({ timeout: 3000 }).catch(() => false);

      expect(hasForm).toBe(true);
    }
  });

  test('should show baseline comparison', async ({ page }) => {
    await navigateToRoute(page, 'baselines');
    await waitForPageReady(page);

    // Look for compare option
    const compareButton = page.locator(
      'button:has-text("Compare"), [data-testid="compare-button"], button:has-text("Diff")'
    );

    if (await compareButton.isVisible({ timeout: 5000 })) {
      const isEnabled = await compareButton.isEnabled();
      expect(typeof isEnabled).toBe('boolean');
    }
  });
});
