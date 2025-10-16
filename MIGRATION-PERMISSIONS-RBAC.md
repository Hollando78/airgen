# User Permissions & RBAC Migration Guide

## Overview

This migration introduces a comprehensive Role-Based Access Control (RBAC) system with hierarchical permissions replacing the simple string-based roles.

**Migration Date**: 2025-10-16

## What Changed

### New Permission Structure

#### Before (Legacy):
```typescript
{
  roles: string[]                    // ["admin", "user"]
  tenantSlugs: string[]              // ["acme", "example"]
  ownedTenantSlugs?: string[]        // ["acme"]
}
```

#### After (New):
```typescript
{
  permissions: {
    globalRole?: UserRole.SUPER_ADMIN
    tenantPermissions?: {
      [tenantSlug: string]: {
        role: UserRole
        isOwner?: boolean
        grantedAt?: string
        grantedBy?: string
      }
    }
    projectPermissions?: {
      [tenantSlug: string]: {
        [projectKey: string]: {
          role: UserRole
          grantedAt?: string
          grantedBy?: string
        }
      }
    }
  }
}
```

### New Role Hierarchy

```
UserRole (enum):
  SUPER_ADMIN    (60) - Full system access
  TENANT_ADMIN   (50) - All projects in tenant(s)
  ADMIN          (40) - Project administrator
  APPROVER       (30) - Can approve documents
  AUTHOR         (20) - Can create/edit content
  VIEWER         (10) - Read-only access
```

### New Routes

#### Super-Admin Routes (`/api/super-admin/*`)
- `GET /api/super-admin/users` - List all users
- `GET /api/super-admin/users/:id` - Get user details
- `POST /api/super-admin/users` - Create user
- `PATCH /api/super-admin/users/:id/permissions` - Update permissions
- `DELETE /api/super-admin/users/:id` - Delete user
- `GET /api/super-admin/tenants` - List all tenants
- `GET /api/super-admin/tenants/:slug` - Get tenant details
- `POST /api/super-admin/permissions/grant` - Grant permission
- `POST /api/super-admin/permissions/revoke` - Revoke permission

#### Tenant-Admin Routes (`/api/tenant-admin/:tenant/*`)
- `GET /api/tenant-admin/:tenant/users` - List tenant users
- `GET /api/tenant-admin/:tenant/users/:id` - Get user in tenant context
- `POST /api/tenant-admin/:tenant/users/:id/grant-access` - Grant tenant access
- `POST /api/tenant-admin/:tenant/users/:id/revoke-access` - Revoke tenant access
- `POST /api/tenant-admin/:tenant/projects/:project/grant-access` - Grant project access
- `POST /api/tenant-admin/:tenant/projects/:project/revoke-access` - Revoke project access
- `GET /api/tenant-admin/:tenant/projects` - List tenant projects
- `GET /api/tenant-admin/:tenant/projects/:project` - Get project details

## Backward Compatibility

✅ **Fully backward compatible!**

- Legacy permission fields are preserved
- RBAC service automatically migrates legacy permissions on-the-fly
- No immediate action required
- Existing JWTs continue to work
- Old API routes remain functional

## Migration Process

### Step 1: Backup

**Always create a backup before migration!**

```bash
# Backup is created automatically, but you can create an additional one
cp workspace/dev-users.json workspace/dev-users.json.backup-manual
```

### Step 2: Preview Migration (Dry Run)

Preview what will change without modifying files:

```bash
cd backend
pnpm migrate:permissions:dry-run
```

This will show:
- Which users will be migrated
- What permissions they'll receive
- Any errors or warnings

### Step 3: Run Migration

Apply the migration (creates automatic backup):

```bash
cd backend
pnpm migrate:permissions
```

The script will:
- ✓ Create timestamped backup
- ✓ Migrate all users to new permission structure
- ✓ Preserve legacy fields for backward compatibility
- ✓ Display summary of changes

### Step 4: Grant Super-Admin Role

Grant Super-Admin to your primary admin user:

```bash
cd backend
pnpm grant:super-admin info@airgen.studio
```

Or use the full path:

```bash
pnpm tsx backend/scripts/grant-super-admin.ts info@airgen.studio
```

### Step 5: Verify

1. **Check the migration summary** for any errors
2. **Review the backup file** (`.backup.TIMESTAMP` suffix)
3. **Test authentication** with migrated users
4. **Verify permissions** in the new super-admin routes

## Migration Rules

The migration script applies these rules:

### User with `super-admin` role:
```typescript
// Before:
{ roles: ["super-admin"], tenantSlugs: [...] }

// After:
{ permissions: { globalRole: UserRole.SUPER_ADMIN } }
```

