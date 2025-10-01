import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useApiClient } from "../lib/client";
import { DiagramCanvas } from "../components/diagram/DiagramCanvas";
import { BlockDetailsPanel } from "../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../components/architecture/ConnectorDetailsPanel";
import type {
  ArchitectureBlockRecord,
  ArchitectureConnectorRecord,
  ArchitectureDiagramRecord,
  DocumentRecord
} from "../types";

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
      return response.diagrams.filter(d => 
        d.view === "requirements_schema" || d.name.includes("Requirements Schema")
      );
    },
    enabled: Boolean(tenant && project)
  });
  
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
    
    await api.createArchitectureBlock(tenant, project, activeDiagramId, {
      name: document.name,
      kind: DOCUMENT_BLOCK_PRESET.kind,
      stereotype: DOCUMENT_BLOCK_PRESET.stereotype,
      description: `Document: ${document.slug}`,
      x: position.x,
      y: position.y,
      size: DOCUMENT_BLOCK_PRESET.size,
      documentIds: [documentId]
    });
    
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, documentsQuery.data, api, queryClient]);
  
  // Add connector between documents
  const addConnector = useCallback(async (sourceId: string, targetId: string, label?: string) => {
    if (!activeDiagramId) {return;}
    
    await api.createArchitectureConnector(tenant, project, activeDiagramId, {
      source: sourceId,
      target: targetId,
      kind: "dependency",
      label: label || "traces to"
    });
    
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  }, [tenant, project, activeDiagramId, api, queryClient]);
  
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
  
  // Handle drop on canvas
  const handleCanvasDrop = useCallback((event: React.DragEvent, position: { x: number; y: number }) => {
    const documentId = event.dataTransfer.getData("documentId");
    if (documentId) {
      addDocumentBlock(documentId, position);
    }
  }, [addDocumentBlock]);
  
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
  
  const activeDiagram = diagramsQuery.data?.find(d => d.id === activeDiagramId);
  const blocks = diagramContentQuery.data?.blocks || [];
  const connectors = diagramContentQuery.data?.connectors || [];
  
  // Create architecture state for DiagramCanvas
  const architecture = { blocks, connectors };
  
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
  const handleUpdateBlock = async (blockId: string, updates: any) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureBlock(tenant, project, blockId, updates);
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleUpdateBlockPosition = async (blockId: string, position: { x: number; y: number }) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureBlock(tenant, project, blockId, { 
      positionX: position.x, 
      positionY: position.y 
    });
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleUpdateBlockSize = async (blockId: string, size: { width: number; height: number }) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureBlock(tenant, project, blockId, { 
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
  
  const handleUpdateConnector = async (connectorId: string, updates: any) => {
    if (!activeDiagramId) {return;}
    await api.updateArchitectureConnector(tenant, project, connectorId, updates);
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const handleRemoveConnector = async (connectorId: string) => {
    if (!activeDiagramId) {return;}
    await api.deleteArchitectureConnector(tenant, project, connectorId);
    queryClient.invalidateQueries({ queryKey: ["requirements-schema-content"] });
  };
  
  const mapConnectorToEdge = (connector: any) => ({
    id: connector.id,
    source: connector.source,
    target: connector.target,
    type: 'default',
    label: connector.label
  });
  
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
        {diagramsQuery.data?.map(diagram => (
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
        {diagramsQuery.data?.length === 0 && (
          <div className="architecture-tabs empty">Create a diagram to start modeling</div>
        )}
      </div>

      <div className="architecture-body">
        {/* Left Sidebar - Document Browser */}
        <aside className="architecture-pane" style={{ width: '320px' }}>
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
        
        {/* Main Canvas Area - with proper architecture classes for React Flow */}
        <div className="architecture-canvas-area">
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
        </div>
        
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