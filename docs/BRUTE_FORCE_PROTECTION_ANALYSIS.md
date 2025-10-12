# Brute Force Protection Analysis - AIRGen Login

**Date:** October 12, 2025
**Status:** Protected with gaps in active monitoring

---

## Executive Summary

AIRGen's login system has **robust rate limiting and logging** to prevent brute force attacks, but lacks **active monitoring and alerting**. An attacker would be rate-limited to 5 attempts per 5 minutes per IP, with all attempts logged, but no automated alerts would trigger unless logs are actively monitored.

---

## ✅ Active Protections

### 1. Rate Limiting
**Location:** `backend/src/routes/auth.ts:54-62`

```typescript
const authRateLimitConfig = {
  max: config.rateLimit.auth.max,           // 5 in production, 20 in dev
  timeWindow: config.rateLimit.auth.timeWindow,  // 5 minutes (300000ms)
  errorResponseBuilder: () => ({
    error: "Too many authentication attempts. Please try again later.",
    statusCode: 429,
    retryAfter: Math.ceil(config.rateLimit.auth.timeWindow / 1000)
  })
};
```

**Applied to:**
- `/auth/login` (password authentication)
- `/auth/register` (account creation)
- `/auth/refresh` (token refresh)
- `/auth/mfa-verify` (2FA verification)
- `/auth/request-password-reset` (password reset requests)
- `/auth/reset-password` (password reset confirmation)

**Configuration:** `backend/src/config.ts:130-133`
- **Production:** 5 attempts per 5 minutes
- **Development:** 20 attempts per 5 minutes
- **Scope:** Per IP address

### 2. Comprehensive Logging

#### Failed Login Attempts
**Location:** `backend/src/routes/auth.ts:146-151`

```typescript
app.log.warn({
  event: "auth.login.failed",
  email,
  reason: "invalid_password",
  ip: req.ip
}, "Failed login attempt");
```

#### Successful Login
**Location:** `backend/src/routes/auth.ts:210-216`

```typescript
app.log.info({
  event: "auth.login.success",
  userId: user.id,
  email: user.email,
  mfaEnabled: false,
  ip: req.ip
}, "User logged in successfully");
```

#### Failed MFA Verification
**Location:** `backend/src/routes/auth.ts:622-627`

```typescript
app.log.warn({
  event: "auth.mfa.verification_failed",
  userId: user.id,
  email: user.email,
  ip: req.ip
}, "Failed MFA verification attempt");
```

#### All Logged Events
- `auth.login.failed` - Invalid credentials
- `auth.login.success` - Successful authentication
- `auth.mfa.challenge_issued` - 2FA code requested
- `auth.mfa.verification_failed` - Invalid 2FA code
- `auth.mfa.verification_success` - 2FA verified
- `auth.logout` - User logout
- `auth.register.success` - New user registration
- `auth.register.tenant_created` - Personal tenant created
- `auth.email.verified` - Email verification completed
- `auth.password.reset` - Password reset completed

### 3. Multi-Factor Authentication (MFA)
**Location:** `backend/src/routes/auth.ts:159-183`

- TOTP (Time-based One-Time Password) support
- Backup codes (hashed, one-time use)
- Separate temporary token for MFA flow (5-minute expiry)
- MFA verification also rate-limited

### 4. Additional Security Measures
- **Generic error messages** - No user enumeration (same error for invalid email or password)
- **Timing-safe comparisons** - Prevents timing attacks on password verification
- **Argon2id password hashing** - OWASP-compliant parameters (64 MiB, 3 iterations)
- **Account lockout via rate limiting** - Automatic 5-minute cooldown after 5 attempts
- **Secure password reset** - Token-based with 30-minute expiry
- **Refresh token rotation** - One-time use tokens with reuse detection

---

## ⚠️ Gaps in Protection

### 1. No Active Monitoring/Alerting
**Severity:** Medium
**Impact:** Attacks are prevented but not detected in real-time

**Current State:**
- Failed attempts are logged but not monitored
- No alerts for suspicious patterns
- Manual log review required to detect attack attempts

**Risk:**
- Distributed brute force attacks across multiple IPs
- Credential stuffing campaigns
- Account enumeration attempts
- No visibility into attack patterns

### 2. IP-Based Rate Limiting Only
**Severity:** Medium
**Impact:** Can be bypassed with distributed attacks

**Current Limitation:**
- Rate limit is per IP address only
- No per-user rate limiting
- Attacker can use multiple IPs to bypass limits
- Botnets can distribute attempts across many IPs

**Example Attack Scenario:**
```
IP 1: 5 attempts against user@example.com
IP 2: 5 attempts against user@example.com
IP 3: 5 attempts against user@example.com
...
= 50+ attempts bypassing per-IP limit
```

