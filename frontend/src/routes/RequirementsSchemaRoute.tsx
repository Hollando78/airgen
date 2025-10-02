import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { MarkerType, type Edge } from "@xyflow/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { DiagramCanvas } from "../components/diagram/DiagramCanvas";
import { BlockDetailsPanel } from "../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../components/architecture/ConnectorDetailsPanel";
import { isRequirementsSchemaDiagram } from "../lib/architectureDiagrams";
import type {
  ArchitectureBlockRecord,
  ArchitectureConnectorRecord,
  DocumentRecord,
  DocumentLinkset
} from "../types";
import type { SysmlBlock, SysmlConnector } from "../hooks/useArchitectureApi";

// Transform API block records to SysML blocks
function mapBlockFromApi(block: ArchitectureBlockRecord): SysmlBlock {
  return {
    id: block.id,
    name: block.name,
    kind: block.kind,
    stereotype: block.stereotype || undefined,
    description: block.description || undefined,
    position: { x: block.positionX, y: block.positionY },
    size: { width: block.sizeWidth, height: block.sizeHeight },
    ports: block.ports,
    documentIds: block.documentIds,
    backgroundColor: block.backgroundColor || undefined,
    borderColor: block.borderColor || undefined,
    borderWidth: block.borderWidth || undefined,
    borderStyle: block.borderStyle || undefined,
    textColor: block.textColor || undefined,
    fontSize: block.fontSize || undefined,
    fontWeight: block.fontWeight || undefined,
    borderRadius: block.borderRadius || undefined
  };
}

// Transform API connector records to SysML connectors
function mapConnectorFromApi(connector: ArchitectureConnectorRecord): SysmlConnector {
  return {
    id: connector.id,
    source: connector.source,
    target: connector.target,
    kind: connector.kind,
    label: connector.label || undefined,
    sourcePortId: connector.sourcePortId || null,
    targetPortId: connector.targetPortId || null,
    documentIds: connector.documentIds ?? [],
    lineStyle: connector.lineStyle || undefined,
    markerStart: connector.markerStart || undefined,
    markerEnd: connector.markerEnd || undefined,
    linePattern: connector.linePattern || undefined,
    color: connector.color || undefined,
    strokeWidth: connector.strokeWidth || undefined
  };
}

// Only allow document blocks in requirements schema
const DOCUMENT_BLOCK_PRESET = {
  kind: "component" as const,
  stereotype: "<<document>>",
  backgroundColor: "#fef3c7",
  borderColor: "#f59e0b",
  borderWidth: 2,
  textColor: "#92400e",
  size: { width: 240, height: 140 }
};

