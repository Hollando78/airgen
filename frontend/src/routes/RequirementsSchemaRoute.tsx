/**
 * Requirements Schema Route - Main Orchestrator
 *
 * Coordinates custom hooks and components for the requirements schema view
 */

import { useCallback, useMemo } from "react";
import { MarkerType, type Edge } from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { useAuth } from "../contexts/AuthContext";
import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { DiagramCanvas } from "../components/diagram/DiagramCanvas";
import { BlockDetailsPanel } from "../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../components/architecture/ConnectorDetailsPanel";
import { LinksetManagementPanel } from "../components/architecture/LinksetManagementPanel";
import { RequirementsSchemaToolbar } from "../components/requirements-schema/RequirementsSchemaToolbar";
import { CreateDiagramDialog } from "../components/requirements-schema/CreateDiagramDialog";
import { useRequirementsSchemaData } from "../hooks/requirements-schema/useRequirementsSchemaData";
import { useRequirementsSchemaState } from "../hooks/requirements-schema/useRequirementsSchemaState";
import { useViewportPersistence } from "../hooks/requirements-schema/useViewportPersistence";
import { useRequirementsSchemaActions } from "../hooks/requirements-schema/useRequirementsSchemaActions";
import { DOCUMENT_BLOCK_PRESET, LINK_TYPE_LABELS } from "../types/requirements-schema";
import { toast } from "sonner";
import type { ArchitectureState, SysmlBlock, SysmlConnector } from "../hooks/useArchitectureApi";

