import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import type { CreateTraceLinkRequest } from "../../types";

interface UseTraceLinkMutationsOptions {
  tenant: string;
  project: string;
}

/**
 * Custom hook for trace link and requirement mutations
 * Consolidates all mutation logic with proper cache invalidation
 */
export function useTraceLinkMutations({ tenant, project }: UseTraceLinkMutationsOptions) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  // Create trace link mutation
  const createTraceLinkMutation = useMutation({
    mutationFn: (body: CreateTraceLinkRequest) =>
      apiClient.createTraceLink(tenant, project, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
    }
  });

  // Delete trace link mutation
  const deleteTraceLinkMutation = useMutation({
    mutationFn: (linkId: string) =>
      apiClient.deleteTraceLink(tenant, project, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
    }
  });

  // Archive requirement mutation
  const archiveMutation = useMutation({
    mutationFn: (requirementId: string) =>
      apiClient.archiveRequirements(tenant, project, [requirementId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
    }
  });

  // Unarchive requirement mutation
  const unarchiveMutation = useMutation({
    mutationFn: (requirementId: string) =>
      apiClient.unarchiveRequirements(tenant, project, [requirementId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
    }
  });

  // Delete requirement mutation (soft delete)
  const deleteMutation = useMutation({
    mutationFn: (requirementId: string) =>
      apiClient.deleteRequirement(tenant, project, requirementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["sections-with-relations", tenant, project] });
    }
  });

  return {
    createTraceLinkMutation,
    deleteTraceLinkMutation,
    archiveMutation,
    unarchiveMutation,
    deleteMutation
  };
}
