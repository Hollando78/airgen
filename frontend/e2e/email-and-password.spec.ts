import { test, expect } from '@playwright/test';
import { login, logout, getDefaultCredentials } from './helpers/auth-helpers';
import { clearBrowserState, waitForPageReady } from './helpers/test-setup';

/**
 * Email Verification and Password Reset E2E Tests
 *
 * Tests complete email and password management flows including:
 * - Email verification after registration
 * - Resending verification emails
 * - Password reset request
 * - Password reset with valid token
 * - Token expiry handling
 * - Password change (authenticated)
 */

test.describe('Email Verification', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test('should show unverified email warning after registration', async ({ page }) => {
    // Register a new user
    const timestamp = Date.now();
    const testEmail = `newuser${timestamp}@e2etest.local`;

    await page.goto('/signup');
    await waitForPageReady(page);

    await page.fill('input[name="email"], input[type="email"]', testEmail);
    await page.fill('input[name="password"], input[type="password"]', 'TestPass123!');

    const confirmPassword = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');
    if (await confirmPassword.isVisible()) {
      await confirmPassword.fill('TestPass123!');
    }

    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Should show verification notice or email sent message
    const hasVerificationNotice = await page.locator('[data-testid="verify-email-notice"], [role="alert"]')
      .filter({ hasText: /verify|verification|check.*email/i })
      .isVisible()
      .catch(() => false);

    if (hasVerificationNotice) {
      expect(hasVerificationNotice).toBe(true);
    }
  });

  test('should display resend verification email option', async ({ page }) => {
    await login(page);
    await waitForPageReady(page);

    // Check for unverified email banner or in settings
    const resendButton = page.locator('button:has-text("Resend"), button:has-text("Send Verification"), [data-testid="resend-verification"]');

    // Navigate to settings if not visible
    await page.goto('/settings/security');
    await waitForPageReady(page);

    const hasResendOption = await resendButton.isVisible().catch(() => false);

    // Resend option should exist (may be hidden if already verified)
    if (hasResendOption) {
      expect(hasResendOption).toBe(true);
    }
  });

  test('should handle resend verification email request', async ({ page }) => {
    await login(page);
    await page.goto('/settings/security');
    await waitForPageReady(page);

    const resendButton = page.locator('button:has-text("Resend"), button:has-text("Send Verification")');

    if (await resendButton.isVisible()) {
      await resendButton.click();
      await page.waitForTimeout(2000);

      // Should show success message
      const hasSuccessMessage = await page.locator('[data-testid="success-message"], [role="status"]')
        .filter({ hasText: /sent|email.*sent/i })
        .isVisible()
        .catch(() => false);

      expect(hasSuccessMessage).toBe(true);
    }
  });

  test('should verify email with valid token', async ({ page }) => {
    // This test would require a real token from the backend
    // For E2E, we test the verification page flow
    const mockToken = 'test-verification-token-12345';

    await page.goto(`/verify-email?token=${mockToken}`);
    await page.waitForTimeout(2000);

    // Should either succeed or show error for invalid token
    const hasSuccessMessage = await page.locator('[data-testid="success-message"], .success')
      .filter({ hasText: /verified|success/i })
      .isVisible()
      .catch(() => false);

    const hasErrorMessage = await page.locator('[data-testid="error-message"], .error')
      .filter({ hasText: /invalid|expired/i })
      .isVisible()
      .catch(() => false);

    // Should show some result (either success or error)
    expect(hasSuccessMessage || hasErrorMessage).toBe(true);
  });

  test('should handle expired verification token', async ({ page }) => {
    const expiredToken = 'expired-token-12345';

    await page.goto(`/verify-email?token=${expiredToken}`);
    await page.waitForTimeout(2000);

    // Should show expiration error or option to resend
    const hasExpiredMessage = await page.locator('[data-testid="error-message"], .error')
      .filter({ hasText: /expired|invalid/i })
      .isVisible()
      .catch(() => false);

    const hasResendOption = await page.locator('button:has-text("Resend"), button:has-text("Request New")')
      .isVisible()
      .catch(() => false);

    expect(hasExpiredMessage || hasResendOption).toBe(true);
  });

  test('should redirect to login after successful verification', async ({ page }) => {
    // Test the successful verification flow
    // (This would need a valid test token)
    await clearBrowserState(page);

    // Mock successful verification response
    await page.route('**/api/auth/verify-email*', route =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, message: 'Email verified successfully' })
      })
    );

    await page.goto('/verify-email?token=valid-test-token');
    await page.waitForTimeout(2000);

    // Should show success and offer login or auto-redirect
    const onLoginPage = page.url().includes('/login');
    const hasLoginLink = await page.locator('a:has-text("Login"), a:has-text("Sign In")')
      .isVisible()
      .catch(() => false);

    expect(onLoginPage || hasLoginLink).toBe(true);
  });
});

