import { useMutation, useQuery } from '@tanstack/react-query';
import { useApiClient } from '../lib/client';

export interface GenerateSnapDraftRequest {
  elementId: string;
  elementType: 'block' | 'interface';
  contextDocuments?: string[];
  contextRequirements?: string[];
  referenceDiagrams?: string[];
  style: 'engineering' | 'architectural' | 'schematic';
  outputs: ('dxf' | 'svg')[];
  options?: {
    units: 'mm' | 'in';
    scale: string;
    paper: 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'LETTER' | 'TABLOID' | 'LEGAL';
    orientation: 'landscape' | 'portrait';
  };
  forcedMode?: 'technical_drawing' | 'visualization';
}

export interface AnalyzeSnapDraftRequest {
  elementId: string;
  elementType: 'block' | 'interface';
  contextDocuments?: string[];
  contextRequirements?: string[];
  referenceDiagrams?: string[];
  style: 'engineering' | 'architectural' | 'schematic';
}

export interface AnalysisResponse {
  mode: 'technical_drawing' | 'visualization';
  visualizationType?: 'dalle' | 'svg';
  reasoning: string;
  suitabilityScore: number;
  issues: string[];
}

export type GenerateSnapDraftResponse =
  | {
      drawingId: string;
      mode: 'technical_drawing';
      specJson: any;
      files: {
        dxf?: string;
        svg?: string;
      };
      reasoning: {
        dimensionsAssumed: string[];
        warnings: string[];
      };
    }
  | {
      drawingId: string;
      mode: 'visualization';
      visualizationType: 'dalle' | 'svg';
      files: {
        png?: string;
        svg?: string;
      };
      prompt: string;
      revisedPrompt?: string;
      reasoning: {
        whyNotDrawing: string[];
        suitabilityScore: number;
      };
    };

export interface SnapDraftHistoryItem {
  drawingId: string;
  createdAt: string;
  style: string;
  outputs: string[];
}

/**
 * Hook for analyzing SnapDraft mode without generation
 */
export const useSnapDraftAnalyze = (tenant: string, project: string) => {
  const api = useApiClient();

  return useMutation({
    mutationFn: async (request: AnalyzeSnapDraftRequest): Promise<AnalysisResponse> => {
      return api.analyzeSnapDraft(tenant, project, request);
    },
    onError: (error: any) => {
      console.error('SnapDraft analysis failed:', error);
    },
  });
};

/**
 * Hook for generating SnapDraft technical drawings
 */
export const useSnapDraftGenerate = (tenant: string, project: string) => {
  const api = useApiClient();

  return useMutation({
    mutationFn: async (request: GenerateSnapDraftRequest): Promise<GenerateSnapDraftResponse> => {
      return api.generateSnapDraft(tenant, project, request);
    },
    onError: (error: any) => {
      console.error('SnapDraft generation failed:', error);
    },
  });
};

/**
 * Hook for fetching SnapDraft history for an element
 */
export const useSnapDraftHistory = (tenant: string, elementId: string, enabled: boolean = true) => {
  const api = useApiClient();

  return useQuery<SnapDraftHistoryItem[]>({
    queryKey: ['snapdraft', 'history', tenant, elementId],
    queryFn: async () => {
      return api.getSnapDraftHistory(tenant, elementId);
    },
    enabled,
  });
};

/**
 * Create a download helper function that uses the API client
 * This must be created inside a component that has access to useApiClient
 */
export const createDownloadHelper = (api: ReturnType<typeof useApiClient>) => {
  return async (
    tenant: string,
    drawingId: string,
    format: 'dxf' | 'svg' | 'json',
    filename: string
  ) => {
    try {
      const blob = await api.downloadSnapDraftFile(tenant, drawingId, format);

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Failed to download ${format} file:`, error);
      throw error;
    }
  };
};

/**
 * @deprecated Use createDownloadHelper instead - this function doesn't include auth
 */
export const downloadSnapDraftFile = async (
  tenant: string,
  drawingId: string,
  format: 'dxf' | 'svg' | 'json',
  filename: string,
  token?: string
) => {
  try {
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/snapdraft/${tenant}/${drawingId}/download/${format}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error(`Failed to download ${format} file:`, error);
    throw error;
  }
};