### User who owns a tenant:
```typescript
// Before:
{ tenantSlugs: ["acme"], ownedTenantSlugs: ["acme"] }

// After:
{
  permissions: {
    tenantPermissions: {
      acme: { role: UserRole.TENANT_ADMIN, isOwner: true }
    }
  }
}
```

### User with `admin` role:
```typescript
// Before:
{ roles: ["admin"], tenantSlugs: ["acme"] }

// After:
{
  permissions: {
    tenantPermissions: {
      acme: { role: UserRole.ADMIN }
    }
  }
}
```

### Regular user:
```typescript
// Before:
{ roles: ["user"], tenantSlugs: ["acme"] }

// After:
{
  permissions: {
    tenantPermissions: {
      acme: { role: UserRole.AUTHOR }
    }
  }
}
```

## Rollback Procedure

If you need to rollback:

1. **Stop the backend server**
2. **Restore from backup:**
   ```bash
   # Find your backup file
   ls -la workspace/dev-users.json.backup.*

   # Restore (replace TIMESTAMP with your backup timestamp)
   cp workspace/dev-users.json.backup.TIMESTAMP workspace/dev-users.json
   ```
3. **Restart the server**

**Note**: The system will continue to work with legacy permissions due to automatic migration in the RBAC service.

## Breaking Changes

### None for API Consumers

✅ All existing API endpoints work unchanged
✅ JWT tokens continue to work
✅ Authentication flow unchanged

### For Frontend Developers

New components and utilities needed:
- `RoleGuard` component for conditional rendering
- Hook to check user roles: `useUserRole()`
- Navigation updates for super-admin/tenant-admin routes

## Testing

### Test Super-Admin Access

```bash
# Get a JWT token for your super-admin user
TOKEN="your-jwt-token"

# Test super-admin routes
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/super-admin/users

# Should return all users with enhanced role information
```

### Test Tenant-Admin Access

```bash
# Get a JWT token for a tenant-admin user
TOKEN="your-jwt-token"
TENANT="your-tenant-slug"

# Test tenant-admin routes
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8787/api/tenant-admin/$TENANT/users

# Should return users with access to this tenant
```

### Test Permission Checks

The RBAC system automatically checks permissions on all protected routes. Test with users of different roles to verify:
- Super-Admin can access everything
- Tenant-Admin can access their tenant(s)
- Regular users can only access their assigned projects

## Troubleshooting

### "User not found" during migration

**Cause**: `dev-users.json` file doesn't exist
**Fix**: Ensure you're running from the correct directory with `workspace/` folder

### "Already has super-admin in legacy roles"

**Cause**: User has `super-admin` in legacy `roles` array but hasn't been migrated
**Fix**: Run the migration script: `pnpm migrate:permissions`

### Permissions not working after migration

**Cause**: JWT token still contains old permission structure
**Fix**: Re-login to get a new JWT token with updated permissions

### Can't access super-admin routes

**Cause**: User doesn't have `globalRole: SUPER_ADMIN`
**Fix**: Run `pnpm grant:super-admin <email>` for your admin user

## Technical Details

### Files Modified

**Type Definitions:**
- `backend/src/types/roles.ts` - UserRole enum and hierarchy
- `backend/src/types/permissions.ts` - Permission interfaces

**Core Services:**
- `backend/src/lib/rbac.ts` - Permission checking logic
- `backend/src/lib/authorization.ts` - Middleware and assertions
- `backend/src/services/dev-users.ts` - User storage model

**Routes:**
- `backend/src/routes/super-admin.ts` - Super-Admin routes
- `backend/src/routes/tenant-admin.ts` - Tenant-Admin routes
- `backend/src/server.ts` - Route registration

**Scripts:**
- `backend/scripts/migrate-user-permissions.ts` - Migration script
- `backend/scripts/grant-super-admin.ts` - Super-Admin grant script

### Automatic Migration

The RBAC service (`backend/src/lib/rbac.ts`) includes `getEffectivePermissions()` which automatically migrates legacy permissions on-the-fly. This means:

1. Users with old permission structure will work immediately
2. Migration is transparent to the application
3. New permissions are calculated from legacy fields when needed
4. No downtime required for the migration

This "lazy migration" approach allows gradual adoption while maintaining full backward compatibility.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review migration script logs
3. Check backup files for comparison
4. Review RBAC service logic in `backend/src/lib/rbac.ts`

## Summary Checklist

- [ ] Backup created
- [ ] Dry-run completed successfully
- [ ] Migration executed
- [ ] Super-Admin granted to primary user
- [ ] Super-Admin routes tested
- [ ] Tenant-Admin routes tested
- [ ] Users re-authenticated to get new JWT tokens
- [ ] Frontend components updated (separate task)
- [ ] Documentation reviewed
- [ ] Team notified of new permission system