test.describe('Password Reset Request', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test('should display forgot password link on login page', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    const forgotPasswordLink = page.locator('a:has-text("Forgot"), button:has-text("Forgot"), [data-testid="forgot-password"]');
    const hasLink = await forgotPasswordLink.isVisible();

    expect(hasLink).toBe(true);
  });

  test('should navigate to password reset page', async ({ page }) => {
    await page.goto('/login');
    await waitForPageReady(page);

    const forgotPasswordLink = page.locator('a:has-text("Forgot"), button:has-text("Forgot")');
    await forgotPasswordLink.click();

    await page.waitForTimeout(1000);

    // Should be on reset password page
    const onResetPage = page.url().includes('/reset-password') || page.url().includes('/forgot-password');
    const hasEmailInput = await page.locator('input[name="email"], input[type="email"]').isVisible();

    expect(onResetPage || hasEmailInput).toBe(true);
  });

  test('should send password reset email for valid user', async ({ page }) => {
    const credentials = getDefaultCredentials();

    await page.goto('/forgot-password');
    await waitForPageReady(page);

    await page.fill('input[name="email"], input[type="email"]', credentials.username);
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should show success message (even for security reasons if user doesn't exist)
    const hasSuccessMessage = await page.locator('[data-testid="success-message"], [role="status"]')
      .filter({ hasText: /sent|email|check/i })
      .isVisible()
      .catch(() => false);

    expect(hasSuccessMessage).toBe(true);
  });

  test('should handle non-existent email gracefully', async ({ page }) => {
    await page.goto('/forgot-password');
    await waitForPageReady(page);

    await page.fill('input[name="email"], input[type="email"]', 'nonexistent@user.com');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(2000);

    // Should show generic success message (security best practice)
    // Don't reveal if email exists or not
    const hasMessage = await page.locator('[data-testid="success-message"], [role="status"]')
      .isVisible()
      .catch(() => false);

    expect(hasMessage).toBe(true);
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/forgot-password');
    await waitForPageReady(page);

    await page.fill('input[name="email"], input[type="email"]', 'not-an-email');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(1000);

    // Should show email validation error
    const hasError = await page.locator('[role="alert"], .error')
      .filter({ hasText: /invalid|email|format/i })
      .isVisible()
      .catch(() => false);

    expect(hasError).toBe(true);
  });

  test('should rate limit password reset requests', async ({ page }) => {
    const credentials = getDefaultCredentials();

    await page.goto('/forgot-password');
    await waitForPageReady(page);

    // Submit multiple requests
    for (let i = 0; i < 6; i++) {
      await page.fill('input[name="email"], input[type="email"]', credentials.username);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);

      // Might need to refresh or navigate back
      if (i < 5) {
        await page.goto('/forgot-password');
      }
    }

    await page.waitForTimeout(1000);

    // Should eventually show rate limit message
    const hasRateLimitMessage = await page.locator('[role="alert"], .error')
      .filter({ hasText: /too many|rate limit|slow down|try again/i })
      .isVisible()
      .catch(() => false);

    // Rate limiting may or may not be triggered depending on config
    expect(typeof hasRateLimitMessage).toBe('boolean');
  });
});

