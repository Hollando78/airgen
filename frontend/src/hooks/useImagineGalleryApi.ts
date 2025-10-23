import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '../lib/client';

/**
 * Frontend representation of an ImagineImage from the gallery
 */
export interface ImagineImageRecord {
  id: string;
  elementId: string;
  elementName: string;
  elementType: 'Block' | 'Interface';
  tenantSlug: string;
  projectSlug: string;
  prompt: string;
  customPrompt?: string;
  imageUrl: string;
  version: number;
  parentVersionId?: string;
  requirementIds?: string[];
  metadata: {
    model: string;
    aspectRatio: string;
    generatedAt: string;
    estimatedCost: number;
  };
  createdBy: string;
  createdAt: string;
}

/**
 * Request body for re-imagining an existing image
 */
export interface ReImagineRequest {
  parentImageId: string;
  iterationInstructions: string;
}

/**
 * Response from list images endpoint
 */
export interface ListImagesResponse {
  success: boolean;
  data: {
    images: ImagineImageRecord[];
    total: number;
  };
}

/**
 * Response from get image details endpoint
 */
export interface ImageDetailsResponse {
  success: boolean;
  data: {
    image: ImagineImageRecord;
    versions: ImagineImageRecord[]; // All versions related to this image
  };
}

/**
 * Response from re-imagine endpoint
 */
export interface ReImagineResponse {
  success: boolean;
  data: {
    image: ImagineImageRecord;
  };
}

/**
 * Hook for accessing the Imagine Gallery API
 */
export function useImagineGalleryApi(tenant: string, project: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  // List all images for the project
  const imagesQuery = useQuery({
    queryKey: ['imagine-gallery', tenant, project],
    queryFn: async () => {
      return await api.listImagineImages(tenant, project);
    },
    enabled: Boolean(tenant && project),
  });

  // Get details for a specific image
  const useImageDetails = (imageId: string | null) => {
    return useQuery({
      queryKey: ['imagine-image-details', tenant, project, imageId],
      queryFn: async () => {
        if (!imageId) return null;
        return await api.getImagineImageDetails(tenant, project, imageId);
      },
      enabled: Boolean(tenant && project && imageId),
    });
  };

  // Re-imagine mutation
  const reImagineMutation = useMutation({
    mutationFn: async (request: ReImagineRequest) => {
      return await api.reImagineImage(tenant, project, request);
    },
    onSuccess: () => {
      // Invalidate gallery query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['imagine-gallery', tenant, project] });
    },
  });

  return {
    images: imagesQuery.data?.data?.images ?? [],
    total: imagesQuery.data?.data?.total ?? 0,
    isLoading: imagesQuery.isLoading,
    error: imagesQuery.error,
    refetch: imagesQuery.refetch,
    useImageDetails,
    reImagine: reImagineMutation.mutateAsync,
    isReImagining: reImagineMutation.isPending,
    reImagineError: reImagineMutation.error,
  };
}
