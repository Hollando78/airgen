import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "./useTenantProject";
import type { ProjectRecord } from "../types";

export interface EditProjectData {
  name: string;
  description: string;
  code: string;
  key: string;
}

/**
 * Custom hook for project management operations
 *
 * Handles:
 * - Listing projects for a tenant
 * - Creating new projects
 * - Updating/renaming projects
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
  const [projectPendingEdit, setProjectPendingEdit] = useState<{
    tenant: string;
    project: ProjectRecord;
  } | null>(null);
  const [editProjectData, setEditProjectData] = useState<EditProjectData>({
    name: "",
    description: "",
    code: "",
    key: ""
  });

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
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
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

  const updateProjectMutation = useMutation<unknown, Error, { tenant: string; project: string; data: Partial<EditProjectData> }>({
    mutationFn: ({ tenant, project, data }) => {
      const payload: Record<string, string> = {};
      if (data.name?.trim()) payload.name = data.name.trim();
      if (data.description?.trim()) payload.description = data.description.trim();
      if (data.code?.trim()) payload.code = data.code.trim();
      if (data.key?.trim()) payload.key = data.key.trim();
      return api.updateProject(tenant, project, payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", variables.tenant] });
      setProjectPendingEdit(null);
      toast.success("Project updated successfully");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update project";
      toast.error(message);
    }
  });

  const deleteProjectMutation = useMutation<unknown, Error, { tenant: string; project: string }>({
    mutationFn: ({ tenant, project }) => api.deleteProject(tenant, project),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["projects", variables.tenant] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
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

  const handleUpdateProject = useCallback(() => {
    if (!projectPendingEdit) {
      return;
    }
    updateProjectMutation.mutate({
      tenant: projectPendingEdit.tenant,
      project: projectPendingEdit.project.slug,
      data: editProjectData
    });
  }, [projectPendingEdit, editProjectData, updateProjectMutation]);

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

  const openEditProjectDialog = useCallback((tenantSlug: string, project: ProjectRecord) => {
    setProjectPendingEdit({ tenant: tenantSlug, project });
    setEditProjectData({
      name: project.name ?? "",
      description: project.description ?? "",
      code: project.code ?? "",
      key: project.key ?? ""
    });
  }, []);

  const closeEditProjectDialog = useCallback(() => {
    setProjectPendingEdit(null);
    setEditProjectData({ name: "", description: "", code: "", key: "" });
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
    updateProjectMutation,
    deleteProjectMutation,

    // UI State
    showCreateProject,
    setShowCreateProject,
    selectedTenantForProject,
    newProjectData,
    setNewProjectData,
    projectPendingDeletion,
    setProjectPendingDeletion,
    projectPendingEdit,
    editProjectData,
    setEditProjectData,

    // Handlers
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    openCreateProjectDialog,
    closeCreateProjectDialog,
    openEditProjectDialog,
    closeEditProjectDialog
  };
}
