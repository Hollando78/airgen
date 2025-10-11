# Security Features - Manual Test Checklist

This checklist helps verify that all security features are working correctly.

## Prerequisites

- [ ] Backend server running on http://localhost:8787
- [ ] Frontend running on http://localhost:5173
- [ ] Neo4j database running and accessible
- [ ] `.env` file configured with required variables

## 1. Basic Authentication

### Login Flow
- [ ] Navigate to http://localhost:5173
- [ ] Click "Sign In" or access login modal
- [ ] Enter valid credentials
- [ ] Verify successful login (redirected to dashboard)
- [ ] Verify `refreshToken` cookie set in browser DevTools (Application > Cookies)
- [ ] Verify user info displayed in UI

### Failed Login
- [ ] Attempt login with wrong password
- [ ] Verify error message: "Invalid credentials"
- [ ] Check browser console for no sensitive error details
- [ ] Check backend logs for `auth.login.failed` event

### Logout
- [ ] Click logout button
- [ ] Verify redirected to login page
- [ ] Verify `refreshToken` cookie cleared
- [ ] Check backend logs for `auth.logout` event

## 2. Session Management

### Access Token Expiry
- [ ] Login successfully
- [ ] Wait 15+ minutes (or modify JWT expiry to 1 min for testing)
- [ ] Make an authenticated request (navigate to page)
- [ ] Verify automatic token refresh happens
- [ ] Verify no disruption to user experience

### Refresh Token Rotation
- [ ] Login successfully
- [ ] Note the refresh token value in cookies
- [ ] Make a request that triggers refresh
- [ ] Verify refresh token has changed (rotation)

### Token Reuse Detection
- [ ] Login successfully
- [ ] Copy the refresh token value
- [ ] Make a refresh request with the token
- [ ] Try to reuse the same token again
- [ ] Verify rejection and session revocation

## 3. Two-Factor Authentication (2FA)

### Enable 2FA
- [ ] Login to account
- [ ] Navigate to user settings/profile
- [ ] Find "Two-Factor Authentication" section
- [ ] Click "Enable Two-Factor Authentication"
- [ ] Verify QR code displayed
- [ ] Scan QR code with authenticator app (Google Authenticator, Authy, etc.)
- [ ] Enter 6-digit TOTP code
- [ ] Verify success message
- [ ] **IMPORTANT**: Save the 10 backup codes displayed
- [ ] Download or copy backup codes
- [ ] Verify status shows "2FA Enabled"
- [ ] Check backend logs for `auth.mfa.enabled` event

### Login with 2FA
- [ ] Logout completely
- [ ] Login with email/password
- [ ] Verify MFA verification modal appears
- [ ] Enter 6-digit TOTP code from authenticator app
- [ ] Verify successful login
- [ ] Check backend logs for:
  - `auth.mfa.challenge_issued`
  - `auth.mfa.verification_success`

### Login with Backup Code
- [ ] Logout completely
- [ ] Login with email/password
- [ ] Enter one of your backup codes (8 characters)
- [ ] Verify successful login
- [ ] Check that backup code count decreased by 1
- [ ] Verify same backup code cannot be reused

### Failed 2FA Verification
- [ ] Logout and login with email/password
- [ ] Enter invalid TOTP code (e.g., "000000")
- [ ] Verify error message
- [ ] Try 3+ times to trigger rate limiting
- [ ] Check backend logs for `auth.mfa.verification_failed`

### Disable 2FA
- [ ] Login with 2FA
- [ ] Navigate to 2FA settings
- [ ] Click "Disable Two-Factor Authentication"
- [ ] Confirm the action
- [ ] Verify all sessions logged out
- [ ] Verify status shows "2FA Disabled"
- [ ] Check backend logs for `auth.mfa.disabled`
- [ ] Login again without MFA challenge

## 4. Rate Limiting

### Global Rate Limit (Development: 500/min)
- [ ] Make 500+ requests rapidly to any endpoint
- [ ] Verify 429 Too Many Requests response
- [ ] Wait 1 minute
- [ ] Verify requests work again

### Auth Rate Limit (Development: 20/5min)
- [ ] Make 20+ login attempts rapidly
- [ ] Verify 429 response with "Too many authentication attempts"
- [ ] Verify `retryAfter` included in response
- [ ] Wait 5 minutes
- [ ] Verify login works again

## 5. Email Verification (Development Mode)

### Request Verification
- [ ] Login to account
- [ ] Request email verification
- [ ] Check backend console logs for email output
- [ ] Copy verification token from console
- [ ] Construct URL: `http://localhost:5173/verify-email?token=<token>`
- [ ] Visit URL (or make API call)
- [ ] Verify success message
- [ ] Check backend logs for `auth.email.verified`

## 6. Password Reset (Development Mode)

### Request Reset
- [ ] Click "Forgot Password" (if available)
- [ ] Enter email address
- [ ] Verify success message (no user enumeration)
- [ ] Check backend console logs for reset email
- [ ] Copy reset token from console

### Complete Reset
- [ ] Construct reset URL with token
- [ ] Enter new password (must meet requirements in production)
- [ ] Verify success message
- [ ] Verify all sessions logged out
- [ ] Check backend logs for `auth.password.reset`
- [ ] Login with new password

## 7. Security Headers

### Helmet Headers (Production Only)
- [ ] Set `NODE_ENV=production`
- [ ] Restart backend
- [ ] Make any request
- [ ] Check response headers in DevTools:
  - [ ] `Content-Security-Policy` present
  - [ ] `Strict-Transport-Security` present
  - [ ] `X-Frame-Options: DENY`
  - [ ] `X-Content-Type-Options: nosniff`
  - [ ] `Referrer-Policy` present

