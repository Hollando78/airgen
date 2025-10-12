import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { BlockDetailsPanel } from "../../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../../components/architecture/ConnectorDetailsPanel";
import { ArchitectureTreeBrowser } from "../../components/architecture/ArchitectureTreeBrowser";
import type {
  ArchitectureBlockLibraryRecord,
  ArchitectureDiagramRecord,
  DocumentRecord
} from "../../types";
import type {
  ArchitectureState,
  BlockKind,
  ConnectorKind,
  PortDirection,
  SysmlBlock,
  SysmlConnector
} from "../../hooks/useArchitectureApi";
import { ArchitecturePalette } from "./components/ArchitecturePalette";
import { DiagramTabs } from "./components/DiagramTabs";
import { DiagramCanvas, type DiagramCanvasHandle } from "../../components/diagram/DiagramCanvas";
import { BLOCK_PRESETS } from "./constants";
import { computeBlockPlacement, mapConnectorToEdge } from "./utils/diagram";
import type { BlockPreset } from "./types";
import { useFloatingDocuments } from "../../contexts/FloatingDocumentsContext";
import { PromptDialog } from "../../components/ui/prompt-dialog";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";

interface ArchitectureWorkspaceProps {
  tenant: string;
  project: string;
  architecture: ArchitectureState;
  diagrams: ArchitectureDiagramRecord[];
  activeDiagram: ArchitectureDiagramRecord | null;
  activeDiagramId: string | null;
  setActiveDiagramId: (diagramId: string | null) => void;
  createDiagram: (input: { name: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) => Promise<unknown>;
  renameDiagram: (diagramId: string, updates: { name?: string; description?: string; view?: ArchitectureDiagramRecord["view"] }) => Promise<unknown>;
  deleteDiagram: (diagramId: string) => Promise<unknown>;
  addBlock: (
    input:
      | {
          name?: string;
          kind?: BlockKind;
          stereotype?: string;
          description?: string;
          x?: number;
          y?: number;
          size?: { width: number; height: number };
        }
      | { x: number; y: number }
  ) => string | null;
  reuseBlock: (blockId: string, position: { x: number; y: number }, size?: { width: number; height: number }) => string | null;
  updateBlock: (blockId: string, updates: Partial<SysmlBlock>) => void;
  updateBlockPosition: (blockId: string, position: { x: number; y: number }) => void;
  updateBlockSize: (blockId: string, size: { width: number; height: number }) => void;
  removeBlock: (blockId: string) => void;
  addConnector: (input: {
    source: string;
    target: string;
    sourcePortId?: string | null;
    targetPortId?: string | null;
    kind?: ConnectorKind;
    label?: string;
  }) => string | null;
  updateConnector: (connectorId: string, updates: Partial<SysmlConnector>) => void;
  removeConnector: (connectorId: string) => void;
  clearArchitecture: () => void;
  addDocumentToBlock: (blockId: string, documentId: string) => void;
  removeDocumentFromBlock: (blockId: string, documentId: string) => void;
  addDocumentToConnector: (connectorId: string, documentId: string) => void;
  removeDocumentFromConnector: (connectorId: string, documentId: string) => void;
  blocksLibrary: ArchitectureBlockLibraryRecord[];
  isLibraryLoading: boolean;
  libraryError: unknown;
  hasChanges: boolean;
  isLoading: boolean;
  documents: DocumentRecord[];
}

export function ArchitectureWorkspace({
  tenant,
  project,
  architecture,
  diagrams,
  activeDiagram,
  activeDiagramId,
  setActiveDiagramId,
  createDiagram,
  renameDiagram,
  deleteDiagram,
  addBlock,
  reuseBlock,
  updateBlock,
  updateBlockPosition,
  updateBlockSize,
  removeBlock,
  addConnector,
  updateConnector,
  removeConnector,
  clearArchitecture,
  addDocumentToBlock,
  removeDocumentFromBlock,
  addDocumentToConnector,
  removeDocumentFromConnector,
  blocksLibrary,
  isLibraryLoading,
  libraryError,
  hasChanges,
  isLoading,
  documents: documentList
}: ArchitectureWorkspaceProps): JSX.Element {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [diagramViewports, setDiagramViewports] = useState<Record<string, { x: number; y: number; zoom: number }>>({});
  const canvasRef = useRef<DiagramCanvasHandle>(null);
  const activeDiagramIdRef = useRef<string | null>(null);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; diagramId: string | null; currentName: string }>({
    open: false,
    diagramId: null,
    currentName: '',
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; diagramId: string | null; diagramName: string }>({
    open: false,
    diagramId: null,
    diagramName: '',
  });
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const { openFloatingDocument } = useFloatingDocuments();

  const openDocument = useCallback((documentSlug: string) => {
    const document = documentList.find(item => item.slug === documentSlug);
    if (!document) {
      return;
    }

    openFloatingDocument({
      documentSlug,
      documentName: document.name,
      tenant,
      project,
      kind: document.kind === "surrogate" ? "surrogate" : "structured",
      downloadUrl: document.downloadUrl,
      mimeType: document.mimeType,
      originalFileName: document.originalFileName,
      previewDownloadUrl: document.previewDownloadUrl,
      previewMimeType: document.previewMimeType
    });
  }, [documentList, tenant, project, openFloatingDocument]);

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

  const viewportTimeoutRef = useRef<NodeJS.Timeout>();

  // Keep ref in sync with current active diagram ID
  useEffect(() => {
    activeDiagramIdRef.current = activeDiagramId;
  }, [activeDiagramId]);

  const handleViewportChange = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    // Use ref to get current diagram ID, not closure variable
    const currentDiagramId = activeDiagramIdRef.current;
    if (!currentDiagramId) return;

    // Debounce viewport updates to avoid excessive re-renders
    if (viewportTimeoutRef.current) {
      clearTimeout(viewportTimeoutRef.current);
    }

    viewportTimeoutRef.current = setTimeout(() => {
      setDiagramViewports(prev => ({
        ...prev,
        [currentDiagramId]: viewport
      }));
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            `airgen:diagramViewport:${currentDiagramId}`,
            JSON.stringify(viewport)
          );
        } catch (error) {
          console.warn("Failed to persist architecture viewport", error);
        }
      }
    }, 100);
  }, []); // No dependencies needed since we use ref

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !diagrams.length) {
      return;
    }

    setDiagramViewports(prev => {
      let hasChanges = false;
      const next = { ...prev };

      diagrams.forEach(diagram => {
        if (next[diagram.id]) {
          return;
        }
        try {
          const raw = window.localStorage.getItem(`airgen:diagramViewport:${diagram.id}`);
          if (!raw) {
            return;
          }
          const parsed = JSON.parse(raw) as { x: number; y: number; zoom: number };
          if (
            typeof parsed === "object" &&
            typeof parsed.x === "number" &&
            typeof parsed.y === "number" &&
            typeof parsed.zoom === "number"
          ) {
            next[diagram.id] = parsed;
            hasChanges = true;
          }
        } catch (error) {
          console.warn("Failed to hydrate architecture viewport", error);
        }
      });

      return hasChanges ? next : prev;
    });
  }, [diagrams]);

  const currentViewport = useMemo(() => {
    if (!activeDiagramId) {
      return undefined;
    }

    const cached = diagramViewports[activeDiagramId];
    if (cached) {
      return cached;
    }

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`airgen:diagramViewport:${activeDiagramId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as { x: number; y: number; zoom: number };
          if (
            typeof parsed === "object" &&
            typeof parsed.x === "number" &&
            typeof parsed.y === "number" &&
            typeof parsed.zoom === "number"
          ) {
            return parsed;
          }
        }
      } catch (error) {
        console.warn("Failed to read architecture viewport from storage", error);
      }
    }

    return undefined;
  }, [activeDiagramId, diagramViewports]);

  const documents = useMemo(() => documentList, [documentList]);
  const blocksInDiagram = useMemo(() => new Set(architecture.blocks.map(block => block.id)), [architecture.blocks]);

  const handleCreateDiagram = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleConfirmCreateDiagram = useCallback(async (name: string) => {
    try {
      await createDiagram({ name });
      toast.success('Diagram created successfully');
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [createDiagram]);

  const handleRenameDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) {return;}
    setRenameDialog({ open: true, diagramId, currentName: diagram.name });
  }, [diagrams]);

  const handleConfirmRenameDiagram = useCallback(async (name: string) => {
    if (!renameDialog.diagramId) {return;}
    try {
      await renameDiagram(renameDialog.diagramId, { name });
      toast.success('Diagram renamed successfully');
      setRenameDialog({ open: false, diagramId: null, currentName: '' });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [renameDialog.diagramId, renameDiagram]);

  const handleDeleteDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) {return;}
    setDeleteDialog({ open: true, diagramId, diagramName: diagram.name });
  }, [diagrams]);

  const handleConfirmDeleteDiagram = useCallback(async () => {
    if (!deleteDialog.diagramId) {return;}
    try {
      await deleteDiagram(deleteDialog.diagramId);
      toast.success('Diagram deleted successfully');
      setDeleteDialog({ open: false, diagramId: null, diagramName: '' });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [deleteDialog.diagramId, deleteDiagram]);

  const handleClearDiagram = useCallback(() => {
    if (!activeDiagramId || !hasChanges) {return;}
    setClearDialogOpen(true);
  }, [activeDiagramId, hasChanges]);

  const handleConfirmClearDiagram = useCallback(() => {
    clearArchitecture();
    setClearDialogOpen(false);
    toast.success('Diagram cleared successfully');
  }, [clearArchitecture]);

  const handlePaletteAdd = useCallback((preset: BlockPreset) => {
    canvasRef.current?.addBlockFromPreset(preset);
  }, []);

  const handleReuseExistingBlock = useCallback((blockId: string) => {
    canvasRef.current?.reuseExistingBlock(blockId);
  }, []);

  const selectedBlock = useMemo(
    () => architecture.blocks.find(block => block.id === selectedBlockId) ?? null,
    [architecture.blocks, selectedBlockId]
  );

  const selectedConnector = useMemo(
    () => architecture.connectors.find(connector => connector.id === selectedConnectorId) ?? null,
    [architecture.connectors, selectedConnectorId]
  );

  return (
    <div className="architecture-shell">
      <header className="architecture-header">
        <div className="architecture-header-info">
          <h1>Architecture Studio</h1>
          <p>Compose SysML views for {project}</p>
        </div>
        <div className="architecture-header-actions">
          <button className="ghost-button" onClick={handleCreateDiagram}>
            + Diagram
          </button>
          <button
            className="ghost-button"
            onClick={handleClearDiagram}
            disabled={!hasChanges || !activeDiagramId}
          >
            Clear Diagram
          </button>
        </div>
      </header>

      <DiagramTabs
        diagrams={diagrams.map(diagram => ({ id: diagram.id, name: diagram.name }))}
        activeDiagramId={activeDiagramId}
        onSelect={setActiveDiagramId}
        onRename={handleRenameDiagram}
        onDelete={handleDeleteDiagram}
      />

      <div className="architecture-body">
        <aside className="architecture-pane palette-pane">
          <ArchitecturePalette
            presets={BLOCK_PRESETS}
            onAddPreset={preset => handlePaletteAdd(preset)}
            disabled={!activeDiagramId}
          />
          <ArchitectureTreeBrowser
            blocks={blocksLibrary}
            disabled={!activeDiagramId}
            isLoading={isLibraryLoading}
            error={libraryError}
            onInsert={handleReuseExistingBlock}
            currentDiagramId={activeDiagramId}
            blocksInDiagram={blocksInDiagram}
          />
        </aside>

        <DiagramCanvas
          ref={canvasRef}
          tenant={tenant}
          project={project}
          architecture={architecture}
          activeDiagram={activeDiagram}
          activeDiagramId={activeDiagramId}
          documents={documents}
          selectedBlockId={selectedBlockId}
          selectedConnectorId={selectedConnectorId}
          onSelectBlock={setSelectedBlockId}
          onSelectConnector={setSelectedConnectorId}
          addBlock={addBlock}
          reuseBlock={reuseBlock}
          updateBlock={updateBlock}
          updateBlockPosition={updateBlockPosition}
          updateBlockSize={updateBlockSize}
          removeBlock={removeBlock}
          addConnector={addConnector}
          updateConnector={updateConnector}
          removeConnector={removeConnector}
          onOpenDocument={openDocument}
          onOpenFloatingDiagram={openFloatingDiagram}
          viewport={currentViewport}
          onViewportChange={handleViewportChange}
          isLoading={isLoading}
          blockPresets={BLOCK_PRESETS}
          computePlacement={computeBlockPlacement}
          mapConnectorToEdge={mapConnectorToEdge}
        />

        <aside className="architecture-pane inspector-pane">
          {selectedBlock && (
            <BlockDetailsPanel
              block={selectedBlock}
              onUpdate={updates => updateBlock(selectedBlock.id, updates)}
              onUpdatePosition={position => updateBlockPosition(selectedBlock.id, position)}
              onUpdateSize={size => updateBlockSize(selectedBlock.id, size)}
              onRemove={() => removeBlock(selectedBlock.id)}
              documents={documents}
              onAddDocument={documentId => addDocumentToBlock(selectedBlock.id, documentId)}
              onRemoveDocument={documentId => removeDocumentFromBlock(selectedBlock.id, documentId)}
            />
          )}

          {selectedConnector && (
            <ConnectorDetailsPanel
              connector={selectedConnector}
              onUpdate={updates => updateConnector(selectedConnector.id, updates)}
              onRemove={() => removeConnector(selectedConnector.id)}
              documents={documents}
              onAddDocument={documentId => addDocumentToConnector(selectedConnector.id, documentId)}
              onRemoveDocument={documentId => removeDocumentFromConnector(selectedConnector.id, documentId)}
            />
          )}

          {!selectedBlock && !selectedConnector && (
            <div className="architecture-hint">
              <h3>Workspace tips</h3>
              <ul>
                <li>Use the palette to drop new blocks into the canvas.</li>
                <li>Right-click the canvas or blocks for quick actions.</li>
                <li>Drag handles between blocks to author connectors.</li>
                <li>Open blocks to link supporting documents.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Dialogs */}
      <PromptDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onConfirm={handleConfirmCreateDiagram}
        title="Create New Diagram"
        label="Diagram Name"
        placeholder={`View ${diagrams.length + 1}`}
        defaultValue={`View ${diagrams.length + 1}`}
        confirmText="Create"
      />

      <PromptDialog
        open={renameDialog.open}
        onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}
        onConfirm={handleConfirmRenameDiagram}
        title="Rename Diagram"
        label="New Name"
        defaultValue={renameDialog.currentName}
        confirmText="Rename"
      />

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
        onConfirm={handleConfirmDeleteDiagram}
        title="Delete Diagram"
        description={`Delete diagram "${deleteDialog.diagramName}"? This removes its blocks and connectors.`}
        confirmText="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={setClearDialogOpen}
        onConfirm={handleConfirmClearDiagram}
        title="Clear Diagram"
        description="Remove all blocks and connectors from this diagram?"
        confirmText="Clear"
        variant="destructive"
      />
    </div>
  );
}
