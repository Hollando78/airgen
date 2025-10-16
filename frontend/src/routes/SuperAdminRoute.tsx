/**
 * Super-Admin Dashboard
 *
 * System-wide administration interface accessible only to Super-Admin users.
 * Provides access to:
 * - All users across all tenants
 * - All tenants
 * - System-wide permission management
 */

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { PageLayout } from "../components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Shield, Users, Building2 } from "lucide-react";
import type { DevUser } from "../types";

export function SuperAdminRoute(): JSX.Element {
  const api = useApiClient();

  const usersQuery = useQuery({
    queryKey: ["super-admin-users"],
    queryFn: () => api.listAllSuperAdminUsers()
  });

  const tenantsQuery = useQuery({
    queryKey: ["super-admin-tenants"],
    queryFn: () => api.listAllSuperAdminTenants()
  });

  return (
    <PageLayout
      title="Super Administrator"
      description="System-wide administration dashboard"
    >
      <div className="space-y-6">
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>Total Users</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {usersQuery.isLoading ? (
                <Spinner />
              ) : usersQuery.isError ? (
                <p className="text-sm text-error">Error loading users</p>
              ) : (
                <p className="text-3xl font-bold">{usersQuery.data?.users.length ?? 0}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                <CardTitle>Total Tenants</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {tenantsQuery.isLoading ? (
                <Spinner />
              ) : tenantsQuery.isError ? (
                <p className="text-sm text-error">Error loading tenants</p>
              ) : (
                <p className="text-3xl font-bold">{tenantsQuery.data?.tenants.length ?? 0}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* All Users */}
        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
          </CardHeader>
          <CardContent>
            {usersQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : usersQuery.isError ? (
              <ErrorState message={(usersQuery.error as Error).message} />
            ) : usersQuery.data?.users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Legacy Roles</TableHead>
                      <TableHead>Tenants</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersQuery.data?.users.map((user: DevUser) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>{user.name ?? "—"}</TableCell>
                        <TableCell>
                          {user.permissions?.globalRole ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                              {user.permissions.globalRole}
                            </span>
                          ) : user.permissions?.tenantPermissions ? (
                            <span className="text-xs text-muted-foreground">
                              {Object.keys(user.permissions.tenantPermissions).length} tenant(s)
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {user.roles?.length > 0 ? user.roles.join(", ") : "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {user.tenantSlugs?.length > 0 ? user.tenantSlugs.join(", ") : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* All Tenants */}
        <Card>
          <CardHeader>
            <CardTitle>All Tenants</CardTitle>
          </CardHeader>
          <CardContent>
            {tenantsQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : tenantsQuery.isError ? (
              <ErrorState message={(tenantsQuery.error as Error).message} />
            ) : tenantsQuery.data?.tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tenants found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slug</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantsQuery.data?.tenants.map((tenant) => (
                      <TableRow key={tenant.slug}>
                        <TableCell className="font-medium font-mono">{tenant.slug}</TableCell>
                        <TableCell>{tenant.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
