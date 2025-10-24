# AIRGen Documentation Index

**Last Updated:** 2025-10-24

This directory contains all active documentation for the AIRGen requirements management platform. Archived historical documents are in the `archive/` subdirectory.

---

## 📋 Quick Links

- **New to AIRGen?** Start with [ARCHITECTURE.md](#core-architecture)
- **System Requirements:** See [SYSTEM_REQUIREMENTS.md](#core-architecture)
- **Security Info:** Check [SECURITY.md](#security--compliance)
- **Deployment:** Read [NETWORK_ARCHITECTURE.md](#core-architecture)

---

## Core Architecture

Fundamental system design and architecture documentation.

| Document | Description | Status |
|----------|-------------|--------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | High-level system architecture, components, and data flow | ✅ Current |
| [NETWORK_ARCHITECTURE.md](./NETWORK_ARCHITECTURE.md) | Network diagram, protocols, ports, and infrastructure | ✅ Current (2025-10-24) |
| [SYSTEM_REQUIREMENTS.md](./SYSTEM_REQUIREMENTS.md) | Complete SRS with 292 requirements derived from design | ✅ Current (2025-10-24) |

---

## Database & Data Models

Database schemas and data persistence documentation.

| Document | Description | Status |
|----------|-------------|--------|
| [backend/docs/NEO4J_SCHEMA.md](../backend/docs/NEO4J_SCHEMA.md) | Neo4j graph schema, node types, relationships, indexes | ✅ Current |
| [VERSION-HISTORY-SYSTEM.md](./VERSION-HISTORY-SYSTEM.md) | Version history architecture and audit trail system | ✅ Production Ready |
| [BASELINE-SYSTEM-GUIDE.md](./BASELINE-SYSTEM-GUIDE.md) | Baseline snapshots and comparison system | ✅ Production Ready |

---

## System Guides

Operational guides for key system features.

| Document | Description | Status |
|----------|-------------|--------|
| [BACKUP_RESTORE.md](./BACKUP_RESTORE.md) | Backup and restore procedures | ✅ Current |
| [REMOTE_BACKUP_SETUP.md](./REMOTE_BACKUP_SETUP.md) | Remote backup configuration (S3, Backblaze, etc.) | ✅ Current |
| [EXPORT-SYSTEM-DESIGN.md](./EXPORT-SYSTEM-DESIGN.md) | On-demand markdown export system | ✅ Current |

---

## AI & Generation

AI capabilities, prompt engineering, and generation features.

| Document | Description | Status |
|----------|-------------|--------|
| [AI_CAPABILITIES_AND_EXTENSIONS.md](./AI_CAPABILITIES_AND_EXTENSIONS.md) | Comprehensive analysis of AI features | ✅ Current |
| [AI_DATA_SECURITY_COMPLIANCE.md](./AI_DATA_SECURITY_COMPLIANCE.md) | AI compliance (ITAR, HIPAA, classified envs) | ✅ Current (2025-10-23) |
| [AI_DIAGRAM_QUICK_START.md](./AI_DIAGRAM_QUICK_START.md) | Quick start guide for AI diagram generation | ✅ Current |

---

## Security & Compliance

Security architecture, audits, and compliance documentation.

| Document | Description | Status |
|----------|-------------|--------|
| [SECURITY.md](./SECURITY.md) | Security architecture and best practices | ✅ Current |
| [SECURITY_AUDIT_2025-10-12.md](./SECURITY_AUDIT_2025-10-12.md) | Security audit report | ✅ Recent (2025-10-12) |
| [SECURITY-TEST-CHECKLIST.md](./SECURITY-TEST-CHECKLIST.md) | Security testing checklist | ✅ Current |
| [BRUTE_FORCE_PROTECTION_ANALYSIS.md](./BRUTE_FORCE_PROTECTION_ANALYSIS.md) | Brute force protection analysis | ✅ Current |

---

## Testing

Testing strategy and test documentation.

| Document | Description | Status |
|----------|-------------|--------|
| [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) | Overall testing strategy | ✅ Current |
| [TESTING-SUMMARY.md](./TESTING-SUMMARY.md) | Testing summary and coverage | ✅ Current |
| [BACKUP-RESTORE-TEST-RESULTS.md](./BACKUP-RESTORE-TEST-RESULTS.md) | Backup/restore test results | ✅ Current |

---

## Business & Planning

Market analysis, project plans, and business documentation.

| Document | Description | Status |
|----------|-------------|--------|
| [MARKET_ANALYSIS.md](./MARKET_ANALYSIS.md) | Market analysis and competitive landscape | ✅ Recent (2025-10-23) |
| [SAAS_MVP_PROJECT_PLAN.md](./SAAS_MVP_PROJECT_PLAN.md) | SaaS MVP project plan | ✅ Recent (2025-10-23) |
| [RAISE-2026-submission-draft.md](./RAISE-2026-submission-draft.md) | RAISE 2026 grant submission | ✅ Current |

---

## Implementation Plans

Active implementation plans for future features and improvements.

| Document | Description | Status |
|----------|-------------|--------|
| [FUNCTIONS_IMPLEMENTATION_PLAN.md](./FUNCTIONS_IMPLEMENTATION_PLAN.md) | SysML-lite functional modeling implementation | 📋 Planning |
| [UI_OVERHAUL_IMPLEMENTATION_PLAN.md](./UI_OVERHAUL_IMPLEMENTATION_PLAN.md) | UI standardization and design token system | 📋 Planning |
| [AI_DIAGRAM_IMPROVEMENTS_PLAN.md](./AI_DIAGRAM_IMPROVEMENTS_PLAN.md) | AI diagram generation improvements | 📋 Planning |
| [GRAPH_VIEWER_HIERARCHY_IMPROVEMENTS.md](./GRAPH_VIEWER_HIERARCHY_IMPROVEMENTS.md) | Graph viewer hierarchy enhancements | 📋 Planning |
| [INTERFACE_V2_PLAN.md](./INTERFACE_V2_PLAN.md) | Interface Studio v2 improvements | 📋 Planning |
| [snapdraft-e2e-improvement-plan.md](./snapdraft-e2e-improvement-plan.md) | SnapDraft end-to-end improvements | 📋 Planning |

---

## Codebase Analysis

| Document | Description | Status |
|----------|-------------|--------|
| [CODEBASE_REVIEW_2025.md](./CODEBASE_REVIEW_2025.md) | Comprehensive codebase review | ✅ Current (Jan 2025) |

---

## Archived Documentation

Historical and completed project documentation is in the [archive/](./archive/) directory:

- **archive/migrations/** - Completed Neo4j migration documentation
- **archive/completed-plans/** - Finished implementation plans and enhancements
- **archive/legacy/** - Legacy and deprecated documentation

See [archive/README.md](./archive/README.md) for details.

---

## Document Status Legend

| Status | Meaning |
|--------|---------|
| ✅ Current | Active, accurate, and up-to-date |
| ✅ Recent | Recently updated (within last 2 weeks) |
| ✅ Production Ready | Implemented and operational |
| 📋 Planning | Active planning document for future work |
| 🗄️ Archived | Moved to archive directory |

---

## Contributing to Documentation

When creating or updating documentation:

1. **Add a status header** to all documents:
   ```markdown
   **Status:** [Draft|Active|Production Ready|Planning|Archived]
   **Last Updated:** YYYY-MM-DD
   **Maintained By:** [Role/Team]
   ```

2. **Update this index** when adding new documents

3. **Archive completed work** - Move completed implementation plans and historical docs to `archive/`

4. **Follow naming conventions:**
   - Use UPPERCASE for major docs (ARCHITECTURE.md)
   - Use kebab-case for specific features (backup-restore-test.md)
   - Prefix planning docs with purpose (FUNCTIONS_IMPLEMENTATION_PLAN.md)

---

## Questions or Issues?

- For documentation issues, create a GitHub issue
- For urgent documentation updates, contact the platform team
- For security documentation, follow secure disclosure procedures in SECURITY.md