export function RequirementsSchemaRoute(): JSX.Element {
  const { state } = useTenantProject();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { openFloatingDocument } = useFloatingDocuments();

  const tenant = state.tenant ?? "";
  const project = state.project ?? "";

  // Early return BEFORE other hooks to avoid React error #185
  if (!tenant || !project) {
    return (
      <div className="architecture-shell">
        <div className="p-6">
          <div className="bg-white border rounded-lg p-6">
            <h2 className="text-xl font-semibold">Requirements Schema</h2>
            <p className="text-sm text-gray-600 mt-1">Select a tenant and project to view the requirements schema</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is admin
  const isAdmin = user?.roles?.includes("admin") ?? false;

  // Use custom hooks for data, state, viewport, and actions
  const data = useRequirementsSchemaData(tenant, project, null); // Pass null initially for activeDiagramId
  const uiState = useRequirementsSchemaState(data.diagrams);
  const viewport = useViewportPersistence(data.diagrams, uiState.activeDiagramId);

  // Re-fetch diagram content when active diagram changes
  const diagramData = useRequirementsSchemaData(tenant, project, uiState.activeDiagramId);

  const actions = useRequirementsSchemaActions(
    tenant,
    project,
    uiState.activeDiagramId,
    data.documentsIndex,
    diagramData.blockIndex,
    diagramData.resolveDocumentSlug,
    uiState.setPendingLinksetCreation,
    uiState.resetCreateDialogForm,
    uiState.setActiveDiagramId,
    uiState.setShowCreateDialog
  );

  const activeDiagram = useMemo(() =>
    data.diagrams.find(diagram => diagram.id === uiState.activeDiagramId) ?? null,
    [data.diagrams, uiState.activeDiagramId]
  );

  // Helper for opening diagrams in floating windows
  const openFloatingDiagram = useCallback((params: {
    diagramName: string;
    diagramId: string;
    nodes: any[];
    edges: any[];
    viewport: { x: number; y: number; zoom: number };
  }) => {
    openFloatingDocument({
      documentSlug: params.diagramId,
      documentName: params.diagramName,
      tenant,
      project,
      kind: "diagram",
      diagramNodes: params.nodes,
      diagramEdges: params.edges,
      diagramViewport: params.viewport
    });
  }, [tenant, project, openFloatingDocument]);

  // Create architecture state for DiagramCanvas
  const architecture = useMemo<ArchitectureState>(() => ({
    blocks: diagramData.blocks,
    connectors: diagramData.connectors,
    lastModified: new Date(Date.now()).toISOString()
  }), [diagramData.blocks, diagramData.connectors]);

  // Document block preset for requirements schema
  const documentBlockPresets = [{
    label: "Document",
    kind: DOCUMENT_BLOCK_PRESET.kind,
    stereotype: DOCUMENT_BLOCK_PRESET.stereotype,
    description: "Document block for requirements schema"
  }];

  // Placement function for new blocks
  const computeBlockPlacement = (blockCount: number) => {
    const cols = Math.ceil(Math.sqrt(blockCount + 1));
    const row = Math.floor(blockCount / cols);
    const col = blockCount % cols;
    return {
      x: 50 + col * 300,
      y: 50 + row * 200
    };
  };

  // Stub functions for DiagramCanvas (not used in requirements schema)
  const handleAddBlock = () => null;
  const handleReuseBlock = () => null;
  const handleAddPort = () => {};
  const handleUpdatePort = () => {};
  const handleRemovePort = () => {};
  
  // Map connector to ReactFlow edge with linkset label resolution
  const mapConnectorToEdge = useCallback((connector: SysmlConnector): Edge => {
    const strokeColor = connector.color ?? "#2563eb";
    const strokeWidth = connector.strokeWidth ?? 2;
    let strokeDasharray: string | undefined;
    if (connector.linePattern === "dashed") {
      strokeDasharray = "8 4";
    } else if (connector.linePattern === "dotted") {
      strokeDasharray = "2 2";
    }

    // Look up the linkset to get the default link type label
    const standardLabels = new Set(Object.values(LINK_TYPE_LABELS));
    const isStandardLabel = !connector.label || connector.label === "traces to" || standardLabels.has(connector.label);

    let label = connector.label || "traces to";

    if (isStandardLabel) {
      // Resolve document slugs from source and target block IDs
      const sourceSlug = diagramData.resolveDocumentSlug(connector.source);
      const targetSlug = diagramData.resolveDocumentSlug(connector.target);

      if (sourceSlug && targetSlug && data.linksetsQuery.data?.linksets) {
        // Find matching linkset (check both directions)
        const linkset = data.linksetsQuery.data.linksets.find(ls =>
          (ls.sourceDocumentSlug === sourceSlug && ls.targetDocumentSlug === targetSlug) ||
          (ls.sourceDocumentSlug === targetSlug && ls.targetDocumentSlug === sourceSlug)
        );

        if (linkset?.defaultLinkType) {
          label = LINK_TYPE_LABELS[linkset.defaultLinkType] || "traces to";
        }
      }
    }

    return {
      id: connector.id,
      source: connector.source,
      target: connector.target,
      type: connector.lineStyle ?? "smoothstep",
      animated: true,
      label,
      style: {
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: 20,
        height: 20
      },
      data: {
        documentIds: connector.documentIds || [],
        originalLabel: label,
        labelOffsetX: connector.labelOffsetX ?? 0,
        labelOffsetY: connector.labelOffsetY ?? 0,
        onUpdateLabelOffset: async (offsetX: number, offsetY: number) => {
          if (!uiState.activeDiagramId) return;
          try {
            await api.updateArchitectureConnector(
              tenant,
              project,
              connector.id,
              {
                diagramId: uiState.activeDiagramId,
                labelOffsetX: offsetX,
                labelOffsetY: offsetY
              }
            );
            queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
          } catch (error) {
            console.error("Failed to update label offset:", error);
          }
        }
      }
    } satisfies Edge;
  }, [tenant, project, api, queryClient, uiState.activeDiagramId, diagramData, data.linksetsQuery.data]);
  
  return (
    <div className="architecture-shell">
      <RequirementsSchemaToolbar
        project={project}
        diagrams={data.diagrams}
        activeDiagramId={uiState.activeDiagramId}
        onDiagramChange={uiState.setActiveDiagramId}
        onCreateClick={() => uiState.setShowCreateDialog(true)}
      />

      <div className="architecture-body">
        {/* Left Sidebar - Document Browser */}
        <aside className="architecture-pane palette-pane">
          <div className="p-4 border-b">
            <h2 className="font-medium">Documents</h2>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-2">
              {data.documentsQuery.data?.documents.filter(doc => doc.kind === "structured").map(doc => (
                <div
                  key={doc.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("documentId", doc.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-move hover:bg-amber-100 transition-colors"
                >
                  <div className="font-medium text-sm text-amber-900">{doc.name}</div>
                  <div className="text-xs text-amber-700 mt-1">{doc.kind}</div>
                  {doc.requirementCount !== undefined && (
                    <div className="text-xs text-amber-600 mt-1">
                      {doc.requirementCount} requirements
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {activeDiagram ? (
          <DiagramCanvas
            tenant={tenant}
            project={project}
            architecture={architecture}
            activeDiagram={activeDiagram}
            activeDiagramId={uiState.activeDiagramId}
            documents={data.documentsQuery.data?.documents || []}
            selectedBlockId={uiState.selectedBlockId}
            selectedConnectorId={uiState.selectedConnectorId}
            onSelectBlock={uiState.handleBlockSelect}
            onSelectConnector={uiState.handleConnectorSelect}
            blockPresets={documentBlockPresets}
            computePlacement={computeBlockPlacement}
            addBlock={handleAddBlock}
            reuseBlock={handleReuseBlock}
            updateBlock={actions.handleUpdateBlock}
            updateBlockPosition={actions.handleUpdateBlockPosition}
            updateBlockSize={actions.handleUpdateBlockSize}
            removeBlock={actions.handleRemoveBlock}
            addPort={handleAddPort}
            updatePort={handleUpdatePort}
            removePort={handleRemovePort}
            addConnector={actions.addConnector}
            updateConnector={actions.handleUpdateConnector}
            removeConnector={actions.handleRemoveConnector}
            onOpenDocument={(documentSlug) => {
              const document = data.documentsQuery.data?.documents.find(d => d.slug === documentSlug);
              if (document) {
                openFloatingDocument({
                  documentSlug: document.slug,
                  documentName: document.name,
                  tenant,
                  project,
                  kind: document.kind
                });
              }
            }}
            onOpenFloatingDiagram={openFloatingDiagram}
            isLoading={diagramData.isLoadingContent}
            mapConnectorToEdge={mapConnectorToEdge}
            onDropDocument={actions.addDocumentBlock}
            viewport={viewport.currentViewport}
            onViewportChange={viewport.handleViewportChange}
          />
        ) : (
          <div className="architecture-canvas-placeholder">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Requirements Schema Yet
              </h3>
              <p className="text-gray-600 mb-4">
                Create a new diagram to start mapping document relationships
              </p>
              <button className="ghost-button" onClick={() => uiState.setShowCreateDialog(true)}>
                + Create Requirements Schema
              </button>
            </div>
          </div>
        )}

        {/* Right Sidebar - Details Panel */}
        <aside className="architecture-pane inspector-pane">
          {uiState.selectedBlockId && (
            <BlockDetailsPanel
              block={diagramData.blocks.find(b => b.id === uiState.selectedBlockId)}
              onUpdate={(updates) => actions.handleUpdateBlock(uiState.selectedBlockId!, updates)}
              onRemove={() => actions.handleRemoveBlock(uiState.selectedBlockId!)}
              documents={data.documentsQuery.data?.documents || []}
              onAddDocument={() => {}}
              onRemoveDocument={() => {}}
            />
          )}

          {uiState.selectedConnectorId && (
            <ConnectorDetailsPanel
              connector={diagramData.connectors.find(c => c.id === uiState.selectedConnectorId)}
              onUpdate={(updates) => actions.handleUpdateConnector(uiState.selectedConnectorId!, updates)}
              onRemove={() => actions.handleRemoveConnector(uiState.selectedConnectorId!)}
            />
          )}

          {!uiState.selectedBlockId && !uiState.selectedConnectorId && (
            <>
              <div className="architecture-hint">
                <h3>Requirements Schema</h3>
                <ul>
                  <li>Drag documents from the left panel to create document blocks.</li>
                  <li>Create linksets below to enable connector creation.</li>
                  <li>Connect documents to show trace relationships.</li>
                </ul>
              </div>
              <LinksetManagementPanel
                linksets={data.linksetsQuery.data?.linksets ?? []}
                documents={data.documentsQuery.data?.documents ?? []}
                onCreateLinkset={actions.handleCreateLinkset}
                onUpdateLinkset={actions.handleUpdateLinkset}
                onDeleteLinkset={actions.handleDeleteLinkset}
                isAdmin={isAdmin}
              />
            </>
          )}
        </aside>
      </div>

      {/* Create Diagram Dialog */}
      <CreateDiagramDialog
        isOpen={uiState.showCreateDialog}
        name={uiState.newDiagramName}
        description={uiState.newDiagramDescription}
        onNameChange={uiState.setNewDiagramName}
        onDescriptionChange={uiState.setNewDiagramDescription}
        onCreate={() => actions.createDiagramMutation.mutate({
          name: uiState.newDiagramName,
          description: uiState.newDiagramDescription
        })}
        onClose={() => uiState.setShowCreateDialog(false)}
        isLoading={actions.createDiagramMutation.isPending}
      />

      {/* Create Linkset Prompt Dialog */}
      {uiState.pendingLinksetCreation && (
        <div className="modal-overlay" onClick={() => uiState.setPendingLinksetCreation(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-header">
              <h2>Create Link Set?</h2>
              <p>No linkset exists between these documents. Would you like to create one?</p>
            </div>
            <div className="modal-content">
              <div style={{
                padding: "0.75rem",
                backgroundColor: "var(--bg-secondary)",
                borderRadius: "0.375rem",
                border: "1px solid var(--border-color)",
                marginBottom: "1rem"
              }}>
                <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  <strong>Source:</strong> <code style={{ backgroundColor: "var(--bg-tertiary)", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>{uiState.pendingLinksetCreation.sourceSlug}</code>
                </div>
                <div style={{ fontSize: "0.875rem" }}>
                  <strong>Target:</strong> <code style={{ backgroundColor: "var(--bg-tertiary)", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>{uiState.pendingLinksetCreation.targetSlug}</code>
                </div>
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                Creating a linkset will allow you to establish trace relationships between requirements in these documents. You can customize the link type in the next step.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="ghost-button"
                onClick={() => uiState.setPendingLinksetCreation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!uiState.pendingLinksetCreation) return;

                  try {
                    // Create the linkset with default "satisfies" type
                    await actions.handleCreateLinkset(
                      uiState.pendingLinksetCreation.sourceSlug,
                      uiState.pendingLinksetCreation.targetSlug,
                      "satisfies"
                    );

                    // Now retry creating the connector
                    const pending = uiState.pendingLinksetCreation.pendingConnector;
                    await actions.addConnector(pending);

                    // Success - close the dialog
                    uiState.setPendingLinksetCreation(null);
                  } catch (error) {
                    console.error("Failed to create linkset and connector:", error);
                    // Don't show alert if it's the special LINKSET_REQUIRED error
                    if (error instanceof Error && error.message !== "LINKSET_REQUIRED") {
                      toast.error(`Failed to create linkset: ${error.message}`);
                    }
                  }
                }}
              >
                Create Link Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
