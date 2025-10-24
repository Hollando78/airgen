# Documentation Archive

**Purpose:** This directory contains historical and completed documentation that is no longer actively used but preserved for reference.

**Last Updated:** 2025-10-24

---

## Archive Structure

```
archive/
├── migrations/         # Completed database migration documentation
├── completed-plans/    # Finished implementation plans and enhancements
└── legacy/            # Deprecated and legacy documentation
```

---

## Migrations

Completed database migration documentation from the Neo4j single-source migration project.

| Document | Date Completed | Description |
|----------|---------------|-------------|
| [NEO4J-MIGRATION-COMPLETE.md](./migrations/NEO4J-MIGRATION-COMPLETE.md) | 2025-10-10 | Migration completion summary |
| [NEO4J-MIGRATION-PHASE-1-COMPLETE.md](./migrations/NEO4J-MIGRATION-PHASE-1-COMPLETE.md) | 2025-10-10 | Phase 1: Export Service |
| [NEO4J-MIGRATION-PHASE-3-COMPLETE.md](./migrations/NEO4J-MIGRATION-PHASE-3-COMPLETE.md) | 2025-10-10 | Phase 3: Backup System Update |
| [NEO4J-MIGRATION-PHASE-4-COMPLETE.md](./migrations/NEO4J-MIGRATION-PHASE-4-COMPLETE.md) | 2025-10-10 | Phase 4: Final Cleanup |
| [NEO4J_MIGRATION_PLAN.md](./migrations/NEO4J_MIGRATION_PLAN.md) | 2025-10-10 | Original migration plan |

**Summary:** These documents detail the complete migration from dual PostgreSQL/file system persistence to Neo4j single-source architecture. All phases completed successfully as of October 10, 2025.

---

## Completed Plans

Implementation plans and enhancement documentation for completed work.

| Document | Date Completed | Description |
|----------|---------------|-------------|
| [ARCHIVE-requirements-history-implementation-plan.md](./completed-plans/ARCHIVE-requirements-history-implementation-plan.md) | ~2025-10 | Requirements version history system (now in production) |
| [BASELINE_READONLY_VIEW_IMPLEMENTATION.md](./completed-plans/BASELINE_READONLY_VIEW_IMPLEMENTATION.md) | ~2025-10 | Baseline read-only view (now production ready) |
| [backup-restore-improvements.md](./completed-plans/backup-restore-improvements.md) | ~2025-10 | Backup/restore system improvements (completed) |
| [browser-dialogs-replacement-progress.md](./completed-plans/browser-dialogs-replacement-progress.md) | ~2025-10 | Browser dialog replacement tracking |
| [BAD-LINKS-ENHANCEMENT.md](./completed-plans/BAD-LINKS-ENHANCEMENT.md) | ~2025-10 | Bad links detection enhancement (completed) |
| [SECTION-REPAIR.md](./completed-plans/SECTION-REPAIR.md) | 2025-10-10 | Section assignment repair after backup restore |

**Summary:** These implementation plans document completed features and fixes. The actual implementations are now part of the production codebase.

---

## Legacy

Deprecated and legacy documentation.

| Document | Deprecated Date | Description |
|----------|----------------|-------------|
| [LEGACY_DEV_USER_MIGRATION.md](./legacy/LEGACY_DEV_USER_MIGRATION.md) | 2025-10-17 | Legacy dev user migration to PostgreSQL |

**Summary:** Documentation for deprecated features and migration paths no longer relevant to current architecture.

---

## Why Archive?

Documents are archived when they:

1. **Describe completed work** - Implementation plans for features now in production
2. **Document historical migrations** - Database migrations and schema changes
3. **Track one-time fixes** - Bug fixes and data repairs
4. **Represent deprecated features** - Features no longer in the system

---

## Accessing Archived Documents

All archived documents are:
- ✅ Preserved in version control (git)
- ✅ Searchable via grep/IDE search
- ✅ Available for historical reference
- ✅ Included in repository backups

---

## When to Archive

Archive a document when:

1. ✅ The feature/migration is **100% complete and in production**
2. ✅ The document is **purely historical** (no ongoing reference needed)
3. ✅ The information is **superseded** by current active documentation
4. ❌ Do NOT archive if the plan is **still active** or **partially implemented**

---

## Moving Documents to Archive

To archive a document:

```bash
# Move to appropriate subdirectory
mv docs/DOCUMENT_NAME.md docs/archive/[migrations|completed-plans|legacy]/

# Update docs/README.md to remove from active index
# Update this file (docs/archive/README.md) to add to archive index

# Commit with clear message
git add docs/
git commit -m "docs: archive DOCUMENT_NAME (reason: completed/deprecated)"
```

---

## Questions?

For questions about archived documentation:
- Check git history: `git log --follow docs/archive/DOCUMENT_NAME.md`
- Review completion dates in this README
- Contact the platform team if clarification is needed

---

**Note:** These documents are preserved for historical reference and knowledge transfer. They may reference outdated code, schemas, or architectures that have since evolved.