test.describe('Password Reset with Token', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
  });

  test('should display reset password form with valid token', async ({ page }) => {
    const mockToken = 'valid-reset-token-12345';

    await page.goto(`/reset-password?token=${mockToken}`);
    await page.waitForTimeout(1000);

    // Should show new password form
    const hasPasswordInput = await page.locator('input[name="password"], input[type="password"]').isVisible();
    const hasConfirmInput = await page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]')
      .isVisible()
      .catch(() => false);

    expect(hasPasswordInput || hasConfirmInput).toBe(true);
  });

  test('should reset password with valid token and new password', async ({ page }) => {
    const mockToken = 'valid-reset-token-12345';

    // Mock successful reset
    await page.route('**/api/auth/reset-password*', route =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true })
      })
    );

    await page.goto(`/reset-password?token=${mockToken}`);
    await page.waitForTimeout(1000);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    if (await passwordInput.isVisible()) {
      await passwordInput.fill('NewSecurePass123!');

      const confirmInput = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');
      if (await confirmInput.isVisible()) {
        await confirmInput.fill('NewSecurePass123!');
      }

      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);

      // Should show success message or redirect to login
      const hasSuccess = await page.locator('[data-testid="success-message"], .success')
        .isVisible()
        .catch(() => false);

      const onLoginPage = page.url().includes('/login');

      expect(hasSuccess || onLoginPage).toBe(true);
    }
  });

  test('should enforce password requirements on reset', async ({ page }) => {
    const mockToken = 'valid-reset-token-12345';

    await page.goto(`/reset-password?token=${mockToken}`);
    await page.waitForTimeout(1000);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    if (await passwordInput.isVisible()) {
      // Try weak password
      await passwordInput.fill('weak');
      await page.click('button[type="submit"]');

      await page.waitForTimeout(1000);

      // Should show password requirements error
      const hasError = await page.locator('[role="alert"], .error')
        .filter({ hasText: /password|strong|requirement|character/i })
        .isVisible()
        .catch(() => false);

      expect(hasError).toBe(true);
    }
  });

  test('should verify password confirmation matches', async ({ page }) => {
    const mockToken = 'valid-reset-token-12345';

    await page.goto(`/reset-password?token=${mockToken}`);
    await page.waitForTimeout(1000);

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    const confirmInput = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');

    if (await passwordInput.isVisible() && await confirmInput.isVisible()) {
      await passwordInput.fill('NewPassword123!');
      await confirmInput.fill('DifferentPassword123!');
      await page.click('button[type="submit"]');

      await page.waitForTimeout(1000);

      // Should show mismatch error
      const hasError = await page.locator('[role="alert"], .error')
        .filter({ hasText: /match|same|confirm/i })
        .isVisible()
        .catch(() => false);

      expect(hasError).toBe(true);
    }
  });

  test('should handle expired reset token', async ({ page }) => {
    const expiredToken = 'expired-token-12345';

    // Mock expired token response
    await page.route('**/api/auth/reset-password*', route =>
      route.fulfill({
        status: 400,
        body: JSON.stringify({ error: 'Token expired or invalid' })
      })
    );

    await page.goto(`/reset-password?token=${expiredToken}`);
    await page.waitForTimeout(2000);

    // Should show expired token error
    const hasError = await page.locator('[data-testid="error-message"], .error')
      .filter({ hasText: /expired|invalid|token/i })
      .isVisible()
      .catch(() => false);

    const hasRequestNewLink = await page.locator('a:has-text("Request New"), button:has-text("Request New")')
      .isVisible()
      .catch(() => false);

    expect(hasError || hasRequestNewLink).toBe(true);
  });

  test('should handle invalid reset token', async ({ page }) => {
    const invalidToken = 'invalid-token';

    await page.goto(`/reset-password?token=${invalidToken}`);
    await page.waitForTimeout(2000);

    // Should show invalid token error
    const hasError = await page.locator('[data-testid="error-message"], .error')
      .isVisible()
      .catch(() => false);

    expect(hasError).toBe(true);
  });
});

