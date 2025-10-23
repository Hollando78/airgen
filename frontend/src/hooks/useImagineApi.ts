import { useMutation, useQuery } from '@tanstack/react-query';
import { useApiClient } from '../lib/client';

export interface ImagineRequirement {
  id: string;
  ref: string;
  title: string;
  text: string;
  type?: string;
  priority?: string;
}

export interface ImagineGenerateRequest {
  elementId: string;
  elementType: 'Block' | 'Interface';
  requirementIds?: string[];
  customPrompt?: string;
  referenceImages?: string[];
}

export interface ImagineGenerateResponse {
  success: boolean;
  data: {
    id: string;
    elementId: string;
    elementType: 'Block' | 'Interface';
    prompt: string;
    imageUrl: string;
    metadata: {
      model: string;
      aspectRatio: string;
      generatedAt: string;
      estimatedCost: number;
    };
    createdBy: string;
    createdAt: string;
  };
}

export function useImagineApi(tenant: string, project: string, elementId?: string) {
  const api = useApiClient();

  // Fetch requirements linked to the element
  const requirementsQuery = useQuery({
    queryKey: ['imagine-requirements', tenant, project, elementId],
    queryFn: async () => {
      if (!elementId) {
        return { data: { requirements: [] } };
      }
      return await api.getImagineRequirements(tenant, project, elementId);
    },
    enabled: Boolean(tenant && project && elementId),
  });

  const generateImagination = useMutation({
    mutationFn: async (body: ImagineGenerateRequest) => {
      return await api.generateImagination(tenant, project, body);
    },
  });

  return {
    requirements: requirementsQuery.data?.data?.requirements ?? [],
    isLoadingRequirements: requirementsQuery.isLoading,
    generateImagination,
    isGenerating: generateImagination.isPending,
    error: generateImagination.error,
  };
}
