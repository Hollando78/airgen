import { Page } from '@playwright/test';

/**
 * Common test setup utilities
 */

export interface TestContext {
  tenant: string;
  project: string;
}

/**
 * Get default test context
 */
export function getDefaultContext(): TestContext {
  return {
    tenant: process.env.TEST_TENANT || 'hollando',
    project: process.env.TEST_PROJECT || 'main-battle-tank',
  };
}

/**
 * Navigate to a route with tenant and project context
 */
export async function navigateToRoute(
  page: Page,
  route: string,
  context?: TestContext
): Promise<void> {
  const ctx = context || getDefaultContext();
  const url = `/${route}?tenant=${ctx.tenant}&project=${ctx.project}`;
  await page.goto(url);
}

/**
 * Wait for page to be fully loaded and hydrated
 */
export async function waitForPageReady(page: Page): Promise<void> {
  // Wait for React to hydrate
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeScreenshot(
  page: Page,
  name: string
): Promise<void> {
  await page.screenshot({
    path: `playwright-report/screenshots/${name}.png`,
    fullPage: true,
  });
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp
): Promise<void> {
  await page.waitForResponse((response) => {
    const url = response.url();
    if (typeof urlPattern === 'string') {
      return url.includes(urlPattern);
    }
    return urlPattern.test(url);
  });
}

/**
 * Clear local storage and cookies
 */
export async function clearBrowserState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}

/**
 * Wait for an element to be visible and stable
 */
export async function waitForElementStable(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<void> {
  const element = page.locator(selector);
  await element.waitFor({ state: 'visible', timeout });
  // Wait a bit for animations to complete
  await page.waitForTimeout(300);
}

/**
 * Fill form field with retry logic
 */
export async function fillFormField(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  const input = page.locator(selector);
  await input.waitFor({ state: 'visible' });
  await input.fill(value);
  // Verify the value was set
  const actualValue = await input.inputValue();
  if (actualValue !== value) {
    // Retry once
    await input.fill(value);
  }
}
