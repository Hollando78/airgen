/**
 * Tenant-Admin Dashboard
 *
 * Tenant-scoped administration interface accessible to Tenant-Admin users.
 * Provides access to:
 * - All users within the tenant
 * - All projects within the tenant
 * - Tenant-scoped permission management
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useUserRole } from "../hooks/useUserRole";
import { PageLayout } from "../components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Building, Users, FolderTree } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import type { DevUser } from "../types";

export function TenantAdminRoute(): JSX.Element {
  const api = useApiClient();
  const { getUserTenants } = useUserRole();

  // Get list of tenants user can admin
  const userTenants = getUserTenants();
  const [selectedTenant, setSelectedTenant] = useState<string>(userTenants[0] ?? "");

  const usersQuery = useQuery({
    queryKey: ["tenant-admin-users", selectedTenant],
    queryFn: () => api.listTenantUsers(selectedTenant),
    enabled: !!selectedTenant
  });

  const projectsQuery = useQuery({
    queryKey: ["tenant-admin-projects", selectedTenant],
    queryFn: () => api.listTenantProjects(selectedTenant),
    enabled: !!selectedTenant
  });

  if (userTenants.length === 0) {
    return (
      <PageLayout
        title="Tenant Administrator"
        description="Tenant-scoped administration dashboard"
      >
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              You do not have Tenant-Admin access to any tenants.
            </p>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Tenant Administrator"
      description="Tenant-scoped administration dashboard"
    >
      <div className="space-y-6">
        {/* Tenant Selector */}
        {userTenants.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {userTenants.map((tenant) => (
                    <SelectItem key={tenant} value={tenant}>
                      {tenant}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Statistics */}
        {selectedTenant && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  <CardTitle>Tenant Users</CardTitle>
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
                  <FolderTree className="h-5 w-5" />
                  <CardTitle>Tenant Projects</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {projectsQuery.isLoading ? (
                  <Spinner />
                ) : projectsQuery.isError ? (
                  <p className="text-sm text-error">Error loading projects</p>
                ) : (
                  <p className="text-3xl font-bold">{projectsQuery.data?.projects.length ?? 0}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tenant Users */}
        {selectedTenant && (
          <Card>
            <CardHeader>
              <CardTitle>Users in {selectedTenant}</CardTitle>
            </CardHeader>
            <CardContent>
              {usersQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : usersQuery.isError ? (
                <ErrorState message={(usersQuery.error as Error).message} />
              ) : usersQuery.data?.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users found in this tenant</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Tenant Role</TableHead>
                        <TableHead>Project Permissions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersQuery.data?.users.map((user: DevUser) => {
                        const tenantPerm = user.permissions?.tenantPermissions?.[selectedTenant];
                        const projectPerms = user.permissions?.projectPermissions?.[selectedTenant];
                        const projectCount = projectPerms ? Object.keys(projectPerms).length : 0;

                        return (
                          <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.email}</TableCell>
                            <TableCell>{user.name ?? "—"}</TableCell>
                            <TableCell>
                              {tenantPerm ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                  {tenantPerm.role}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {projectCount > 0 ? `${projectCount} project(s)` : "—"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tenant Projects */}
        {selectedTenant && (
          <Card>
            <CardHeader>
              <CardTitle>Projects in {selectedTenant}</CardTitle>
            </CardHeader>
            <CardContent>
              {projectsQuery.isLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : projectsQuery.isError ? (
                <ErrorState message={(projectsQuery.error as Error).message} />
              ) : projectsQuery.data?.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects found in this tenant</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectsQuery.data?.projects.map((project) => (
                        <TableRow key={project.key}>
                          <TableCell className="font-medium font-mono">{project.key}</TableCell>
                          <TableCell className="font-mono">{project.slug}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
