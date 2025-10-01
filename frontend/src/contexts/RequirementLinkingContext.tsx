import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import type { RequirementRecord, TraceLinkType } from "../types";

interface LinkingState {
  sourceRequirement: RequirementRecord | null;
  isLinking: boolean;
}

interface RequirementLinkingContextType {
  linkingState: LinkingState;
  startLinking: (requirement: RequirementRecord) => void;
  cancelLinking: () => void;
  completeLinking: (targetRequirement: RequirementRecord, linkType: TraceLinkType, description?: string) => Promise<void>;
  isRequirementBeingLinked: (requirementId: string) => boolean;
}

const RequirementLinkingContext = createContext<RequirementLinkingContextType | null>(null);

export function RequirementLinkingProvider({ children }: { children: ReactNode }) {
  const [linkingState, setLinkingState] = useState<LinkingState>({
    sourceRequirement: null,
    isLinking: false
  });
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const startLinking = (requirement: RequirementRecord) => {
    setLinkingState({
      sourceRequirement: requirement,
      isLinking: true
    });
  };

  const cancelLinking = () => {
    setLinkingState({
      sourceRequirement: null,
      isLinking: false
    });
  };

  const completeLinking = async (
    targetRequirement: RequirementRecord, 
    linkType: TraceLinkType, 
    description?: string
  ) => {
    if (!linkingState.sourceRequirement) {
      throw new Error("No source requirement selected for linking");
    }

    try {
      // Use tenant and project directly from the source requirement record
      const tenant = linkingState.sourceRequirement.tenant;
      const projectKey = linkingState.sourceRequirement.projectKey;

      // Create the trace link via API
      await apiClient.createTraceLink({
        tenant,
        projectKey,
        sourceRequirementId: linkingState.sourceRequirement.id,
        targetRequirementId: targetRequirement.id,
        linkType,
        description
      });

      // Invalidate relevant queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ['traceLinks'] });
      await queryClient.invalidateQueries({ queryKey: ['requirements'] });
      await queryClient.invalidateQueries({ queryKey: ['document-requirements'] });

      // Reset linking state after successful creation
      setLinkingState({
        sourceRequirement: null,
        isLinking: false
      });
    } catch (error) {
      console.error("Failed to create trace link:", error);
      throw error;
    }
  };

  const isRequirementBeingLinked = (requirementId: string) => {
    return linkingState.sourceRequirement?.id === requirementId;
  };

  return (
    <RequirementLinkingContext.Provider
      value={{
        linkingState,
        startLinking,
        cancelLinking,
        completeLinking,
        isRequirementBeingLinked
      }}
    >
      {children}
    </RequirementLinkingContext.Provider>
  );
}

export function useRequirementLinking() {
  const context = useContext(RequirementLinkingContext);
  if (!context) {
    throw new Error("useRequirementLinking must be used within a RequirementLinkingProvider");
  }
  return context;
}