/**
 * Diagram Management Hook
 *
 * Manages architecture diagrams including:
 * - Listing diagrams for a project
 * - Active diagram selection
 * - Creating, updating, and deleting diagrams
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import type { ArchitectureDiagramRecord } from "../../types";

/**
 * useDiagrams - Hook for managing architecture diagrams
 *
 * @param tenant - Tenant slug (null if no tenant selected)
 * @param project - Project key (null if no project selected)
 * @returns Diagram queries, mutations, state, and handler functions
 */
export function useDiagrams(tenant: string | null, project: string | null) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Active diagram state
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);

  // Reset active diagram when tenant/project changes
  useEffect(() => {
    setActiveDiagramId(null);
  }, [tenant, project]);

  // Query: List all diagrams
  const diagramsQuery = useQuery({
    queryKey: ["architecture-diagrams", tenant, project],
    queryFn: () => api.listArchitectureDiagrams(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  // Computed: Diagrams array
  const diagrams = useMemo<ArchitectureDiagramRecord[]>(
    () => diagramsQuery.data?.diagrams ?? [],
    [diagramsQuery.data?.diagrams]
  );

  // Auto-select first diagram when diagrams load
  useEffect(() => {
    if (!diagrams.length) {
      setActiveDiagramId(null);
      return;
    }

    setActiveDiagramId(prev => {
      // Keep current selection if it's still valid
      if (prev && diagrams.some(diagram => diagram.id === prev)) {
        return prev;
      }
      // Otherwise select first diagram
      return diagrams[0].id;
    });
  }, [diagrams]);

  // Computed: Active diagram object
  const activeDiagram = useMemo(
    () => (activeDiagramId ? diagrams.find(diagram => diagram.id === activeDiagramId) ?? null : null),
    [diagrams, activeDiagramId]
  );

  // Mutation: Create diagram
  const createDiagramMutation = useMutation({
    mutationFn: (input: { name: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) =>
      api.createArchitectureDiagram({
        tenant: tenant!,
        projectKey: project!,
        name: input.name,
        description: input.description,
        view: input.view
      }),
    onSuccess: ({ diagram }) => {
      queryClient.invalidateQueries({ queryKey: ["architecture-diagrams", tenant, project] });
      setActiveDiagramId(diagram.id);
    }
  });

  // Mutation: Update diagram
  const updateDiagramMutation = useMutation({
    mutationFn: ({ diagramId, updates }: { diagramId: string; updates: Partial<Pick<ArchitectureDiagramRecord, "name" | "description" | "view">> }) =>
      api.updateArchitectureDiagram(tenant!, project!, diagramId, {
        ...updates,
        description: updates.description ?? undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-diagrams", tenant, project] });
    }
  });

  // Mutation: Delete diagram
  const deleteDiagramMutation = useMutation({
    mutationFn: (diagramId: string) => api.deleteArchitectureDiagram(tenant!, project!, diagramId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-diagrams", tenant, project] });
    }
  });

  // Handler: Create diagram
  const createDiagram = useCallback((input: { name: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) => {
    if (!tenant || !project) {
      return Promise.reject(new Error("Missing tenant or project"));
    }
    return createDiagramMutation.mutateAsync(input);
  }, [createDiagramMutation, tenant, project]);

  // Handler: Rename diagram (update)
  const renameDiagram = useCallback((diagramId: string, updates: { name?: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) => {
    return updateDiagramMutation.mutateAsync({ diagramId, updates });
  }, [updateDiagramMutation]);

  // Handler: Delete diagram
  const deleteDiagram = useCallback((diagramId: string) => {
    if (!diagramId) {
      return Promise.resolve();
    }
    // Prevent deleting the last diagram
    if (diagrams.length <= 1) {
      return Promise.reject(new Error("At least one diagram must remain"));
    }
    // Clear active diagram if deleting the active one
    if (diagramId === activeDiagramId) {
      setActiveDiagramId(null);
    }
    return deleteDiagramMutation.mutateAsync(diagramId);
  }, [activeDiagramId, deleteDiagramMutation, diagrams.length]);

  return {
    // State
    activeDiagramId,
    setActiveDiagramId,

    // Computed
    diagrams,
    activeDiagram,

    // Handlers
    createDiagram,
    renameDiagram,
    deleteDiagram,

    // Loading states
    isLoading: diagramsQuery.isFetching,
    error: diagramsQuery.error,

    // Mutations (for advanced use)
    createDiagramMutation,
    updateDiagramMutation,
    deleteDiagramMutation
  };
}