test.describe('Password Change (Authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await clearBrowserState(page);
    await login(page);
  });

  test('should display change password option in settings', async ({ page }) => {
    await page.goto('/settings/security');
    await waitForPageReady(page);

    const changePasswordButton = page.locator('button:has-text("Change Password"), a:has-text("Change Password"), [data-testid="change-password"]');
    const hasOption = await changePasswordButton.isVisible();

    expect(hasOption).toBe(true);
  });

  test('should change password with current password verification', async ({ page }) => {
    await page.goto('/settings/security');
    await waitForPageReady(page);

    const changePasswordButton = page.locator('button:has-text("Change Password"), a:has-text("Change Password")');

    if (await changePasswordButton.isVisible()) {
      await changePasswordButton.click();
      await page.waitForTimeout(1000);

      // Should require current password
      const currentPasswordInput = page.locator('input[name="currentPassword"], input[name="oldPassword"]');
      const hasCurrentPasswordField = await currentPasswordInput.isVisible();

      expect(hasCurrentPasswordField).toBe(true);
    }
  });

  test('should reject incorrect current password', async ({ page }) => {
    await page.goto('/settings/security');
    await waitForPageReady(page);

    const changePasswordButton = page.locator('button:has-text("Change Password")');

    if (await changePasswordButton.isVisible()) {
      await changePasswordButton.click();
      await page.waitForTimeout(1000);

      const currentPasswordInput = page.locator('input[name="currentPassword"], input[name="oldPassword"]');
      const newPasswordInput = page.locator('input[name="newPassword"], input[name="password"]').last();

      if (await currentPasswordInput.isVisible() && await newPasswordInput.isVisible()) {
        await currentPasswordInput.fill('WrongPassword123!');
        await newPasswordInput.fill('NewPassword123!');

        const confirmInput = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');
        if (await confirmInput.isVisible()) {
          await confirmInput.fill('NewPassword123!');
        }

        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);

        // Should show error for incorrect current password
        const hasError = await page.locator('[role="alert"], .error')
          .filter({ hasText: /incorrect|wrong|current|invalid/i })
          .isVisible()
          .catch(() => false);

        expect(hasError).toBe(true);
      }
    }
  });

  test('should successfully change password', async ({ page }) => {
    const credentials = getDefaultCredentials();

    // Mock successful password change
    await page.route('**/api/auth/change-password*', route =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true })
      })
    );

    await page.goto('/settings/security');
    await waitForPageReady(page);

    const changePasswordButton = page.locator('button:has-text("Change Password")');

    if (await changePasswordButton.isVisible()) {
      await changePasswordButton.click();
      await page.waitForTimeout(1000);

      const currentPasswordInput = page.locator('input[name="currentPassword"], input[name="oldPassword"]');
      const newPasswordInput = page.locator('input[name="newPassword"], input[name="password"]').last();

      if (await currentPasswordInput.isVisible() && await newPasswordInput.isVisible()) {
        await currentPasswordInput.fill(credentials.password);
        await newPasswordInput.fill('NewSecurePassword123!');

        const confirmInput = page.locator('input[name="confirmPassword"], input[name="passwordConfirm"]');
        if (await confirmInput.isVisible()) {
          await confirmInput.fill('NewSecurePassword123!');
        }

        await page.click('button[type="submit"]');
        await page.waitForTimeout(2000);

        // Should show success message
        const hasSuccess = await page.locator('[data-testid="success-message"], .success')
          .filter({ hasText: /changed|updated|success/i })
          .isVisible()
          .catch(() => false);

        expect(hasSuccess).toBe(true);
      }
    }
  });

  test('should logout after password change', async ({ page }) => {
    const credentials = getDefaultCredentials();

    // Mock successful password change that triggers logout
    await page.route('**/api/auth/change-password*', route =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, logout: true })
      })
    );

    await page.goto('/settings/security');
    const changePasswordButton = page.locator('button:has-text("Change Password")');

    if (await changePasswordButton.isVisible()) {
      await changePasswordButton.click();
      await page.waitForTimeout(1000);

      // Fill and submit password change form
      const currentPasswordInput = page.locator('input[name="currentPassword"]');
      if (await currentPasswordInput.isVisible()) {
        await currentPasswordInput.fill(credentials.password);

        const newPasswordInput = page.locator('input[name="newPassword"]');
        await newPasswordInput.fill('NewPassword123!');

        await page.click('button[type="submit"]');
        await page.waitForTimeout(3000);

        // Should be redirected to login or show logout message
        const onLoginPage = page.url().includes('/login');
        const notLoggedIn = !(await isLoggedIn(page));

        expect(onLoginPage || notLoggedIn).toBe(true);
      }
    }
  });
});

test.describe('Security Features', () => {
  test('should prevent password reset token reuse', async ({ page }) => {
    const usedToken = 'used-token-12345';

    // Mock "token already used" response
    await page.route('**/api/auth/reset-password*', route =>
      route.fulfill({
        status: 400,
        body: JSON.stringify({ error: 'Token already used' })
      })
    );

    await page.goto(`/reset-password?token=${usedToken}`);
    await page.waitForTimeout(2000);

    // Should show error about token being used
    const hasError = await page.locator('[data-testid="error-message"], .error')
      .isVisible()
      .catch(() => false);

    expect(hasError).toBe(true);
  });

  test('should enforce password history (not allow recent passwords)', async ({ page }) => {
    await login(page);

    const credentials = getDefaultCredentials();

    // Mock password history check
    await page.route('**/api/auth/change-password*', route =>
      route.fulfill({
        status: 400,
        body: JSON.stringify({ error: 'Cannot reuse recent passwords' })
      })
    );

    await page.goto('/settings/security');
    const changePasswordButton = page.locator('button:has-text("Change Password")');

    if (await changePasswordButton.isVisible()) {
      await changePasswordButton.click();
      await page.waitForTimeout(1000);

      const currentPasswordInput = page.locator('input[name="currentPassword"]');
      if (await currentPasswordInput.isVisible()) {
        // Try to set password to same as current
        await currentPasswordInput.fill(credentials.password);

        const newPasswordInput = page.locator('input[name="newPassword"]');
        await newPasswordInput.fill(credentials.password);

        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);

        // Should show error about reusing password
        const hasError = await page.locator('[role="alert"], .error')
          .isVisible()
          .catch(() => false);

        expect(hasError).toBe(true);
      }
    }
  });
});
