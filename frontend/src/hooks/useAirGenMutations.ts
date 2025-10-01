import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type { RequirementCandidate, DiagramCandidate, DocumentAttachment, DiagramAttachment } from "../types";

interface UseAirGenMutationsParams {
  tenant: string;
  project: string;
  mode: 'requirements' | 'diagram';
}

interface ChatParams {
  instruction: string;
  glossary?: string;
  constraints?: string;
  count?: number;
  attachedDocuments?: DocumentAttachment[];
  attachedDiagrams?: DiagramAttachment[];
}

export function useAirGenMutations({ tenant, project, mode }: UseAirGenMutationsParams) {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const chatMutation = useMutation({
    mutationFn: async (params: ChatParams) => {
      if (!tenant || !project) {throw new Error("Select a tenant and project first");}
      if (!params.instruction.trim()) {throw new Error("Enter a stakeholder instruction");}

      return api.airgenChat({
        tenant,
        projectKey: project,
        user_input: params.instruction.trim(),
        glossary: params.glossary?.trim() || undefined,
        constraints: params.constraints?.trim() || undefined,
        n: params.count,
        mode,
        attachedDocuments: params.attachedDocuments && params.attachedDocuments.length > 0 ? params.attachedDocuments : undefined,
        attachedDiagrams: params.attachedDiagrams && params.attachedDiagrams.length > 0 ? params.attachedDiagrams : undefined
      });
    },
    onSuccess: () => {
      if (mode === 'requirements') {
        queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
      }
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (candidate: RequirementCandidate) => {
      if (!tenant || !project) {throw new Error("Select a tenant/project first");}
      return api.rejectRequirementCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
    }
  });

  const returnMutation = useMutation({
    mutationFn: async (candidate: RequirementCandidate) => {
      if (!tenant || !project) {throw new Error("Select a tenant/project first");}
      return api.returnRequirementCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
    }
  });

  const rejectDiagramMutation = useMutation({
    mutationFn: async (candidate: DiagramCandidate) => {
      if (!tenant || !project) {throw new Error("Select a tenant/project first");}
      return api.rejectDiagramCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
    }
  });

  const returnDiagramMutation = useMutation({
    mutationFn: async (candidate: DiagramCandidate) => {
      if (!tenant || !project) {throw new Error("Select a tenant/project first");}
      return api.returnDiagramCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
    }
  });

  const acceptDiagramMutation = useMutation({
    mutationFn: async (params: { candidate: DiagramCandidate; diagramName?: string; diagramDescription?: string }) => {
      if (!tenant || !project) {throw new Error("Select a tenant/project first");}
      return api.acceptDiagramCandidate(params.candidate.id, {
        tenant,
        projectKey: project,
        diagramName: params.diagramName,
        diagramDescription: params.diagramDescription
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
    }
  });

  return {
    chatMutation,
    rejectMutation,
    returnMutation,
    rejectDiagramMutation,
    returnDiagramMutation,
    acceptDiagramMutation
  };
}
