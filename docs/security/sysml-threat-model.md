# SysML Services Threat Model

**Status:** Phase 0 draft  
**Owners:** Security guild, SysML feature team  
**Last Updated:** 2025-10-26

This document extends AIRgen’s security posture to cover the new SysML stack being introduced in `/api/:tenant/:project/sysml`. It should be reviewed alongside `SECURITY.md` and `SECURITY_AUDIT_2025-10-24.md`.

---

## 1. Scope & Assumptions

- SysML services run inside the existing Fastify monolith and use shared JWT authentication.
- Neo4j remains the source-of-truth for models; PostgreSQL stores user accounts, while S3-compatible storage holds diagram exports.
- Evaluation tenants operate in shared infrastructure, so strong tenant isolation is mandatory.
- AI assistance (Phase 4) is feature-flagged and out of scope for this initial threat model but noted where relevant.

---

## 2. Assets & Security Objectives

| Asset | Classification | Objective |
| --- | --- | --- |
| SysML element data (Neo4j) | Confidential | Ensure tenant isolation, protect intellectual property |
| Diagram layouts & annotations | Confidential | Prevent cross-tenant leakage, ensure integrity |
| Trace links (`SATISFIES`, `ALLOCATES_TO`) | Confidential | Maintain accurate compliance artifacts |
| SysML API | Sensitive | Prevent abuse, ensure availability |
| Activity logs & audit trail | Sensitive | Non-repudiation for model edits |
| Feature flags & telemetry | Internal | Prevent unauthorized AI feature toggling |

---

## 3. System Overview

Textual data-flow summary:

1. User (browser) → Fastify `/sysml` routes (JWT, HTTPS).
2. Fastify → Neo4j Bolt driver (TLS) for CRUD operations.
3. Fastify → Redis (session + rate limiting) for caching library results.
4. Fastify → Activity/event bus for audit logging.
5. (Future) Fastify → OpenAI / local LLM for AI-assisted modeling.

Trust boundaries:
- Browser ↔ API
- API ↔ Neo4j
- API ↔ External AI provider

---

## 4. Threat Enumeration (STRIDE)

### Spoofing

- Reusing `sysml-lite` routes might bypass new authorization checks.
- Lack of scoped API keys for automation clients.

**Mitigations**
- Enforce `modeling:*` scopes with `hasProjectPermission()` helper on every route.
- Require `X-Airgen-Request-Id` for non-browser clients with signed JWT.
- Add integration tests covering unauthorized access attempts.

### Tampering

- Direct Neo4j access via compromised credentials could alter models silently.
- Diagram layout payloads could be tampered with to inject script-like data.

**Mitigations**
- Continue using least-privilege Neo4j user; restrict to SysML procedures.
- Validate layout payloads with Zod (numeric ranges, allowed keys).
- Emit audit events for all modifying operations.

### Repudiation

- Missing audit trails for SysML-specific mutations.
- Activity feed may not capture relationship changes (HAS_PART, SATISFIES).

**Mitigations**
- Extend `activity.ts` to log `sysml.element.created`, `sysml.diagram.updated`, etc.
- Include `before`/`after` diffs in audit payload (truncated for size).
- Retain logs for ≥180 days in alignment with evaluation policy.

### Information Disclosure

- Multi-tenant queries could accidentally return elements across projects.
- Trace endpoints may reveal requirement metadata from other tenants.
- Export endpoints (future) could leak files if URLs are guessable.

**Mitigations**
- All Cypher queries include `tenant` and `projectKey` filters.
- Add unit tests to verify leakage checks on `GET /elements`, `/diagrams`.
- Generate signed, time-limited export URLs; disable direct file listing.
- Review logging to avoid writing model content to shared logs.

### Denial of Service

- Large diagram payloads (>5 MB) might exhaust memory.
- Bulk operations could run heavy Cypher without rate limits.
- Potential infinite loops in layout reconciliation jobs.

**Mitigations**
- Cap payload size at 1 MB per request; reject with 413.
- Introduce per-user write rate limits (`/sysml` namespace). **Status:** Implemented in Phase 0 scaffold (`config.rateLimit.sysml`).
- Implement job watchdog for reconciliation/batch processes.

### Elevation of Privilege

- Misconfigured feature flags could expose AI actions to all users.
- Porting services from `sysml-modeler` might include admin-only endpoints.

**Mitigations**
- Feature flags stored in existing config; check `role >= tenant_admin` before enabling.
- Security review of imported code; disable unused admin routes.
- Add Playwright scenario verifying non-admin cannot access advanced actions.

---

## 5. Residual Risks & TODOs

- **Graph snapshot lifecycle** – need policy on storing historical diagrams (GDPR retention).
- **LLM integrations** – separate threat model before enabling AI features (prompt injection, data exfiltration).
- **WebSocket transport** – decide whether live collaboration uses WS; if so, extend threat model.
- **Neo4j backup** – confirm new labels are included in backup/restore scripts.

---

## 6. Next Actions

1. Review with security team; capture sign-off in `SECURITY-TEST-CHECKLIST.md`.
2. Incorporate mitigations into implementation tasks (rate limiters, validation).
3. Schedule penetration test focusing on SysML routes after Phase 1 beta.
