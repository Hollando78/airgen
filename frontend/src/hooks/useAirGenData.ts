import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "./useTenantProject";
import { useApiClient } from "../lib/client";
import type { RequirementCandidate, DocumentAttachment, DiagramAttachment, DiagramCandidate } from "../types";

export function useAirGenData() {
  const { state } = useTenantProject();
  const api = useApiClient();
  const queryClient = useQueryClient();

  // Form state
  const [instruction, setInstruction] = useState("");
  const [glossary, setGlossary] = useState("");
  const [constraints, setConstraints] = useState("");
  const [count, setCount] = useState(5);
  const [attachedDocuments, setAttachedDocuments] = useState<DocumentAttachment[]>([]);
  const [attachedDiagrams, setAttachedDiagrams] = useState<DiagramAttachment[]>([]);
  const [mode, setMode] = useState<'requirements' | 'diagram'>('requirements');

  // UI state
  const [selectedCandidate, setSelectedCandidate] = useState<RequirementCandidate | null>(null);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [selectedDiagramCandidate, setSelectedDiagramCandidate] = useState<DiagramCandidate | null>(null);
  const [showAcceptDiagramModal, setShowAcceptDiagramModal] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [textFilter, setTextFilter] = useState('');

  // Track which specific diagram candidate is being processed
  const [acceptingDiagramId, setAcceptingDiagramId] = useState<string | null>(null);
  const [rejectingDiagramId, setRejectingDiagramId] = useState<string | null>(null);
  const [returningDiagramId, setReturningDiagramId] = useState<string | null>(null);

  const tenant = state.tenant ?? "";
  const project = state.project ?? "";

  // Queries
  const candidatesQuery = useQuery({
    queryKey: ["airgen", "candidates", "grouped", tenant, project],
    queryFn: () => api.listRequirementCandidatesGrouped(tenant, project),
    enabled: Boolean(tenant && project && mode === 'requirements')
  });

  const diagramCandidatesQuery = useQuery({
    queryKey: ["airgen", "diagram-candidates", tenant, project],
    queryFn: () => api.listDiagramCandidates(tenant, project),
    enabled: Boolean(tenant && project && mode === 'diagram')
  });

  // Mutations
  const chatMutation = useMutation({
    mutationFn: async () => {
      if (!tenant || !project) { throw new Error("Select a tenant and project first"); }
      if (!instruction.trim()) { throw new Error("Enter a stakeholder instruction"); }
      return api.airgenChat({
        tenant,
        projectKey: project,
        user_input: instruction.trim(),
        glossary: glossary.trim() || undefined,
        constraints: constraints.trim() || undefined,
        n: count,
        mode,
        attachedDocuments: attachedDocuments.length > 0 ? attachedDocuments : undefined,
        attachedDiagrams: attachedDiagrams.length > 0 ? attachedDiagrams : undefined
      });
    },
    onSuccess: () => {
      if (mode === 'requirements') {
        queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
      }
      setInstruction("");
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (candidate: RequirementCandidate) => {
      if (!tenant || !project) { throw new Error("Select a tenant/project first"); }
      return api.rejectRequirementCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
    }
  });

  const returnMutation = useMutation({
    mutationFn: async (candidate: RequirementCandidate) => {
      if (!tenant || !project) { throw new Error("Select a tenant/project first"); }
      return api.returnRequirementCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
    }
  });

  const rejectDiagramMutation = useMutation({
    mutationFn: async (candidate: DiagramCandidate) => {
      if (!tenant || !project) { throw new Error("Select a tenant/project first"); }
      return api.rejectDiagramCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
    },
    onSettled: () => { setRejectingDiagramId(null); }
  });

  const returnDiagramMutation = useMutation({
    mutationFn: async (candidate: DiagramCandidate) => {
      if (!tenant || !project) { throw new Error("Select a tenant/project first"); }
      return api.returnDiagramCandidate(candidate.id, { tenant, projectKey: project });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
    },
    onSettled: () => { setReturningDiagramId(null); }
  });

  const acceptDiagramMutation = useMutation({
    mutationFn: async (params: { candidate: DiagramCandidate; mode: "new" | "update"; targetDiagramId?: string; diagramName?: string; diagramDescription?: string }) => {
      if (!tenant || !project) { throw new Error("Select a tenant/project first"); }
      return api.acceptDiagramCandidate(params.candidate.id, {
        tenant,
        projectKey: project,
        diagramId: params.mode === "update" ? params.targetDiagramId : undefined,
        diagramName: params.mode === "new" ? params.diagramName : undefined,
        diagramDescription: params.mode === "new" ? params.diagramDescription : undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "diagram-candidates", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["architecture", "diagrams", tenant, project] });
      setShowAcceptDiagramModal(false);
      setSelectedDiagramCandidate(null);
    },
    onSettled: () => { setAcceptingDiagramId(null); }
  });

  const archiveGroupMutation = useMutation({
    mutationFn: async (candidateIds: string[]) => {
      if (!tenant || !project) { throw new Error("Select a tenant/project first"); }
      return api.archiveCandidates(candidateIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
    }
  });

  // Computed values
  const candidateGroups = useMemo(() => {
    let groups = candidatesQuery.data?.groups ?? [];

    if (textFilter.trim()) {
      const filterText = textFilter.toLowerCase();
      groups = groups.filter(group => {
        const promptMatch = group.prompt?.toLowerCase().includes(filterText);
        const candidateMatch = group.candidates.some(candidate =>
          candidate.text.toLowerCase().includes(filterText)
        );
        return promptMatch || candidateMatch;
      });
    }

    return [...groups].sort((a, b) => {
      const aTime = new Date(a.candidates[0]?.createdAt || 0).getTime();
      const bTime = new Date(b.candidates[0]?.createdAt || 0).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [candidatesQuery.data, textFilter, sortOrder]);

  // Auto-collapse older groups
  useEffect(() => {
    if (candidateGroups.length > 1) {
      setCollapsedGroups(new Set(candidateGroups.slice(1).map(group => group.sessionId)));
    } else if (candidateGroups.length === 1) {
      setCollapsedGroups(new Set());
    }
  }, [candidateGroups]);

  // Handlers
  const toggleGroupCollapse = (sessionId: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) { newSet.delete(sessionId); } else { newSet.add(sessionId); }
      return newSet;
    });
  };

  const handleAcceptClick = (candidate: RequirementCandidate) => {
    setSelectedCandidate(candidate);
    setShowAcceptModal(true);
  };

  const handleGenerate = (event: React.FormEvent) => {
    event.preventDefault();
    chatMutation.mutate();
  };

  const handleAcceptDiagramClick = (candidate: DiagramCandidate) => {
    setSelectedDiagramCandidate(candidate);
    setShowAcceptDiagramModal(true);
  };

  const handleRejectDiagramClick = (candidate: DiagramCandidate) => {
    if (rejectingDiagramId === candidate.id) return;
    setRejectingDiagramId(candidate.id);
    rejectDiagramMutation.mutate(candidate);
  };

  const handleReturnDiagramClick = (candidate: DiagramCandidate) => {
    if (returningDiagramId === candidate.id) return;
    setReturningDiagramId(candidate.id);
    returnDiagramMutation.mutate(candidate);
  };

  const handleAcceptDiagramConfirm = (params: { candidate: DiagramCandidate; mode: "new" | "update"; targetDiagramId?: string; diagramName?: string; diagramDescription?: string }) => {
    setAcceptingDiagramId(params.candidate.id);
    acceptDiagramMutation.mutate(params);
  };

  const closeAcceptModal = () => {
    setShowAcceptModal(false);
    setSelectedCandidate(null);
  };

  const closeAcceptDiagramModal = () => {
    setShowAcceptDiagramModal(false);
    setSelectedDiagramCandidate(null);
  };

  const onAccepted = () => {
    setSelectedCandidate(null);
    queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
  };

  return {
    // Workspace
    tenant,
    project,
    disabled: !tenant || !project,

    // Form
    mode, setMode,
    instruction, setInstruction,
    glossary, setGlossary,
    constraints, setConstraints,
    count, setCount,
    attachedDocuments, setAttachedDocuments,
    attachedDiagrams, setAttachedDiagrams,

    // Queries
    candidatesQuery,
    diagramCandidatesQuery,
    candidateGroups,

    // Mutations
    chatMutation,
    rejectMutation,
    returnMutation,
    archiveGroupMutation,
    acceptDiagramMutation,
    rejectDiagramMutation,
    returnDiagramMutation,

    // UI state
    collapsedGroups,
    textFilter, setTextFilter,
    sortOrder, setSortOrder,
    showAcceptModal,
    selectedCandidate,
    showAcceptDiagramModal,
    selectedDiagramCandidate,
    acceptingDiagramId,
    rejectingDiagramId,
    returningDiagramId,

    // Handlers
    handleGenerate,
    handleAcceptClick,
    toggleGroupCollapse,
    handleAcceptDiagramClick,
    handleRejectDiagramClick,
    handleReturnDiagramClick,
    handleAcceptDiagramConfirm,
    closeAcceptModal,
    closeAcceptDiagramModal,
    onAccepted,
  };
}
