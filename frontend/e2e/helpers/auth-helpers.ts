import { Page } from '@playwright/test';

/**
 * Authentication helper functions for E2E tests
 */

export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Get default test credentials
 */
export function getDefaultCredentials(): LoginCredentials {
  return {
    username: process.env.TEST_USERNAME || 'admin',
    password: process.env.TEST_PASSWORD || 'admin123',
  };
}

/**
 * Perform login via UI
 */
export async function login(
  page: Page,
  credentials?: LoginCredentials
): Promise<void> {
  const creds = credentials || getDefaultCredentials();

  // Navigate to login page
  await page.goto('/login');

  // Wait for login form to be visible
  await page.waitForSelector('input[name="username"], input[type="text"]', {
    state: 'visible',
  });

  // Fill in credentials
  await page.fill('input[name="username"], input[type="text"]', creds.username);
  await page.fill('input[name="password"], input[type="password"]', creds.password);

  // Submit the form
  await page.click('button[type="submit"]');

  // Wait for navigation to complete
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 10000,
  });
}

/**
 * Perform logout
 */
export async function logout(page: Page): Promise<void> {
  // Look for logout button or user menu
  const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign out")');

  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  } else {
    // Try to find user menu dropdown
    const userMenu = page.locator('[data-testid="user-menu"], .user-menu');
    if (await userMenu.isVisible()) {
      await userMenu.click();
      await page.click('button:has-text("Logout"), button:has-text("Sign out")');
    }
  }

  // Wait for redirect to login
  await page.waitForURL((url) => url.pathname.includes('/login'), {
    timeout: 5000,
  });
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  // Check if we're on login page
  if (page.url().includes('/login')) {
    return false;
  }

  // Check for common authenticated UI elements
  const authIndicators = [
    'button:has-text("Logout")',
    'button:has-text("Sign out")',
    '[data-testid="user-menu"]',
    '.user-menu',
  ];

  for (const selector of authIndicators) {
    try {
      await page.waitForSelector(selector, { timeout: 2000, state: 'visible' });
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Login via API (faster for setup)
 * This assumes the API has a /api/auth/login endpoint
 */
export async function loginViaApi(
  page: Page,
  credentials?: LoginCredentials
): Promise<void> {
  const creds = credentials || getDefaultCredentials();

  const response = await page.request.post('/api/auth/login', {
    data: {
      username: creds.username,
      password: creds.password,
    },
  });

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${response.statusText()}`);
  }

  // The cookies should be set automatically by the browser context
}

/**
 * Setup authenticated session for a test
 * Use this in beforeEach to speed up tests
 */
export async function setupAuthenticatedSession(
  page: Page,
  credentials?: LoginCredentials
): Promise<void> {
  try {
    // Try API login first (faster)
    await loginViaApi(page, credentials);
  } catch (error) {
    // Fall back to UI login if API login fails
    await login(page, credentials);
  }
}
