import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RequirementRecord } from "../../../types";
import { useApiClient } from "../../../lib/client";

export function useRequirementMutations(
  tenant: string,
  project: string,
  documentSlug: string
) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Mutation for inline field updates with optimistic updates
  const updateRequirementMutation = useMutation({
    mutationFn: async ({ requirement, field, value }: { requirement: RequirementRecord; field: string; value: string }) => {
      // Convert empty strings to undefined for optional fields
      const finalValue = value === "" ? undefined : value;
      const updates: Partial<RequirementRecord> = { [field]: finalValue };
      return api.updateRequirement(tenant, project, requirement.id, updates);
    },
    onMutate: async ({ requirement, field, value }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["sections", tenant, project, documentSlug] });

      // Snapshot the previous value
      const previousSections = queryClient.getQueryData(["sections", tenant, project, documentSlug]);

      // Convert empty strings to undefined for optional fields
      const finalValue = value === "" ? undefined : value;

      // Optimistically update the requirement in sections
      queryClient.setQueryData(["sections", tenant, project, documentSlug], (old: any) => {
        if (!old?.sections) return old;

        return {
          ...old,
          sections: old.sections.map((section: any) => ({
            ...section,
            requirements: section.requirements?.map((req: RequirementRecord) =>
              req.id === requirement.id ? { ...req, [field]: finalValue } : req
            )
          }))
        };
      });

      // Return context with the previous value
      return { previousSections };
    },
    onError: (err, variables, context) => {
      // If mutation fails, rollback to previous value and refetch
      if (context?.previousSections) {
        queryClient.setQueryData(
          ["sections", tenant, project, documentSlug],
          context.previousSections
        );
      }
      // Only refetch on error to show user the correct server state
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
    // Note: We don't refetch on success - the optimistic update is trusted
    // The next time the user navigates away and back, they'll get fresh data
  });

  // Mutation for updating attributes
  const updateAttributesMutation = useMutation({
    mutationFn: async ({ requirement, attributes }: { requirement: RequirementRecord; attributes: Record<string, string | number | boolean | null> }) => {
      const updates: Partial<RequirementRecord> = { attributes };
      return api.updateRequirement(tenant, project, requirement.id, updates);
    },
    onMutate: async ({ requirement, attributes }) => {
      await queryClient.cancelQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      const previousSections = queryClient.getQueryData(["sections", tenant, project, documentSlug]);

      queryClient.setQueryData(["sections", tenant, project, documentSlug], (old: any) => {
        if (!old?.sections) return old;

        return {
          ...old,
          sections: old.sections.map((section: any) => ({
            ...section,
            requirements: section.requirements?.map((req: RequirementRecord) =>
              req.id === requirement.id ? { ...req, attributes } : req
            )
          }))
        };
      });

      return { previousSections };
    },
    onError: (err, variables, context) => {
      if (context?.previousSections) {
        queryClient.setQueryData(
          ["sections", tenant, project, documentSlug],
          context.previousSections
        );
      }
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
    }
  });

  return {
    updateRequirementMutation,
    updateAttributesMutation
  };
}
