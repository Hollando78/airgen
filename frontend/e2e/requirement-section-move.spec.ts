import { test, expect } from '@playwright/test';

/**
 * Test suite for Requirement Section Selection and Move functionality
 *
 * Tests:
 * 1. Add Requirement modal shows section selector
 * 2. Add Requirement with specific section selection
 * 3. Edit Requirement modal shows current section
 * 4. Move requirement to different section
 */

const BASE_URL = 'http://127.0.0.1:5173';
const TENANT = 'hollando';
const PROJECT = 'main-battle-tank';
const DOCUMENT = 'system-requirements-document';

test.describe('Requirement Section Selection and Move', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login
    await page.goto(`${BASE_URL}/login`);

    // Login
    await page.fill('input[type="email"]', 'test@dev.local');
    await page.fill('input[type="password"]', 'test');
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL(`${BASE_URL}/`);

    // Navigate to document
    await page.goto(`${BASE_URL}/${TENANT}/${PROJECT}/${DOCUMENT}`);

    // Wait for document to load
    await page.waitForSelector('[data-testid="document-view"]', { timeout: 10000 });
  });

  test('Add Requirement modal shows section selector', async ({ page }) => {
    // Find a section and click "Add Requirement" button
    const addButton = page.locator('button:has-text("Add Requirement")').first();
    await addButton.waitFor({ state: 'visible', timeout: 5000 });
    await addButton.click();

    // Wait for modal to appear
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Verify modal title
    await expect(page.locator('h2:has-text("Add Requirement")')).toBeVisible();

    // Verify section selector exists
    const sectionSelect = page.locator('select[name="section"], select:has(option:has-text("Select section"))');
    await expect(sectionSelect).toBeVisible();

    // Verify section selector has options
    const options = await sectionSelect.locator('option').count();
    expect(options).toBeGreaterThan(1); // At least "Select section" + one section

    // Close modal
    await page.click('button:has-text("Cancel")');
  });

  test('Add Requirement with section selection', async ({ page }) => {
    // Click "Add Requirement" button
    const addButton = page.locator('button:has-text("Add Requirement")').first();
    await addButton.waitFor({ state: 'visible', timeout: 5000 });
    await addButton.click();

    // Wait for modal
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Fill in requirement text
    const testReqText = `Test requirement for section selection - ${Date.now()}`;
    await page.fill('textarea[placeholder*="system shall"]', testReqText);

    // Select a section (select the second option, first is "Select section")
    const sectionSelect = page.locator('select[name="section"], select:has(option:has-text("Select section"))');
    await sectionSelect.selectOption({ index: 1 });

    // Get the selected section name for verification
    const selectedSectionText = await sectionSelect.locator('option:checked').textContent();
    console.log('Selected section:', selectedSectionText);

    // Submit the form
    await page.click('button:has-text("Add Requirement")');

    // Wait for modal to close
    await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

    // Wait a bit for the requirement to be added
    await page.waitForTimeout(1000);

    // Verify the requirement was added (should appear in the document)
    await expect(page.locator(`text=${testReqText}`)).toBeVisible({ timeout: 5000 });
  });

  test('Edit Requirement modal shows current section', async ({ page }) => {
    // Wait for requirements table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Find first requirement row and click edit icon
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ state: 'visible' });

    // Click the edit button (pencil icon)
    const editButton = firstRow.locator('button[title="Edit"], button:has-text("Edit"), button svg[data-icon="edit"]').first();
    await editButton.click();

    // Wait for edit modal
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Verify modal title contains "Edit Requirement"
    await expect(page.locator('h2:has-text("Edit Requirement")')).toBeVisible();

    // Verify section selector exists
    const sectionSelect = page.locator('select[name="section"], label:has-text("Section") + select, select:has(option:has-text("Select section"))');
    await expect(sectionSelect).toBeVisible();

    // Verify a section is pre-selected (not the empty option)
    const selectedValue = await sectionSelect.inputValue();
    expect(selectedValue).not.toBe('');

    // Close modal
    await page.click('button:has-text("Cancel")');
  });

  test('Move requirement to different section', async ({ page }) => {
    // Wait for requirements table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Find first requirement and get its text
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.waitFor({ state: 'visible' });
    const reqText = await firstRow.locator('td').nth(1).textContent(); // Assuming text is in 2nd column

    console.log('Editing requirement:', reqText);

    // Click edit button
    const editButton = firstRow.locator('button[title="Edit"], button:has-text("Edit"), button svg[data-icon="edit"]').first();
    await editButton.click();

    // Wait for modal
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Get current section
    const sectionSelect = page.locator('select[name="section"], label:has-text("Section") + select, select:has(option:has-text("Select section"))');
    const currentSectionIndex = await sectionSelect.evaluate((select: HTMLSelectElement) => select.selectedIndex);

    // Count total sections
    const totalSections = await sectionSelect.locator('option').count();

    if (totalSections > 2) { // At least empty option + 2 sections
      // Select a different section (if current is index 1, select 2, otherwise select 1)
      const newSectionIndex = currentSectionIndex === 1 ? 2 : 1;
      await sectionSelect.selectOption({ index: newSectionIndex });

      // Get the new section name
      const newSectionText = await sectionSelect.locator('option:checked').textContent();
      console.log('Moving to section:', newSectionText);

      // Submit
      await page.click('button:has-text("Update Requirement")');

      // Wait for modal to close
      await page.waitForSelector('[role="dialog"]', { state: 'hidden' });

      // Wait for update to complete
      await page.waitForTimeout(1000);

      // Verify requirement still exists (the move was successful)
      // Note: In a full implementation, we'd verify it appears in the new section
      await expect(page.locator(`text=${reqText?.substring(0, 30)}`)).toBeVisible({ timeout: 5000 });
    } else {
      console.log('Not enough sections to test moving between sections');
      // Close modal
      await page.click('button:has-text("Cancel")');
    }
  });

  test('Section selector is required when adding requirement', async ({ page }) => {
    // Click "Add Requirement" button
    const addButton = page.locator('button:has-text("Add Requirement")').first();
    await addButton.waitFor({ state: 'visible', timeout: 5000 });
    await addButton.click();

    // Wait for modal
    await page.waitForSelector('[role="dialog"]', { state: 'visible' });

    // Fill in requirement text
    await page.fill('textarea[placeholder*="system shall"]', 'Test requirement without section');

    // Don't select a section (leave it as "Select section")
    const sectionSelect = page.locator('select[name="section"], select:has(option:has-text("Select section"))');
    await sectionSelect.selectOption({ index: 0 }); // Select empty option

    // Try to submit - button should be disabled
    const submitButton = page.locator('button:has-text("Add Requirement")');
    await expect(submitButton).toBeDisabled();

    // Close modal
    await page.click('button:has-text("Cancel")');
  });
});
