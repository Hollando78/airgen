# Security Foundation

This document describes the security features implemented in AIRGen.

## Overview

AIRGen implements a production-grade security foundation with the following features:

- **Strong Authentication**: Argon2id password hashing with legacy migration
- **Session Management**: JWT access tokens (15 min) + httpOnly refresh tokens (7 days)
- **Two-Factor Authentication**: TOTP with backup codes
- **Email Verification**: Token-based email verification flow
- **Password Reset**: Secure token-based password reset
- **Security Middleware**: Helmet, rate limiting, CORS, input validation
- **Observability**: Structured logging, health checks, request correlation
- **Environment Separation**: Development, staging, production configurations

## Authentication & Sessions

### Password Security

**Argon2id Hashing**:
- Algorithm: Argon2id (memory-hard, side-channel resistant)
- Memory cost: 64 MiB
- Time cost: 3 iterations
- Parallelism: 1

**Legacy Migration**:
- Automatically upgrades SHA256 and scrypt hashes to Argon2id on login
- Maintains backward compatibility during migration

### Session Management

**Access Tokens (JWT)**:
- Short-lived: 15 minutes
- Stored in memory (frontend)
- Sent via `Authorization: Bearer <token>` header
- Cannot be revoked (rely on short expiry)

**Refresh Tokens**:
- Long-lived: 7 days
- Stored in httpOnly cookies (secure in production)
- One-time use with automatic rotation
- Can be revoked (logout, security events)
- Token reuse detection for security

**Token Cleanup**:
- Automatic cleanup of expired tokens every 5 minutes
- Manual revocation on logout, password reset, 2FA disable

### Rate Limiting

**Global Rate Limits**:
- Production: 100 requests/minute per IP
- Development: 500 requests/minute per IP

**Auth Endpoint Rate Limits**:
- Production: 5 attempts per 5 minutes per IP
- Development: 20 attempts per 5 minutes per IP

Applies to:
- `/api/auth/login`
- `/api/auth/refresh`
- `/api/auth/mfa-verify`
- All MFA setup/verification endpoints

## Two-Factor Authentication (2FA)

### TOTP (Time-based One-Time Password)

**Configuration**:
- Algorithm: SHA-1 (standard for TOTP)
- Digits: 6
- Time step: 30 seconds
- Window: ±1 step (90 second tolerance)

**Secret Storage**:
- Encryption: AES-256-GCM
- Unique IV per secret
- Authentication tags for integrity
- Key derived from `TWOFA_ENCRYPTION_KEY` environment variable

**Compatible Apps**:
- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Any RFC 6238 compliant TOTP app

### Backup Codes

**Format**:
- 8 characters alphanumeric (uppercase)
- 10 codes generated per setup
- One-time use

**Storage**:
- Hashed with SHA-256
- Removed from database after use
- Regenerate by disabling and re-enabling 2FA

### Login Flow with 2FA

1. User enters email/password → `POST /api/auth/login`
2. If MFA enabled: Returns `{ status: "MFA_REQUIRED", tempToken: "..." }`
3. User enters TOTP or backup code → `POST /api/auth/mfa-verify`
4. On success: Returns full JWT access token + refresh token
5. Backup codes consumed after one use

## Email Verification

**Token Generation**:
- Cryptographically secure: 32 bytes random
- Hashed with SHA-256 before storage
- Expiry: 60 minutes

**Flow**:
1. User requests verification → `POST /api/auth/request-verification`
2. Email sent with verification link
3. User clicks link → `POST /api/auth/verify-email` with token
4. Email marked as verified

**Email Service**:
- Production: SMTP (nodemailer)
- Development: Console logging (no actual emails sent)

## Password Reset

**Token Generation**:
- Cryptographically secure: 32 bytes random
- Hashed with SHA-256 before storage
- Expiry: 30 minutes (shorter than email verification)

**Flow**:
1. User requests reset → `POST /api/auth/request-password-reset`
2. Email sent with reset link
3. User clicks link → `POST /api/auth/reset-password` with token + new password
4. Password updated, all sessions revoked, confirmation email sent

**Security Features**:
- Email enumeration protection (always returns success)
- All active sessions revoked on password reset
- Password validation (8+ chars, mixed case, numbers, special chars in production)

## Security Headers

**Helmet Configuration** (production only):