export function RequirementsSchemaRoute(): JSX.Element {
  const { state } = useTenantProject();
  const api = useApiClient();
  const queryClient = useQueryClient();
  
  const tenant = state.tenant ?? "";
  const project = state.project ?? "";
  
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [activeDiagramId, setActiveDiagramId] = useState<string | null>(null);
  const linksetApiUnavailableRef = useRef(false);
  
  // New diagram form state
  const [newDiagramName, setNewDiagramName] = useState("");
  const [newDiagramDescription, setNewDiagramDescription] = useState("");
  
  // Fetch documents for the project
  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: Boolean(tenant && project)
  });
  
  // Fetch requirements schema diagrams
  const diagramsQuery = useQuery({
    queryKey: ["requirements-schema-diagrams", tenant, project],
    queryFn: async () => {
      const response = await api.listArchitectureDiagrams(tenant, project);
      return response.diagrams.filter(isRequirementsSchemaDiagram);
    },
    enabled: Boolean(tenant && project)
  });
  const diagrams = diagramsQuery.data ?? [];

  useEffect(() => {
    if (!diagrams.length) {
      if (activeDiagramId !== null) {
        setActiveDiagramId(null);
      }
      return;
    }

    const hasActive = activeDiagramId ? diagrams.some(diagram => diagram.id === activeDiagramId) : false;
    if (!hasActive) {
      setActiveDiagramId(diagrams[0].id);
    }
  }, [diagrams, activeDiagramId, setActiveDiagramId]);

  // Fetch active diagram content
  const diagramContentQuery = useQuery({
    queryKey: ["requirements-schema-content", tenant, project, activeDiagramId],
    queryFn: async () => {
      if (!activeDiagramId) {return null;}
      const blocks = await api.listArchitectureBlocks(tenant, project, activeDiagramId);
      const connectors = await api.listArchitectureConnectors(tenant, project, activeDiagramId);
      return { blocks: blocks.blocks, connectors: connectors.connectors };
    },
    enabled: Boolean(tenant && project && activeDiagramId)
  });
  
  // Create new diagram mutation
  const createDiagramMutation = useMutation({
    mutationFn: async () => {
      return api.createArchitectureDiagram({
        tenant,
        projectKey: project,
        name: newDiagramName || "Project Requirements Schema",
        description: newDiagramDescription,
        view: "requirements_schema"
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["requirements-schema-diagrams"] });
      setActiveDiagramId(data.diagram.id);
      setShowCreateDialog(false);
      setNewDiagramName("");
      setNewDiagramDescription("");
    }
  });
  
  // Add document block to diagram
  const addDocumentBlock = useCallback(async (documentId: string, position: { x: number; y: number }) => {
    if (!activeDiagramId) {return;}

    const document = documentsQuery.data?.documents.find(d => d.id === documentId);
    if (!document) {return;}

    await api.createArchitectureBlock({
      tenant,
      projectKey: project,
      diagramId: activeDiagramId,
      name: document.name,
      kind: DOCUMENT_BLOCK_PRESET.kind,
      stereotype: DOCUMENT_BLOCK_PRESET.stereotype,
      description: `Document: ${document.slug}`,
      positionX: position.x,
      positionY: position.y,
      sizeWidth: DOCUMENT_BLOCK_PRESET.size.width,
      sizeHeight: DOCUMENT_BLOCK_PRESET.size.height,
      documentIds: [documentId]
    });

    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, documentsQuery.data, api, queryClient]);

  const documentsIndex = useMemo(() => {
    const index = new Map<string, DocumentRecord>();
    (documentsQuery.data?.documents ?? []).forEach(doc => {
      index.set(doc.id, doc);
    });
    return index;
  }, [documentsQuery.data?.documents]);
  
  // Handle block selection
  const handleBlockSelect = useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
    setSelectedConnectorId(null);
  }, []);
  
  // Handle connector selection
  const handleConnectorSelect = useCallback((connectorId: string | null) => {
    setSelectedConnectorId(connectorId);
    setSelectedBlockId(null);
  }, []);

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
  
  const activeDiagram = useMemo(() =>
    diagrams.find(diagram => diagram.id === activeDiagramId) ?? null,
  [diagrams, activeDiagramId]);

  // Transform API blocks and connectors to SysML format
  const blocks = useMemo(
    () => (diagramContentQuery.data?.blocks ?? []).map(mapBlockFromApi),
    [diagramContentQuery.data?.blocks]
  );
  
  const connectors = useMemo(
    () => (diagramContentQuery.data?.connectors ?? []).map(mapConnectorFromApi),
    [diagramContentQuery.data?.connectors]
  );

  const blockIndex = useMemo(() => {
    const index = new Map<string, SysmlBlock>();
    blocks.forEach(block => index.set(block.id, block));
    return index;
  }, [blocks]);

  const resolveDocumentSlug = useCallback((blockId: string) => {
    const block = blockIndex.get(blockId);
    if (!block || !block.documentIds || block.documentIds.length === 0) {
      return null;
    }
    const documentId = block.documentIds[0];
    const document = documentsIndex.get(documentId);
    return document?.slug ?? null;
  }, [blockIndex, documentsIndex]);

  // Add connector between documents
  const addConnector = useCallback(async (input: {
    source: string;
    target: string;
    sourcePortId?: string | null;
    targetPortId?: string | null;
    kind?: "dependency" | "association" | "composition" | "aggregation" | "flow" | "generalization";
    label?: string;
  }) => {
    if (!activeDiagramId) {return null;}

    const seedSyntheticLinkset = (sourceSlug: string, targetSlug: string) => {
      const sourceDoc = documentsIndex.get(blockIndex.get(input.source)?.documentIds?.[0] ?? "");
      const targetDoc = documentsIndex.get(blockIndex.get(input.target)?.documentIds?.[0] ?? "");

      if (!sourceDoc || !targetDoc) {
        return;
      }

      queryClient.setQueryData<{ linksets: DocumentLinkset[] } | undefined>(
        ["linksets", tenant, project],
        prev => {
          const existing = prev?.linksets ?? [];
          const alreadyPresent = existing.some(linkset =>
            linkset.sourceDocumentSlug === sourceSlug && linkset.targetDocumentSlug === targetSlug
          );
          if (alreadyPresent) {
            return prev;
          }

          const timestamp = new Date().toISOString();
          const synthetic: DocumentLinkset = {
            id: `synthetic-linkset-${Date.now()}`,
            tenant,
            projectKey: project,
            sourceDocumentSlug: sourceSlug,
            targetDocumentSlug: targetSlug,
            sourceDocument: sourceDoc,
            targetDocument: targetDoc,
            linkCount: 0,
            links: [],
            createdAt: timestamp,
            updatedAt: timestamp
          };

          return {
            linksets: [synthetic, ...existing]
          };
        }
      );
    };

    const attemptCreateLinkset = async (sourceSlug: string, targetSlug: string) => {
      try {
        const response = await api.createLinkset(tenant, project, {
          sourceDocumentSlug: sourceSlug,
          targetDocumentSlug: targetSlug
        });
        queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
        return response.linkset;
      } catch (createError) {
        return Promise.reject(createError);
      }
    };

    const ensureLinksetExists = async () => {
      const sourceSlug = resolveDocumentSlug(input.source);
      const targetSlug = resolveDocumentSlug(input.target);

      if (!sourceSlug || !targetSlug) {
        console.warn("Schema connector created without document slugs", {
          sourceBlockId: input.source,
          targetBlockId: input.target
        });
        return;
      }

       if (linksetApiUnavailableRef.current) {
         seedSyntheticLinkset(sourceSlug, targetSlug);
         return;
       }

      try {
        await api.getLinkset(tenant, project, sourceSlug, targetSlug);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (!message.includes("not found")) {
          console.error("Failed to retrieve linkset", { sourceSlug, targetSlug, error });
          return;
        }

        try {
          const linkset = await attemptCreateLinkset(sourceSlug, targetSlug);
          if (!linkset) {return;}
          return;
        } catch (createError) {
          const createMessage = createError instanceof Error ? createError.message.toLowerCase() : "";
          if (!createMessage.includes("not found")) {
            console.error("Failed to create linkset", { sourceSlug, targetSlug, error: createError });
            return;
          }
          linksetApiUnavailableRef.current = true;
          seedSyntheticLinkset(sourceSlug, targetSlug);
        }
      }
    };

    const result = await api.createArchitectureConnector({
      tenant,
      projectKey: project,
      diagramId: activeDiagramId,
      source: input.source,
      target: input.target,
      sourcePortId: input.sourcePortId || undefined,
      targetPortId: input.targetPortId || undefined,
      kind: "flow",
      label: input.label || "traces to",
      lineStyle: "smoothstep",
      markerStart: "none",
      markerEnd: "arrowclosed",
      linePattern: "solid",
      color: "#2563eb",
      strokeWidth: 2
    });

    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });

    await ensureLinksetExists();

    return result.connector.id;
  }, [tenant, project, activeDiagramId, api, queryClient, resolveDocumentSlug, documentsIndex, blockIndex]);

  // Create architecture state for DiagramCanvas
  const architecture = useMemo(() => ({ blocks, connectors }), [blocks, connectors]);
  
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
  
  // Block manipulation functions
  const handleAddBlock = () => null;
  const handleReuseBlock = () => null;
  const handleUpdateBlock = async (blockId: string, updates: Partial<SysmlBlock>) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureBlock(tenant, project, blockId, {
      diagramId: activeDiagramId,
      ...updates
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleUpdateBlockPosition = async (blockId: string, position: { x: number; y: number }) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureBlock(tenant, project, blockId, { 
      diagramId: activeDiagramId,
      positionX: position.x, 
      positionY: position.y 
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleUpdateBlockSize = async (blockId: string, size: { width: number; height: number }) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureBlock(tenant, project, blockId, { 
      diagramId: activeDiagramId,
      sizeWidth: size.width, 
      sizeHeight: size.height 
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleRemoveBlock = async (blockId: string) => {
    if (!activeDiagramId) {return;}
    await api.deleteArchitectureBlock(tenant, project, activeDiagramId, blockId);
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleAddPort = () => {};
  const handleUpdatePort = () => {};
  const handleRemovePort = () => {};
  
  const handleUpdateConnector = async (connectorId: string, updates: Partial<SysmlConnector>) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureConnector(tenant, project, connectorId, {
      diagramId: activeDiagramId,
      kind: "flow",
      markerStart: "none",
      markerEnd: "arrowclosed",
      ...updates
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleRemoveConnector = async (connectorId: string) => {
    if (!activeDiagramId) {return;}
    await api.deleteArchitectureConnector(tenant, project, activeDiagramId, connectorId);
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const mapConnectorToEdge = (connector: SysmlConnector): Edge => {
    const strokeColor = connector.color ?? "#2563eb";
    const strokeWidth = connector.strokeWidth ?? 2;
    let strokeDasharray: string | undefined;
    if (connector.linePattern === "dashed") {
      strokeDasharray = "8 4";
    } else if (connector.linePattern === "dotted") {
      strokeDasharray = "2 2";
    }

    return {
      id: connector.id,
      source: connector.source,
      target: connector.target,
      type: connector.lineStyle ?? "smoothstep",
      animated: true,
      label: connector.label || "traces to",
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
        originalLabel: connector.label || "traces to"
      }
    } satisfies Edge;
  };
  
  return (
    <div className="architecture-shell">
      <header className="architecture-header">
        <div className="architecture-header-info">
          <h1>Requirements Schema</h1>
          <p>Document relationships for {project}</p>
        </div>
        <div className="architecture-header-actions">
          <button className="ghost-button" onClick={() => setShowCreateDialog(true)}>
            + New Diagram
          </button>
        </div>
      </header>

      {/* Diagram Tabs */}
      <div className="architecture-tabs">
        {diagrams.map(diagram => (
          <div
            key={diagram.id}
            className={`diagram-tab ${diagram.id === activeDiagramId ? "active" : ""}`}
          >
            <button
              className="diagram-tab-button"
              onClick={() => setActiveDiagramId(diagram.id)}
              title={diagram.name}
            >
              {diagram.name}
            </button>
          </div>
        ))}
        {diagrams.length === 0 && (
          <div className="architecture-tabs empty">Create a diagram to start modeling</div>
        )}
      </div>

      <div className="architecture-body">
        {/* Left Sidebar - Document Browser */}
        <aside className="architecture-pane palette-pane">
          <div className="p-4 border-b">
            <h2 className="font-medium">Documents</h2>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-2">
              {documentsQuery.data?.documents.map(doc => (
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
                  <div className="text-xs text-amber-700 mt-1">{doc.type}</div>
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
            activeDiagramId={activeDiagramId}
            documents={documentsQuery.data?.documents || []}
            selectedBlockId={selectedBlockId}
            selectedConnectorId={selectedConnectorId}
            onSelectBlock={handleBlockSelect}
            onSelectConnector={handleConnectorSelect}
            blockPresets={documentBlockPresets}
            computePlacement={computeBlockPlacement}
            addBlock={handleAddBlock}
            reuseBlock={handleReuseBlock}
            updateBlock={handleUpdateBlock}
            updateBlockPosition={handleUpdateBlockPosition}
            updateBlockSize={handleUpdateBlockSize}
            removeBlock={handleRemoveBlock}
            addPort={handleAddPort}
            updatePort={handleUpdatePort}
            removePort={handleRemovePort}
            addConnector={addConnector}
            updateConnector={handleUpdateConnector}
            removeConnector={handleRemoveConnector}
            onOpenDocument={() => {}}
            isLoading={diagramContentQuery.isLoading}
            mapConnectorToEdge={mapConnectorToEdge}
            onDropDocument={addDocumentBlock}
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
              <button className="ghost-button" onClick={() => setShowCreateDialog(true)}>
                + Create Requirements Schema
              </button>
            </div>
          </div>
        )}

        {/* Right Sidebar - Details Panel */}
        <aside className="architecture-pane inspector-pane">
          {selectedBlockId && (
            <BlockDetailsPanel
              block={blocks.find(b => b.id === selectedBlockId)}
              onUpdate={(updates) => handleUpdateBlock(selectedBlockId, updates)}
              onRemove={() => handleRemoveBlock(selectedBlockId)}
              documents={documentsQuery.data?.documents || []}
              onAddDocument={() => {}}
              onRemoveDocument={() => {}}
            />
          )}

          {selectedConnectorId && (
            <ConnectorDetailsPanel
              connector={connectors.find(c => c.id === selectedConnectorId)}
              onUpdate={(updates) => handleUpdateConnector(selectedConnectorId, updates)}
              onRemove={() => handleRemoveConnector(selectedConnectorId)}
            />
          )}

          {!selectedBlockId && !selectedConnectorId && (
            <div className="architecture-hint">
              <h3>Requirements Schema</h3>
              <ul>
                <li>Drag documents from the left panel to create document blocks.</li>
                <li>Connect documents to show trace relationships.</li>
                <li>Create transverse diagrams for detailed traces.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>
      
      {/* Create Diagram Dialog */}
      {showCreateDialog && (
        <div className="modal-overlay" onClick={() => setShowCreateDialog(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Requirements Schema Diagram</h2>
              <p>Create a new requirements schema diagram to map document relationships</p>
            </div>
            <div className="modal-body">
              <div className="field">
                <label htmlFor="name">Diagram Name</label>
                <input
                  id="name"
                  type="text"
                  value={newDiagramName}
                  onChange={(e) => setNewDiagramName(e.target.value)}
                  placeholder="e.g., Project Requirements Schema"
                />
              </div>
              <div className="field">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={newDiagramDescription}
                  onChange={(e) => setNewDiagramDescription(e.target.value)}
                  placeholder="Describe the purpose of this diagram..."
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="ghost-button" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </button>
              <button type="button" onClick={() => createDiagramMutation.mutate()}>
                Create Diagram
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