### 3. No Anomaly Detection
**Severity:** Low-Medium
**Impact:** Sophisticated attacks may go unnoticed

**Missing Capabilities:**
- Geographic anomaly detection (login from unusual location)
- Time-based anomaly detection (login at unusual hours)
- Device fingerprinting (new device detection)
- Velocity checks (rapid attempts from different IPs)
- Credential stuffing pattern detection

### 4. No User-Facing Security Notifications
**Severity:** Low
**Impact:** Users unaware of attacks on their accounts

**Missing Features:**
- No email alerts for failed login attempts
- No notification of new device logins
- No security dashboard showing login history
- No option to view active sessions

---

## 📊 Current Effectiveness

### Against Common Attacks

| Attack Type | Protection Level | Notes |
|-------------|-----------------|-------|
| **Single-IP Brute Force** | 🟢 Excellent | Limited to 5 attempts/5min |
| **Distributed Brute Force** | 🟡 Moderate | Can be bypassed with many IPs |
| **Credential Stuffing** | 🟡 Moderate | Rate limited but no pattern detection |
| **Account Enumeration** | 🟢 Good | Generic error messages prevent enumeration |
| **Password Spraying** | 🟡 Moderate | Per-IP limits help but not perfect |
| **MFA Bypass** | 🟢 Good | Separate rate limiting + logging |
| **Token Reuse** | 🟢 Excellent | Automatic detection and revocation |

### Real-World Scenario

**Attacker with single IP:**
- Attempt 1-5: Allowed (rate limit not exceeded)
- Attempt 6+: Blocked for 5 minutes (HTTP 429)
- Result: ✅ **Attack prevented**

**Attacker with 10 IPs:**
- Each IP attempts 5 times = 50 total attempts
- All attempts logged but allowed
- Result: ⚠️ **Attack partially successful** (though still logged)

**Sophisticated attacker:**
- Uses botnet with 1000 IPs
- Rotates through accounts (password spraying)
- Stays under rate limits per IP and per account
- Result: ⚠️ **Attack difficult to detect** without monitoring

---

## 🔧 Recommended Improvements

### Priority 1: Immediate (This Sprint)

#### 1.1 Add Per-User Rate Limiting
**Location:** `backend/src/routes/auth.ts`

Add user-level tracking across all IPs:

```typescript
// Track failed attempts per user (in addition to per-IP)
const userLoginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkUserRateLimit(email: string): boolean {
  const now = Date.now();
  const attempts = userLoginAttempts.get(email);

  if (!attempts || now > attempts.resetAt) {
    userLoginAttempts.set(email, { count: 1, resetAt: now + 300000 });
    return true;
  }

  if (attempts.count >= 5) {
    return false; // User exceeded rate limit across all IPs
  }

  attempts.count++;
  return true;
}
```

#### 1.2 Add Basic Alerting to Existing Logs
**Implementation:** Configure log monitoring in production

Use existing structured logs with log aggregation tools:
- Set up CloudWatch/Datadog/ELK for log ingestion
- Create alerts for events:
  - `auth.login.failed` count > 10 in 5 minutes (same email)
  - `auth.login.failed` count > 50 in 5 minutes (any email)
  - `auth.mfa.verification_failed` count > 3 in 5 minutes

**Example Alert Rule (CloudWatch Insights):**
```
fields @timestamp, email, ip
| filter event = "auth.login.failed"
| stats count() by email
| filter count > 10
```

### Priority 2: Short-Term (Next Quarter)

#### 2.1 Implement Redis-Based Rate Limiting
**Benefit:** Share rate limits across multiple server instances

Replace in-memory rate limiting with Redis:

```typescript
import { Redis } from 'ioredis';

async function checkRedisRateLimit(key: string, max: number, window: number): Promise<boolean> {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, window);
  }
  return current <= max;
}

// Usage
const ipKey = `ratelimit:auth:ip:${req.ip}`;
const userKey = `ratelimit:auth:user:${email}`;

if (!await checkRedisRateLimit(ipKey, 5, 300)) {
  return reply.code(429).send({ error: "Too many attempts from this IP" });
}

if (!await checkRedisRateLimit(userKey, 5, 300)) {
  return reply.code(429).send({ error: "Too many attempts for this account" });
}
```

#### 2.2 Add Security Dashboard
**Location:** New route `backend/src/routes/security.ts`

Endpoint for users to view:
- Recent login attempts (successful and failed)
- Active sessions with device info
- Geographic login history
- Option to revoke sessions

```typescript
app.get("/auth/security/history", {
  preHandler: [app.authenticate]
}, async (req, reply) => {
  const loginHistory = await getLoginHistory(req.currentUser.sub);
  return { history: loginHistory };
});
```

#### 2.3 Email Notifications for Security Events
**Location:** `backend/src/lib/email.ts`

