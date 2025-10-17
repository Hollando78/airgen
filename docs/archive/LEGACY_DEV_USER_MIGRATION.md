# Legacy Dev User Migration (Archived)

_Last updated: 2025-10-17_

This document preserves the historical context for the JSON-based `dev-users` store that existed before Postgres became the single source of truth for authentication and RBAC.

Key points:

- The implementation described here no longer exists; all user accounts and permissions now live in Postgres (`users`, `user_permissions`, `mfa_backup_codes`).
- Super-admin and tenant-admin routes were rewritten to query the repositories directly. Any scripts that referenced `backend/workspace/dev-users.json` should be considered obsolete.
- For auditing purposes, the removed migration playbook (`MIGRATION-PERMISSIONS-RBAC.md`) is available in Git history prior to commit `HEAD~0`.

If you need to understand how the legacy flow worked (e.g., to interpret old backups), check out commit `HEAD~1` or earlier and open `MIGRATION-PERMISSIONS-RBAC.md`.
