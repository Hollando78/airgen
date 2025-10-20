import { useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "./useTenantProject";

export interface ProjectMetrics {
  totalObjects: number;
  totalRequirements: number;
  totalDocuments: number;
  totalSections: number;
  totalTraceLinks: number;
  totalLinksets: number;
  totalRelationships: number;
  objectTypeCounts: {
    requirement: number;
    info: number;
    surrogate: number;
    candidate: number;
  };
  patternCounts: {
    ubiquitous: number;
    event: number;
    state: number;
    unwanted: number;
    optional: number;
    unspecified: number;
  };
  verificationCounts: {
    Test: number;
    Analysis: number;
    Inspection: number;
    Demonstration: number;
    unspecified: number;
  };
  complianceCounts: {
    "N/A": number;
    Compliant: number;
    "Compliance Risk": number;
    "Non-Compliant": number;
    unspecified: number;
  };
  avgQaScore: number;
  qaDistribution: {
    excellent: number;
    good: number;
    needsWork: number;
    unscored: number;
  };
  tracedRequirements: number;
  untracedRequirements: number;
  archivedCount: number;
  activeCount: number;
}

/**
 * Custom hook for project metrics and data
 *
 * Handles:
 * - Fetching graph data, documents, trace links, baselines
 * - Calculating comprehensive metrics
 * - QA scorer worker status and control
 */
export function useProjectMetrics() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { state } = useTenantProject();

  // Queries
  const baselinesQuery = useQuery({
    queryKey: ["baselines", state.tenant, state.project],
    queryFn: () => api.listBaselines(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const graphDataQuery = useQuery({
    queryKey: ["graph-data", state.tenant, state.project],
    queryFn: () => api.getGraphData(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const documentsQuery = useQuery({
    queryKey: ["documents", state.tenant, state.project],
    queryFn: () => api.listDocuments(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const traceLinksQuery = useQuery({
    queryKey: ["traceLinks", state.tenant, state.project],
    queryFn: () => api.listTraceLinks(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const qaScorerStatusQuery = useQuery({
    queryKey: ["qa-scorer-status"],
    queryFn: api.getQAScorerStatus,
    refetchInterval: (query) => {
      // Poll every 2 seconds while worker is running
      return query.state.data?.isRunning ? 2000 : false;
    }
  });

  // QA Scorer mutations
  const startQAScorerMutation = useMutation({
    mutationFn: ({ tenant, project }: { tenant: string; project: string }) =>
      api.startQAScorer(tenant, project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qa-scorer-status"] });
      queryClient.invalidateQueries({ queryKey: ["graph-data", state.tenant, state.project] });
    }
  });

  const stopQAScorerMutation = useMutation({
    mutationFn: api.stopQAScorer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qa-scorer-status"] });
    }
  });

  // Track when worker completes and invalidate graph data
  useEffect(() => {
    const status = qaScorerStatusQuery.data;
    if (status && !status.isRunning && status.completedAt) {
      // Worker has completed, invalidate graph data to refresh metrics
      queryClient.invalidateQueries({ queryKey: ["graph-data", state.tenant, state.project] });
    }
  }, [qaScorerStatusQuery.data, queryClient, state.tenant, state.project]);

  // Calculate comprehensive metrics
  const metrics = useMemo((): ProjectMetrics => {
    const nodes = graphDataQuery.data?.nodes ?? [];
    const relationships = graphDataQuery.data?.relationships ?? [];
    const traceLinks = traceLinksQuery.data?.traceLinks ?? [];
    const documents = documentsQuery.data?.documents ?? [];

    // Get nodes by type
    const requirementNodes = nodes.filter(n => n.type === 'Requirement');
    const infoNodes = nodes.filter(n => n.type === 'Info');
    const surrogateNodes = nodes.filter(n => n.type === 'SurrogateReference');
    const candidateNodes = nodes.filter(n => n.type === 'RequirementCandidate');
    const documentNodes = nodes.filter(n => n.type === 'Document');
    const sectionNodes = nodes.filter(n => n.type === 'DocumentSection');
    const linksetNodes = nodes.filter(n => n.type === 'DocumentLinkset');
    const traceLinkNodes = nodes.filter(n => n.type === 'TraceLink');

    // Object type distribution
    const objectTypeCounts = {
      requirement: requirementNodes.length,
      info: infoNodes.length,
      surrogate: surrogateNodes.length,
      candidate: candidateNodes.length
    };

    // Filter to only actual requirements (exclude info and surrogate) for detailed metrics
    const actualRequirements = requirementNodes;

    // Pattern distribution (only for actual requirements)
    const patternCounts = {
      ubiquitous: actualRequirements.filter(r => r.properties?.pattern === "ubiquitous").length,
      event: actualRequirements.filter(r => r.properties?.pattern === "event").length,
      state: actualRequirements.filter(r => r.properties?.pattern === "state").length,
      unwanted: actualRequirements.filter(r => r.properties?.pattern === "unwanted").length,
      optional: actualRequirements.filter(r => r.properties?.pattern === "optional").length,
      unspecified: actualRequirements.filter(r => !r.properties?.pattern).length
    };

    // Verification distribution (only for actual requirements)
    const verificationCounts = {
      Test: actualRequirements.filter(r => r.properties?.verification === "Test").length,
      Analysis: actualRequirements.filter(r => r.properties?.verification === "Analysis").length,
      Inspection: actualRequirements.filter(r => r.properties?.verification === "Inspection").length,
      Demonstration: actualRequirements.filter(r => r.properties?.verification === "Demonstration").length,
      unspecified: actualRequirements.filter(r => !r.properties?.verification).length
    };

    // Compliance distribution (only for actual requirements)
    const complianceCounts = {
      "N/A": actualRequirements.filter(r => r.properties?.complianceStatus === "N/A").length,
      Compliant: actualRequirements.filter(r => r.properties?.complianceStatus === "Compliant").length,
      "Compliance Risk": actualRequirements.filter(r => r.properties?.complianceStatus === "Compliance Risk").length,
      "Non-Compliant": actualRequirements.filter(r => r.properties?.complianceStatus === "Non-Compliant").length,
      unspecified: actualRequirements.filter(r => !r.properties?.complianceStatus).length
    };

    // QA Score statistics (only for actual requirements)
    const requirementsWithQA = actualRequirements.filter(r => r.properties?.qaScore !== undefined && r.properties?.qaScore !== null);
    const avgQaScore = requirementsWithQA.length > 0
      ? Math.round(requirementsWithQA.reduce((sum, r) => sum + (r.properties?.qaScore ?? 0), 0) / requirementsWithQA.length)
      : 0;
    const qaDistribution = {
      excellent: actualRequirements.filter(r => (r.properties?.qaScore ?? 0) >= 80).length,
      good: actualRequirements.filter(r => (r.properties?.qaScore ?? 0) >= 60 && (r.properties?.qaScore ?? 0) < 80).length,
      needsWork: actualRequirements.filter(r => (r.properties?.qaScore ?? 0) > 0 && (r.properties?.qaScore ?? 0) < 60).length,
      unscored: actualRequirements.filter(r => !r.properties?.qaScore).length
    };

    // Traceability - count requirements involved in trace links
    // A requirement is traced if it's connected via FROM_REQUIREMENT or TO_REQUIREMENT
    const fromReqRels = relationships.filter(r => r.type === 'FROM_REQUIREMENT');
    const toReqRels = relationships.filter(r => r.type === 'TO_REQUIREMENT');

    // Collect requirement IDs that are targets of FROM_REQUIREMENT or TO_REQUIREMENT
    const tracedIds = new Set([
      ...fromReqRels.map(r => r.target),  // Requirements pointed to by FROM_REQUIREMENT
      ...toReqRels.map(r => r.target)     // Requirements pointed to by TO_REQUIREMENT
    ]);

    const tracedRequirements = actualRequirements.filter(r => tracedIds.has(r.id)).length;
    const untracedRequirements = objectTypeCounts.requirement - tracedRequirements;

    // Archive status (only for actual requirements)
    const archivedCount = actualRequirements.filter(r => r.properties?.archived === true).length;
    const activeCount = objectTypeCounts.requirement - archivedCount;

    return {
      totalObjects: nodes.length,
      totalRequirements: objectTypeCounts.requirement,
      totalDocuments: documentNodes.length,
      totalSections: sectionNodes.length,
      totalTraceLinks: traceLinkNodes.length,
      totalLinksets: linksetNodes.length,
      totalRelationships: relationships.length,
      objectTypeCounts,
      patternCounts,
      verificationCounts,
      complianceCounts,
      avgQaScore,
      qaDistribution,
      tracedRequirements,
      untracedRequirements,
      archivedCount,
      activeCount
    };
  }, [graphDataQuery.data, traceLinksQuery.data, documentsQuery.data]);

  // Baseline calculations
  const latestBaseline = baselinesQuery.data?.items?.[0];
  const latestBaselineRequirementCount =
    latestBaseline?.requirementRefs?.length ??
    latestBaseline?.requirementVersionCount ??
    0;

  return {
    // Queries
    baselinesQuery,
    graphDataQuery,
    documentsQuery,
    traceLinksQuery,
    qaScorerStatusQuery,

    // Mutations
    startQAScorerMutation,
    stopQAScorerMutation,

    // Computed data
    metrics,
    latestBaseline,
    latestBaselineRequirementCount
  };
}
