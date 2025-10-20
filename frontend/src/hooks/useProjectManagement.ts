import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "./useTenantProject";

/**
 * Custom hook for project management operations
 *
 * Handles:
 * - Listing projects for a tenant
 * - Creating new projects
 * - Deleting projects
 * - Active project selection
 */
export function useProjectManagement() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { state } = useTenantProject();

  // UI State
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [selectedTenantForProject, setSelectedTenantForProject] = useState<string | null>(null);
  const [newProjectData, setNewProjectData] = useState({ slug: "", key: "" });
  const [projectPendingDeletion, setProjectPendingDeletion] = useState<{
    tenant: string;
    project: string;
  } | null>(null);

  // Queries
  const projectsQuery = useQuery({
    queryKey: ["projects", state.tenant],
    queryFn: () => api.listProjects(state.tenant ?? ""),
    enabled: Boolean(state.tenant)
  });

  // Mutations
  const createProjectMutation = useMutation<unknown, Error, { tenant: string; data: { slug: string; key: string } }>({
    mutationFn: ({ tenant, data }) =>
      api.createProject(tenant, {
        slug: data.slug,
        key: data.key.trim() ? data.key.trim() : undefined
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", variables.tenant] });
      setShowCreateProject(false);
      setSelectedTenantForProject(null);
      setNewProjectData({ slug: "", key: "" });
      toast.success("Project created successfully");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create project";
      toast.error(message);
    }
  });

  const deleteProjectMutation = useMutation<unknown, Error, { tenant: string; project: string }>({
    mutationFn: ({ tenant, project }) => api.deleteProject(tenant, project),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", variables.tenant] });
      setProjectPendingDeletion(null);
      toast.success("Project deleted successfully");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to delete project";
      toast.error(message);
    }
  });

  // Handlers
  const handleCreateProject = useCallback(() => {
    if (!selectedTenantForProject || !newProjectData.slug.trim()) {
      return;
    }
    createProjectMutation.mutate({
      tenant: selectedTenantForProject,
      data: {
        slug: newProjectData.slug.trim(),
        key: newProjectData.key
      }
    });
  }, [selectedTenantForProject, newProjectData, createProjectMutation]);

  const handleDeleteProject = useCallback(() => {
    if (!projectPendingDeletion) {
      return;
    }
    deleteProjectMutation.mutate(projectPendingDeletion);
  }, [projectPendingDeletion, deleteProjectMutation]);

  const openCreateProjectDialog = useCallback((tenantSlug: string) => {
    setSelectedTenantForProject(tenantSlug);
    setShowCreateProject(true);
  }, []);

  const closeCreateProjectDialog = useCallback(() => {
    setShowCreateProject(false);
    setSelectedTenantForProject(null);
    setNewProjectData({ slug: "", key: "" });
  }, []);

  // Derived state
  const activeProject = useMemo(() => {
    if (!state.project || !projectsQuery.data) {
      return null;
    }
    return projectsQuery.data.projects.find(project => project.slug === state.project) ?? null;
  }, [state.project, projectsQuery.data]);

  return {
    // Queries
    projectsQuery,
    activeProject,

    // Mutations
    createProjectMutation,
    deleteProjectMutation,

    // UI State
    showCreateProject,
    setShowCreateProject,
    selectedTenantForProject,
    newProjectData,
    setNewProjectData,
    projectPendingDeletion,
    setProjectPendingDeletion,

    // Handlers
    handleCreateProject,
    handleDeleteProject,
    openCreateProjectDialog,
    closeCreateProjectDialog
  };
}
