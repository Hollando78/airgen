/**
 * Package Management Hook
 *
 * Manages architecture packages for organizing diagrams and blocks:
 * - Listing packages
 * - Creating, updating, and deleting packages
 * - Moving items between packages
 * - Reordering items within packages
 */

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";

/**
 * usePackages - Hook for managing architecture packages
 *
 * @param tenant - Tenant slug (null if no tenant selected)
 * @param project - Project key (null if no project selected)
 * @returns Package queries, mutations, and handler functions
 */
export function usePackages(tenant: string | null, project: string | null) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Query: List all packages
  const packagesQuery = useQuery({
    queryKey: ["architecture-packages", tenant, project],
    queryFn: () => api.listArchitecturePackages(tenant!, project!),
    enabled: Boolean(tenant && project)
  });

  // Computed: Packages array
  const packages = useMemo(
    () => packagesQuery.data?.packages ?? [],
    [packagesQuery.data?.packages]
  );

  // Mutation: Create package
  const createPackageMutation = useMutation({
    mutationFn: (input: { name: string; description?: string; parentId?: string | null; order?: number }) =>
      api.createArchitecturePackage({
        tenant: tenant!,
        projectKey: project!,
        name: input.name,
        description: input.description,
        parentId: input.parentId,
        order: input.order
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-packages", tenant, project] });
    }
  });

  // Mutation: Update package
  const updatePackageMutation = useMutation({
    mutationFn: ({ packageId, updates }: { packageId: string; updates: { name?: string; description?: string; order?: number } }) =>
      api.updateArchitecturePackage(tenant!, project!, packageId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-packages", tenant, project] });
    }
  });

  // Mutation: Delete package
  const deletePackageMutation = useMutation({
    mutationFn: ({ packageId, cascade }: { packageId: string; cascade?: boolean }) =>
      api.deleteArchitecturePackage(tenant!, project!, packageId, cascade),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["architecture-packages", tenant, project] });
    }
  });

  // Mutation: Move item to package
  const moveToPackageMutation = useMutation({
    mutationFn: (input: { itemId: string; itemType: "package" | "block" | "diagram"; targetPackageId: string | null; order?: number }) =>
      api.moveToArchitecturePackage({
        tenant: tenant!,
        projectKey: project!,
        itemId: input.itemId,
        itemType: input.itemType,
        targetPackageId: input.targetPackageId,
        order: input.order
      }),
    onSuccess: async () => {
      // Refetch immediately to update UI
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["architecture-packages", tenant, project] }),
        queryClient.refetchQueries({ queryKey: ["architecture-diagrams", tenant, project] }),
        queryClient.refetchQueries({ queryKey: ["architecture-block-library", tenant, project] })
      ]);
    }
  });

  // Mutation: Reorder items in package
  const reorderInPackageMutation = useMutation({
    mutationFn: (input: { packageId: string | null; itemIds: string[] }) =>
      api.reorderInArchitecturePackage({
        tenant: tenant!,
        projectKey: project!,
        packageId: input.packageId,
        itemIds: input.itemIds
      }),
    onSuccess: async () => {
      // Refetch immediately to update UI
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["architecture-packages", tenant, project] }),
        queryClient.refetchQueries({ queryKey: ["architecture-diagrams", tenant, project] }),
        queryClient.refetchQueries({ queryKey: ["architecture-block-library", tenant, project] })
      ]);
    }
  });

  // Handler: Create package
  const createPackage = useCallback((input: { name: string; description?: string; parentId?: string | null; order?: number }) => {
    if (!tenant || !project) {
      return Promise.reject(new Error("Missing tenant or project"));
    }
    return createPackageMutation.mutateAsync(input);
  }, [createPackageMutation, tenant, project]);

  // Handler: Update package
  const updatePackage = useCallback((packageId: string, updates: { name?: string; description?: string; order?: number }) => {
    return updatePackageMutation.mutateAsync({ packageId, updates });
  }, [updatePackageMutation]);

  // Handler: Delete package
  const deletePackage = useCallback((packageId: string, cascade?: boolean) => {
    return deletePackageMutation.mutateAsync({ packageId, cascade });
  }, [deletePackageMutation]);

  // Handler: Move item to package
  const moveToPackage = useCallback((itemId: string, itemType: "package" | "block" | "diagram", targetPackageId: string | null, order?: number) => {
    return moveToPackageMutation.mutateAsync({ itemId, itemType, targetPackageId, order });
  }, [moveToPackageMutation]);

  // Handler: Reorder items in package
  const reorderInPackage = useCallback((packageId: string | null, itemIds: string[]) => {
    return reorderInPackageMutation.mutateAsync({ packageId, itemIds });
  }, [reorderInPackageMutation]);

  return {
    // Computed
    packages,

    // Handlers
    createPackage,
    updatePackage,
    deletePackage,
    moveToPackage,
    reorderInPackage,

    // Loading states
    isLoading: packagesQuery.isLoading,
    isFetching: packagesQuery.isFetching,
    error: packagesQuery.error,

    // Mutations (for advanced use)
    createPackageMutation,
    updatePackageMutation,
    deletePackageMutation,
    moveToPackageMutation,
    reorderInPackageMutation
  };
}