```javascript
Content-Security-Policy:
  default-src 'self'
  style-src 'self' 'unsafe-inline'
  script-src 'self'
  img-src 'self' data: https:
  connect-src 'self'
  font-src 'self'
  object-src 'none'
  media-src 'self'
  frame-src 'none'

Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

**Why CSP is disabled in development**:
- Avoids interference with Vite's Hot Module Replacement (HMR)
- Prevents CORS errors during local development

## Input Validation

**Zod Schemas**:
- Strong password validation in production
- Relaxed validation in development for testing
- Email format validation and normalization
- TOTP code: 6 digits
- Backup code: 8 alphanumeric characters

**Password Requirements (Production)**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## CORS Configuration

**Production**:
- Allowlist only configured origins
- Set via `CORS_ORIGINS` environment variable (comma-separated)

**Development**:
- Allow all origins for easier testing
- Credentials enabled for cookie support

## Observability

### Health Endpoints

**Liveness Probe** (`GET /api/healthz`):
- Simple check that server is running
- Returns `{ status: "ok" }`
- Use for Kubernetes liveness probes

**Readiness Probe** (`GET /api/readyz`):
- Checks database connectivity
- Returns 200 if ready, 503 if not ready
- Use for Kubernetes readiness probes

**Comprehensive Health** (`GET /api/health`):
- System uptime, memory usage
- Service status (database, cache, LLM)
- Observability status (metrics, error tracking)
- Use for monitoring dashboards

### Structured Logging

**Auth Events**:
- `auth.login.success` - Successful login
- `auth.login.failed` - Failed login attempt
- `auth.logout` - User logout
- `auth.mfa.challenge_issued` - MFA challenge sent
- `auth.mfa.verification_success` - MFA verified
- `auth.mfa.verification_failed` - MFA failed
- `auth.mfa.enabled` - 2FA enabled
- `auth.mfa.disabled` - 2FA disabled
- `auth.email.verified` - Email verified
- `auth.password.reset` - Password reset

**Log Format** (JSON):
```json
{
  "level": "info",
  "time": 1234567890,
  "event": "auth.login.success",
  "userId": "user-uuid",
  "email": "user@example.com",
  "ip": "192.168.1.1",
  "msg": "User logged in successfully"
}
```

### Request Correlation

**Request ID**:
- Unique UUID v4 for each request
- Returned in `X-Request-ID` header
- Automatically included in all logs
- Supports client-provided IDs for distributed tracing

**Usage**:
```bash
# Make request
curl -H "X-Request-ID: my-trace-id" https://api.airgen.studio/api/health

# Find all logs for this request
grep "my-trace-id" logs/app.log
```

## Environment Configuration

### Required in Production

```bash
# Security
API_JWT_SECRET=<generate with: openssl rand -base64 32>
TWOFA_ENCRYPTION_KEY=<generate with: openssl rand -base64 32>

# CORS
CORS_ORIGINS=https://app.example.com,https://www.example.com

# URLs
APP_URL=https://app.example.com
API_URL=https://api.example.com
```

### Optional

```bash
# Email (SMTP)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<your-sendgrid-api-key>
SMTP_FROM=noreply@example.com

# Rate Limiting
RATE_LIMIT_GLOBAL_MAX=100
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW=300000

# 2FA
TWOFA_ISSUER=AIRGen
```

## Security Best Practices

### For Deployment

1. **Environment Variables**:
   - Use strong, unique secrets for production
   - Never commit `.env` files to version control
   - Rotate secrets periodically

2. **HTTPS**:
   - Always use HTTPS in production
   - Enable HSTS headers (automatic)
   - Use valid SSL certificates

3. **Database**:
   - Secure Neo4j with authentication
   - Use encrypted connections
   - Regular backups

4. **Monitoring**:
   - Monitor failed login attempts
   - Alert on unusual patterns
   - Track MFA verification failures

5. **Updates**:
   - Keep dependencies updated
   - Apply security patches promptly
   - Review Dependabot alerts

### For Users

1. **Password Security**:
   - Use strong, unique passwords
   - Enable 2FA for all accounts
   - Save backup codes securely

2. **Session Security**:
   - Logout when done
   - Use "Logout All" if suspicious activity
   - Report any unauthorized access

3. **2FA Best Practices**:
   - Use a reputable authenticator app
   - Store backup codes offline
   - Don't share codes or screenshots

## Security Incident Response

### Failed Login Detection

Monitor logs for:
```json
{ "event": "auth.login.failed", "email": "...", "reason": "invalid_password" }
```

Action: Alert after 5+ failed attempts in 5 minutes

### MFA Bypass Attempts

Monitor logs for:
```json
{ "event": "auth.mfa.verification_failed", "userId": "..." }
```

Action: Alert after 3+ failed attempts in 5 minutes

### Unusual Activity

Monitor for:
- Logins from new IPs/locations
- Multiple account access from same IP
- Rapid MFA setup/disable cycles

## Compliance

### GDPR

- User data minimization (only essential fields)
- Right to erasure (delete user account)
- Audit logging for compliance
- Secure password storage

### SOC 2

- Access controls (authentication, authorization)
- Audit trails (structured logging)
- Encryption at rest and in transit
- Security monitoring and alerting

## Known Limitations

1. **In-Memory Token Storage**:
   - Refresh tokens stored in memory (not persistent)
   - Tokens lost on server restart (users must re-login)
   - **Production**: Use Redis or database for persistent storage

2. **Email Service**:
   - Console logging in development
   - **Production**: Configure SMTP for real emails

3. **Rate Limiting**:
   - Per-IP rate limiting (not per-user)
   - Can be bypassed with IP rotation
   - **Production**: Consider per-user rate limiting with Redis

4. **CSRF Protection**:
   - Not implemented (JWT in Authorization header)
   - Refresh token endpoint relies on rate limiting
   - Safe for API-only architecture

## Future Enhancements

- [ ] Persistent token storage (Redis/database)
- [ ] WebAuthn/Passkey support
- [ ] Device fingerprinting
- [ ] Suspicious activity detection
- [ ] IP allowlisting per user
- [ ] Session management UI
- [ ] Security notifications
- [ ] Advanced audit logging

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [RFC 6238 - TOTP](https://tools.ietf.org/html/rfc6238)
- [Argon2 RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
