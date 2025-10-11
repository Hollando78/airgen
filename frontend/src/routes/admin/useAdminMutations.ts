import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { toast } from "sonner";

export function useAdminMutations(
  tenant: string,
  project: string,
  setSelectedRequirements: (value: Set<string>) => void,
  setSelectedCandidates: (value: Set<string>) => void
) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: (requirementId: string) =>
      api.restoreRequirement(tenant, project, requirementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["requirements"] });
      toast.success("Requirement restored successfully");
      setSelectedRequirements(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to restore requirement");
    }
  });

  // Bulk restore mutation
  const bulkRestoreMutation = useMutation({
    mutationFn: (requirementIds: string[]) =>
      api.bulkRestoreRequirements(tenant, project, requirementIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements"] });
      queryClient.invalidateQueries({ queryKey: ["requirements"] });
      toast.success(`Restored ${data.results.restored.length} requirements`);
      if (data.results.failed.length > 0) {
        toast.warning(`Failed to restore ${data.results.failed.length} requirements`);
      }
      setSelectedRequirements(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to restore requirements");
    }
  });

  // Sync to markdown mutation
  const syncMutation = useMutation({
    mutationFn: (requirementId: string) =>
      api.syncRequirementToMarkdown(tenant, project, requirementId),
    onSuccess: () => {
      toast.success("Requirement synced to markdown");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to sync requirement");
    }
  });

  // Delete broken links mutation
  const deleteBrokenLinksMutation = useMutation({
    mutationFn: async (linkIds: string[]) => {
      // Filter out null/undefined link IDs and delete all valid broken links
      const validLinkIds = linkIds.filter(id => id != null && id !== '');
      const results = {
        deleted: 0,
        failed: 0
      };

      for (const linkId of validLinkIds) {
        try {
          await api.deleteTraceLink(tenant, project, linkId);
          results.deleted++;
        } catch (error: any) {
          // If link doesn't exist (404), count as success since it's already gone
          if (error?.status === 404) {
            results.deleted++;
          } else {
            results.failed++;
            console.error(`Failed to delete link ${linkId}:`, error);
          }
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements", "badlinks"] });
      queryClient.invalidateQueries({ queryKey: ["trace-links"] });

      if (results.failed > 0) {
        toast.warning(`Removed ${results.deleted} link${results.deleted > 1 ? 's' : ''}, ${results.failed} failed`);
      } else {
        toast.success(`Removed ${results.deleted} broken link${results.deleted > 1 ? 's' : ''}`);
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to remove broken links");
    }
  });

  // Bulk delete candidates mutation
  const bulkDeleteCandidatesMutation = useMutation({
    mutationFn: (candidateIds: string[]) => api.bulkDeleteCandidates(candidateIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements", "candidates"] });
      toast.success(`Deleted ${data.deleted} candidate${data.deleted > 1 ? 's' : ''}`);
      setSelectedCandidates(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to delete candidates");
    }
  });

  // Bulk reset candidates mutation
  const bulkResetCandidatesMutation = useMutation({
    mutationFn: (candidateIds: string[]) => api.bulkResetCandidates(candidateIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "requirements", "candidates"] });
      toast.success(`Reset ${data.reset} candidate${data.reset > 1 ? 's' : ''} to pending status`);
      setSelectedCandidates(new Set());
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to reset candidates");
    }
  });

  return {
    restoreMutation,
    bulkRestoreMutation,
    syncMutation,
    deleteBrokenLinksMutation,
    bulkDeleteCandidatesMutation,
    bulkResetCandidatesMutation
  };
}