Send email alerts for:
- Failed login attempts (after 3 failures)
- Successful login from new device/location
- Password changed
- MFA settings changed

```typescript
export async function sendSecurityAlert(
  email: string,
  name: string,
  eventType: 'failed_login' | 'new_device' | 'password_changed',
  metadata: Record<string, unknown>
): Promise<void> {
  // Implementation
}
```

### Priority 3: Long-Term (Ongoing)

#### 3.1 Advanced Anomaly Detection
- **Geographic analysis** - Flag logins from unusual countries/regions
- **Time-based analysis** - Flag logins at unusual hours for user
- **Velocity checks** - Flag rapid successive logins from different locations
- **Device fingerprinting** - Track and recognize known devices

#### 3.2 Machine Learning Integration
- **Behavioral analysis** - Learn normal login patterns per user
- **Credential stuffing detection** - Identify patterns of stolen credentials
- **Bot detection** - Identify automated attack tools

#### 3.3 Integration with Threat Intelligence
- **IP reputation** - Block known malicious IPs
- **Breach monitoring** - Check if user credentials appear in known breaches
- **CAPTCHA** - Add CAPTCHA after repeated failures

---

## 📈 Monitoring Recommendations

### Key Metrics to Track

#### Authentication Metrics
- `auth_login_attempts_total{status="success|failure"}`
- `auth_login_duration_seconds`
- `auth_mfa_verifications_total{status="success|failure"}`
- `auth_rate_limit_hits_total{endpoint="login|register|mfa"}`

#### Security Metrics
- `auth_failed_logins_by_email` (counter per email)
- `auth_failed_logins_by_ip` (counter per IP)
- `auth_suspicious_patterns_detected` (anomaly detection)
- `auth_account_lockouts_total`

### Alerting Thresholds (Recommended)

| Alert | Threshold | Action |
|-------|-----------|--------|
| **Failed logins (same email)** | > 10 in 5 min | Investigate + notify user |
| **Failed logins (same IP)** | > 50 in 5 min | Consider IP block |
| **Failed MFA verifications** | > 5 in 5 min | Investigate account |
| **Token reuse detected** | Any occurrence | Immediate investigation |
| **Geographic anomaly** | Login from new country | Notify user |
| **Rate limit violations** | > 100 in 1 hour | Check for DDoS |

### Dashboard Widgets

**Recommended Grafana Dashboard:**
1. **Login Success Rate** (last 24 hours)
2. **Failed Login Attempts** (by email, top 10)
3. **Failed Login Attempts** (by IP, top 10)
4. **Rate Limit Violations** (by endpoint)
5. **MFA Verification Failures** (last 1 hour)
6. **Geographic Login Map** (if geo data available)
7. **Active Sessions** (current count)

---

## 🧪 Testing Recommendations

### Manual Testing

```bash
# Test rate limiting
for i in {1..10}; do
  curl -X POST http://localhost:8787/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}' \
    -i
done

# Expected: First 5 succeed (401), 6th onwards returns 429
```

### Automated Security Tests

**Location:** `backend/src/__tests__/security/brute-force.test.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { build } from '../helper';

describe('Brute Force Protection', () => {
  test('should block after 5 failed login attempts', async () => {
    const app = await build();

    // Make 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'test@example.com', password: 'wrong' }
      });
      expect(response.statusCode).toBe(401);
    }

    // 6th attempt should be rate limited
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: 'wrong' }
    });

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toContain('Too many authentication attempts');
  });

  test('should allow login after rate limit window expires', async () => {
    // Implementation using mock timers
  });

  test('should log all failed attempts', async () => {
    // Implementation using log capture
  });
});
```

---

## 📝 Related Documentation

- [Security Audit Report](./SECURITY_AUDIT_2025-10-12.md)
- [Security Test Checklist](./SECURITY-TEST-CHECKLIST.md)
- [Security Overview](./SECURITY.md)
- [Architecture Documentation](./ARCHITECTURE.md)

---

## 📧 Action Items

### Immediate (Week 1)
- [ ] Configure log monitoring/alerting in production environment
- [ ] Test rate limiting effectiveness with security team
- [ ] Document incident response procedure for brute force attacks

### Short-Term (Month 1-2)
- [ ] Implement per-user rate limiting
- [ ] Add Redis-based rate limiting for horizontal scaling
- [ ] Create security dashboard for users
- [ ] Add email notifications for security events

### Long-Term (Quarter 1-2)
- [ ] Implement geographic anomaly detection
- [ ] Add device fingerprinting
- [ ] Integrate with threat intelligence feeds
- [ ] Consider CAPTCHA for high-risk scenarios

---

**Document Version:** 1.0
**Last Updated:** October 12, 2025
**Next Review:** January 12, 2026
**Owner:** Security Team
