import { useState, useCallback } from "react";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { DocumentTree } from "../components/Trace/DocumentTree";
import { VisualLinksArea } from "../components/Trace/VisualLinksArea";
import { RequirementContextMenu } from "../components/RequirementContextMenu";
import { LinkTypeSelectionModal } from "../components/LinkTypeSelectionModal";
import { CopyAndLinkModal } from "../components/CopyAndLinkModal";
import { DeleteConfirmationModal } from "../components/DeleteConfirmationModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { useLinksetSelection } from "./LinksRoute/useLinksetSelection";
import { useTraceLinkMutations } from "./LinksRoute/useTraceLinkMutations";
import { useDragAndDrop } from "./LinksRoute/useDragAndDrop";
import type {
  DocumentRecord,
  RequirementRecord,
  TraceLinkType
} from "../types";

export function LinksRoute(): JSX.Element {
  const { state: { tenant, project } } = useTenantProject();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  // Early return BEFORE other hooks to avoid React error #185
  if (!tenant || !project) {
    return (
      <div className="p-6 space-y-6 min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Trace Links</CardTitle>
            <CardDescription>Select a tenant and project first.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // State for UI elements
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    requirement: RequirementRecord | null;
  }>({ isOpen: false, x: 0, y: 0, requirement: null });

  const [linkingState, setLinkingState] = useState<{
    sourceRequirement: RequirementRecord | null;
    isLinking: boolean;
  }>({ sourceRequirement: null, isLinking: false });

  const [linkModal, setLinkModal] = useState<{
    sourceRequirement: RequirementRecord;
    targetRequirement: RequirementRecord;
  } | null>(null);

  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [targetFilter, setTargetFilter] = useState<string>("");
  const [copyLinkModal, setCopyLinkModal] = useState<{
    sourceRequirement: RequirementRecord;
    targetSectionId: string;
    targetDocument: DocumentRecord;
  } | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<RequirementRecord | null>(null);

  // Shared state for collapsed sections (enables visual links to re-render on collapse/expand)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Fetch linksets
  const linksetsQuery = useQuery({
    queryKey: ["linksets", tenant, project],
    queryFn: () => apiClient.listLinksets(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Fetch trace links
  const traceLinksQuery = useQuery({
    queryKey: ["trace-links", tenant, project],
    queryFn: () => apiClient.listTraceLinks(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Use custom hooks
  const { selectedLinksetId, setSelectedLinksetId } = useLinksetSelection({
    tenant,
    project,
    linksets: linksetsQuery.data?.linksets
  });

  const {
    createTraceLinkMutation,
    archiveMutation,
    unarchiveMutation,
    deleteMutation
  } = useTraceLinkMutations({ tenant, project });

  // Get selected linkset
  const selectedLinkset = React.useMemo(() => {
    if (!selectedLinksetId || !linksetsQuery.data?.linksets) {
      return null;
    }
    return linksetsQuery.data.linksets.find(ls => ls.id === selectedLinksetId) || null;
  }, [selectedLinksetId, linksetsQuery.data?.linksets]);

  // Drag and drop handlers
  const handleRequestLink = useCallback((source: RequirementRecord, target: RequirementRecord) => {
    setLinkModal({
      sourceRequirement: source,
      targetRequirement: target
    });
  }, []);

  const handleRequestCopyLink = useCallback((
    source: RequirementRecord,
    targetSectionId: string,
    targetDocument: DocumentRecord
  ) => {
    setCopyLinkModal({
      sourceRequirement: source,
      targetSectionId,
      targetDocument
    });
  }, []);

  const {
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDropOnSection
  } = useDragAndDrop({
    onRequestLink: handleRequestLink,
    onRequestCopyLink: handleRequestCopyLink,
    selectedLinkset
  });

  // Requirement mutation handlers
  const handleArchive = useCallback((requirementId: string) => {
    archiveMutation.mutate(requirementId);
  }, [archiveMutation]);

  const handleUnarchive = useCallback((requirementId: string) => {
    unarchiveMutation.mutate(requirementId);
  }, [unarchiveMutation]);

  const handleRequestDelete = useCallback((requirement: RequirementRecord) => {
    setDeleteConfirmModal(requirement);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmModal) return;
    deleteMutation.mutate(deleteConfirmModal.id);
    setDeleteConfirmModal(null);
  }, [deleteConfirmModal, deleteMutation]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmModal(null);
  }, []);

  // Linking handlers
  const handleStartLink = useCallback(() => {
    if (contextMenu.requirement) {
      setLinkingState({
        sourceRequirement: contextMenu.requirement,
        isLinking: true
      });
      setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null });
    }
  }, [contextMenu.requirement]);

  const handleLinkFromStart = useCallback(() => {
    if (linkingState.sourceRequirement && contextMenu.requirement) {
      setLinkModal({
        sourceRequirement: linkingState.sourceRequirement,
        targetRequirement: contextMenu.requirement
      });
      setLinkingState({ sourceRequirement: null, isLinking: false });
      setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null });
    }
  }, [linkingState.sourceRequirement, contextMenu.requirement]);

  const handleCreateLink = useCallback(async (linkType: TraceLinkType, description?: string) => {
    if (!linkModal) {
      return;
    }

    await createTraceLinkMutation.mutateAsync({
      sourceRequirementId: linkModal.sourceRequirement.id,
      targetRequirementId: linkModal.targetRequirement.id,
      linkType,
      description
    });
    setLinkModal(null);
    setLinkingState({ sourceRequirement: null, isLinking: false });
  }, [linkModal, createTraceLinkMutation]);

  const handleCancelLink = useCallback(() => {
    setLinkModal(null);
    setLinkingState({ sourceRequirement: null, isLinking: false });
  }, []);

  const handleCopyAndLink = useCallback(async () => {
    if (!copyLinkModal || !tenant || !project || !selectedLinkset) return;

    const { sourceRequirement, targetSectionId, targetDocument } = copyLinkModal;

    try {
      // Step 1: Create a copy of the requirement in the target section
      const createResponse = await apiClient.createRequirement({
        tenant,
        projectKey: project,
        documentSlug: targetDocument.slug,
        sectionId: targetSectionId,
        text: sourceRequirement.text,
        pattern: sourceRequirement.pattern,
        verification: sourceRequirement.verification,
        attributes: sourceRequirement.attributes || {}
      });

      const copiedRequirement = createResponse.requirement;

      // Step 2: Create a trace link between source and copied requirement
      const linkType = selectedLinkset.defaultLinkType || "satisfies";

      await apiClient.createTraceLink(tenant, project, {
        sourceRequirementId: sourceRequirement.id,
        targetRequirementId: copiedRequirement.id,
        linkType,
        description: `Auto-linked from copy operation`
      });

      // Step 3: Invalidate queries to refresh the UI
      await queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      await queryClient.invalidateQueries({ queryKey: ["sections-with-relations", tenant, project] });
      await queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });

      setCopyLinkModal(null);
    } catch (error) {
      console.error('Failed to copy and link requirement:', error);
      throw error;
    }
  }, [copyLinkModal, tenant, project, selectedLinkset, apiClient, queryClient]);

  const handleCancelCopyLink = useCallback(() => {
    setCopyLinkModal(null);
  }, []);

  const handleRequirementSelect = useCallback((requirement: RequirementRecord, isMultiSelect: boolean) => {
    setSelectedRequirements(prev => {
      const newSet = new Set(prev);
      if (isMultiSelect) {
        if (newSet.has(requirement.id)) {
          newSet.delete(requirement.id);
        } else {
          newSet.add(requirement.id);
        }
      } else {
        newSet.clear();
        newSet.add(requirement.id);
      }
      return newSet;
    });
  }, []);

  const handleContextMenu = useCallback((requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      requirement
    });
  }, []);

  // Loading and error states
  if (linksetsQuery.isLoading || traceLinksQuery.isLoading) {
    return <Spinner />;
  }

  if (linksetsQuery.error || traceLinksQuery.error) {
    return <ErrorState message="Failed to load trace links" />;
  }

  // Main UI
  return (
    <div className="p-6 space-y-6 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle>Trace Links</CardTitle>
          <CardDescription>
            View and manage relationships between requirements across documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Select Document Linkset</Label>
              <Select value={selectedLinksetId} onValueChange={setSelectedLinksetId}>
                <SelectTrigger className="h-10 mt-2">
                  <SelectValue placeholder="Choose a linkset to view..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] bg-white border border-gray-200 shadow-lg">
                  {linksetsQuery.isLoading ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading linksets...</div>
                  ) : linksetsQuery.error ? (
                    <div className="p-2 text-sm text-destructive">Error loading linksets</div>
                  ) : linksetsQuery.data?.linksets.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No linksets available</div>
                  ) : (
                    linksetsQuery.data?.linksets.map(linkset => (
                      <SelectItem key={linkset.id} value={linkset.id} className="cursor-pointer">
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{linkset.sourceDocument.name}</span>
                            <span className="text-xs font-bold text-blue-600">→</span>
                            <span className="font-medium text-sm">{linkset.targetDocument.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {linkset.linkCount} link{linkset.linkCount !== 1 ? 's' : ''} • Directional linkset
                          </div>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedLinkset && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-sm font-medium text-blue-900 flex items-center gap-2">
                  <span>{selectedLinkset.sourceDocument.name}</span>
                  <span className="text-base font-bold text-blue-600">→</span>
                  <span>{selectedLinkset.targetDocument.name}</span>
                </div>
                <div className="text-xs text-blue-700 mt-1">
                  {selectedLinkset.linkCount} trace link{selectedLinkset.linkCount !== 1 ? 's' : ''} between these documents
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedLinkset && (
        <div className="desktop-three-columns" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
          {/* Source Document Panel */}
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="pb-2 flex-shrink-0">
              <CardTitle className="text-base">{selectedLinkset.sourceDocument.name}</CardTitle>
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Filter requirements..."
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
              <div className="document-panel left-panel h-full overflow-y-auto">
                <DocumentTree
                  document={selectedLinkset.sourceDocument}
                  selectedRequirements={selectedRequirements}
                  onRequirementSelect={handleRequirementSelect}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDropOnSection={handleDropOnSection}
                  traceLinks={traceLinksQuery.data?.traceLinks || []}
                  documentSide="left"
                  filter={sourceFilter}
                  collapsedSections={collapsedSections}
                  onToggleCollapse={setCollapsedSections}
                />
              </div>
            </CardContent>
          </Card>

          {/* Visual Links Panel */}
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-base">Visual Links</CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
              <div className="linking-panel h-full relative overflow-auto">
                <VisualLinksArea
                  traceLinks={selectedLinkset.links.map(link => ({
                    id: link.id,
                    sourceRequirementId: link.sourceRequirementId,
                    targetRequirementId: link.targetRequirementId,
                    linkType: link.linkType,
                    description: link.description,
                    createdAt: link.createdAt,
                    updatedAt: link.updatedAt,
                    sourceRequirement: {} as any,
                    targetRequirement: {} as any
                  }))}
                  leftDocument={selectedLinkset.sourceDocument}
                  rightDocument={selectedLinkset.targetDocument}
                  collapsedSections={collapsedSections}
                  onDeleteLink={(linkId) => {
                    // TODO: Implement linkset link deletion
                    console.log('Delete link from linkset:', linkId);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Target Document Panel */}
          <Card className="h-full flex flex-col overflow-hidden">
            <CardHeader className="pb-2 flex-shrink-0">
              <CardTitle className="text-base">{selectedLinkset.targetDocument.name}</CardTitle>
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Filter requirements..."
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
              <div className="document-panel right-panel h-full overflow-y-auto">
                <DocumentTree
                  document={selectedLinkset.targetDocument}
                  selectedRequirements={selectedRequirements}
                  onRequirementSelect={handleRequirementSelect}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onDropOnSection={handleDropOnSection}
                  traceLinks={traceLinksQuery.data?.traceLinks || []}
                  documentSide="right"
                  filter={targetFilter}
                  collapsedSections={collapsedSections}
                  onToggleCollapse={setCollapsedSections}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modals and Context Menus */}
      {contextMenu.isOpen && contextMenu.requirement && (
        <RequirementContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          requirement={contextMenu.requirement}
          tenant={tenant}
          project={project}
          onClose={() => setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null })}
          onStartLink={handleStartLink}
          onEndLink={handleLinkFromStart}
          onCancelLink={() => setLinkingState({ sourceRequirement: null, isLinking: false })}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          onRequestDelete={handleRequestDelete}
          linkingRequirement={linkingState.sourceRequirement}
          traceLinks={traceLinksQuery.data?.traceLinks || []}
        />
      )}

      {linkModal && (
        <LinkTypeSelectionModal
          isOpen={true}
          sourceRequirement={linkModal.sourceRequirement}
          targetRequirement={linkModal.targetRequirement}
          onConfirm={handleCreateLink}
          onCancel={handleCancelLink}
        />
      )}

      {copyLinkModal && (
        <CopyAndLinkModal
          isOpen={true}
          sourceRequirement={copyLinkModal.sourceRequirement}
          targetDocument={copyLinkModal.targetDocument}
          targetSectionId={copyLinkModal.targetSectionId}
          onConfirm={handleCopyAndLink}
          onCancel={handleCancelCopyLink}
        />
      )}

      {deleteConfirmModal && (
        <DeleteConfirmationModal
          isOpen={true}
          requirement={deleteConfirmModal}
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </div>
  );
}