### Development Mode
- [ ] Set `NODE_ENV=development`
- [ ] Restart backend
- [ ] Verify CSP header NOT present (allows HMR)

## 8. Input Validation

### Strong Password (Production)
- [ ] Set `NODE_ENV=production`
- [ ] Try to reset password with weak password: "password"
- [ ] Verify validation error
- [ ] Try with: "Pass123!"
- [ ] Verify success

### Email Format
- [ ] Try login with invalid email: "notanemail"
- [ ] Verify validation error
- [ ] Try with valid email format

### TOTP Code Format
- [ ] Try MFA verification with non-numeric code: "ABCDEF"
- [ ] Verify validation error
- [ ] Try with letters and numbers: "ABC123"
- [ ] Verify validation error
- [ ] Try with 6 digits: "123456"
- [ ] Verify accepted (may fail verification but format valid)

## 9. Observability

### Health Endpoints
- [ ] `GET http://localhost:8787/api/healthz`
  - [ ] Verify 200 response
  - [ ] Verify `{ status: "ok" }`

- [ ] `GET http://localhost:8787/api/readyz`
  - [ ] Verify 200 response when DB connected
  - [ ] Stop Neo4j
  - [ ] Verify 503 response with `status: "not_ready"`
  - [ ] Restart Neo4j

- [ ] `GET http://localhost:8787/api/health`
  - [ ] Verify comprehensive health info
  - [ ] Check memory usage
  - [ ] Check database status
  - [ ] Check observability status

### Request Correlation
- [ ] Make request with custom header: `X-Request-ID: test-123`
- [ ] Verify response has same `X-Request-ID: test-123` header
- [ ] Check backend logs for `test-123`
- [ ] Make request without header
- [ ] Verify auto-generated UUID in response

### Structured Logging
- [ ] Perform various auth actions (login, logout, MFA, etc.)
- [ ] Check backend logs for JSON structured logs
- [ ] Verify all events have:
  - [ ] `event` field (e.g., "auth.login.success")
  - [ ] `userId` field (when applicable)
  - [ ] `email` field
  - [ ] `ip` field
  - [ ] Timestamp

## 10. CORS

### Development
- [ ] Set `CORS_ORIGINS=` (empty)
- [ ] Restart backend
- [ ] Make request from frontend
- [ ] Verify success (allow all origins)

### Production
- [ ] Set `CORS_ORIGINS=http://localhost:5173`
- [ ] Set `NODE_ENV=production`
- [ ] Restart backend
- [ ] Make request from http://localhost:5173
- [ ] Verify success
- [ ] Try from different origin (if possible)
- [ ] Verify CORS error

## 11. Cookie Security

### Development
- [ ] Login
- [ ] Check cookie in DevTools
- [ ] Verify `Secure` flag NOT set (HTTP allowed)
- [ ] Verify `HttpOnly` flag set
- [ ] Verify `SameSite=Lax`
- [ ] Verify cookie name has `dev_` prefix

### Production
- [ ] Set `NODE_ENV=production`
- [ ] Login (requires HTTPS in production)
- [ ] Verify `Secure` flag set
- [ ] Verify `HttpOnly` flag set
- [ ] Verify no `dev_` prefix

## 12. Legacy Password Migration

### Create Legacy User (for testing)
- [ ] Manually edit `dev-users.json`
- [ ] Add user with old password field (SHA256 or scrypt)
- [ ] Login with that user
- [ ] Verify successful login
- [ ] Check `dev-users.json` again
- [ ] Verify password upgraded to Argon2id (`passwordHash` field, no `passwordSalt`)

## 13. Edge Cases

### Concurrent Logins
- [ ] Login from Browser 1
- [ ] Login from Browser 2 (same user)
- [ ] Verify both sessions work
- [ ] Logout from Browser 1
- [ ] Verify Browser 2 session still works

### Session Revocation
- [ ] Login and note refresh token
- [ ] Admin revokes all user tokens (via code/script)
- [ ] Try to refresh token
- [ ] Verify rejection

### MFA with Multiple Devices
- [ ] Enable 2FA
- [ ] Scan QR code with Device 1 (phone)
- [ ] Also scan with Device 2 (tablet)
- [ ] Login and use code from Device 1
- [ ] Verify success
- [ ] Logout and login again
- [ ] Use code from Device 2
- [ ] Verify success (same secret)

## Issues to Report

If any test fails, report with:
- [ ] Step that failed
- [ ] Expected behavior
- [ ] Actual behavior
- [ ] Browser console errors
- [ ] Backend logs
- [ ] Environment (dev/prod)
- [ ] Screenshots if helpful

## Performance Tests

### Large-Scale Testing
- [ ] Create 100+ users with 2FA enabled
- [ ] Simulate 50 concurrent logins
- [ ] Monitor response times
- [ ] Check for memory leaks
- [ ] Verify rate limiting still effective

## Security Review Checklist

- [ ] All secrets in environment variables (not hardcoded)
- [ ] HTTPS enforced in production
- [ ] No sensitive data in logs
- [ ] No password fields in API responses
- [ ] CORS properly configured
- [ ] Rate limiting active
- [ ] Headers properly set
- [ ] Tokens properly invalidated on logout
- [ ] MFA secrets encrypted
- [ ] Backup codes hashed

## Clean Up After Testing

- [ ] Delete test users
- [ ] Clear any test tokens
- [ ] Reset rate limit counters (restart server)
- [ ] Remove any debugging modifications
- [ ] Restore production environment variables

---

**Note**: Some tests require specific environment configurations. Make sure to document any failures and edge cases discovered during testing.
