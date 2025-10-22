import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DiagramTabs } from "../ArchitectureRoute/components/DiagramTabs";
import { ArchitectureBrowserTree } from "../../components/architecture/ArchitectureBrowserTree";
import { BlockDetailsPanel } from "../../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../../components/architecture/ConnectorDetailsPanel";
import { PortDetailsPanel } from "../../components/architecture/PortDetailsPanel";
import { DiagramCanvas, type DiagramCanvasHandle } from "../../components/diagram/DiagramCanvas";
import { INTERFACE_PRESETS } from "./constants";
import { computeBlockPlacement } from "../ArchitectureRoute/utils/diagram";
import { mapInterfaceConnectorToEdge } from "./utils/diagram";
import { useFloatingDocuments } from "../../contexts/FloatingDocumentsContext";
import { useInterfaceWorkspaceState } from "./hooks/useInterfaceWorkspaceState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
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
import type { ArchitectureConnectorRecord } from "../../types";

interface Package {
  id: string;
  name: string;
  description?: string | null;
  tenant: string;
  projectKey: string;
  parentId?: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

interface InterfaceWorkspaceV2Props {
  tenant: string;
  project: string;
  architecture: ArchitectureState;
  diagrams: ArchitectureDiagramRecord[];
  activeDiagram: ArchitectureDiagramRecord | null;
  activeDiagramId: string | null;
  setActiveDiagramId: (diagramId: string | null) => void;
  createDiagram: (input: { name: string; description?: string }) => Promise<unknown>;
  renameDiagram: (diagramId: string, updates: { name?: string; description?: string }) => Promise<unknown>;
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
  addPort: (blockId: string, port: { name: string; direction: PortDirection }) => void;
  updatePort: (blockId: string, portId: string, updates: { name?: string; direction?: PortDirection; edge?: "top" | "right" | "bottom" | "left"; offset?: number }) => void;
  removePort: (blockId: string, portId: string) => void;
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
  packages: Package[];
  connectors: SysmlConnector[];
  connectorRecords: ArchitectureConnectorRecord[];
  createPackage: (name: string, parentId?: string | null) => Promise<void>;
  updatePackage: (packageId: string, updates: { name: string }) => Promise<void>;
  deletePackage: (packageId: string, force?: boolean) => Promise<void>;
  moveToPackage: (itemId: string, itemType: 'package' | 'block' | 'diagram', targetPackageId: string | null) => Promise<void>;
  reorderInPackage: (packageId: string | null, itemIds: string[]) => Promise<void>;
  isLibraryLoading: boolean;
  isPackagesLoading: boolean;
  libraryError: unknown;
  packagesError: unknown;
  hasChanges: boolean;
  isLoading: boolean;
  documents: DocumentRecord[];
}

export function InterfaceWorkspaceV2(props: InterfaceWorkspaceV2Props): JSX.Element {
  const {
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
    addPort,
    updatePort,
    removePort,
    addConnector,
    updateConnector,
    removeConnector,
    clearArchitecture,
    addDocumentToBlock,
    removeDocumentFromBlock,
    addDocumentToConnector,
    removeDocumentFromConnector,
    blocksLibrary,
    packages,
    connectors,
    connectorRecords,
    createPackage,
    updatePackage,
    deletePackage,
    moveToPackage,
    reorderInPackage,
    isLibraryLoading,
    isPackagesLoading,
    libraryError,
    packagesError,
    hasChanges,
    isLoading,
    documents
  } = props;

  const workspace = useInterfaceWorkspaceState({
    diagrams,
    activeDiagramId,
    blocks: architecture.blocks,
    connectors: architecture.connectors,
    documents
  });

  const [hiddenTabIds, setHiddenTabIds] = useState<Set<string>>(new Set());
  const canvasRef = useRef<DiagramCanvasHandle>(null);
  const { openFloatingDocument } = useFloatingDocuments();

  const blocksInDiagram = useMemo(() => {
    return new Set(architecture.blocks.map(block => block.id));
  }, [architecture.blocks]);

  const handleReuseExistingBlock = useCallback((blockId: string) => {
    canvasRef.current?.reuseExistingBlock(blockId);
  }, []);

  const openDocument = useCallback((documentSlug: string) => {
    const document = documents.find(item => item.slug === documentSlug);
    if (!document) return;

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
  }, [documents, openFloatingDocument, project, tenant]);

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
  }, [openFloatingDocument, project, tenant]);

  const handleCreateDiagram = useCallback(() => {
    const defaultName = `View ${diagrams.length + 1}`;
    workspace.openCreateDialog(defaultName);
  }, [diagrams.length, workspace]);

  const handleConfirmCreate = useCallback(async () => {
    const name = workspace.dialogs.create.draftName.trim();
    if (!name) {
      toast.error("Diagram name cannot be empty");
      return;
    }
    try {
      await createDiagram({ name });
      toast.success("Diagram created successfully");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      workspace.closeCreateDialog();
    }
  }, [createDiagram, workspace]);

  const handleRenameDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) return;
    workspace.openRenameDialog(diagramId, diagram.name);
  }, [diagrams, workspace]);

  const handleConfirmRename = useCallback(async () => {
    const dialog = workspace.dialogs.rename;
    if (!dialog.diagramId) {
      workspace.closeRenameDialog();
      return;
    }
    const nextName = dialog.draftName.trim();
    if (!nextName) {
      toast.error("Diagram name cannot be empty");
      return;
    }

    const current = diagrams.find(item => item.id === dialog.diagramId);
    if (current && current.name === nextName) {
      workspace.closeRenameDialog();
      return;
    }

    try {
      await renameDiagram(dialog.diagramId, { name: nextName });
      toast.success("Diagram renamed successfully");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      workspace.closeRenameDialog();
    }
  }, [diagrams, renameDiagram, workspace]);

  const handleHideTab = useCallback((diagramId: string) => {
    setHiddenTabIds(prev => new Set(prev).add(diagramId));
    // If hiding the active tab, switch to another visible tab
    if (diagramId === activeDiagramId) {
      const visibleDiagrams = diagrams.filter(d => !hiddenTabIds.has(d.id) && d.id !== diagramId);
      if (visibleDiagrams.length > 0) {
        setActiveDiagramId(visibleDiagrams[0].id);
      }
    }
  }, [diagrams, hiddenTabIds, activeDiagramId, setActiveDiagramId]);

  const handleOpenDiagram = useCallback((diagramId: string) => {
    // Unhide the diagram if it was hidden
    setHiddenTabIds(prev => {
      const next = new Set(prev);
      next.delete(diagramId);
      return next;
    });
    // Set it as active
    setActiveDiagramId(diagramId);
  }, [setActiveDiagramId]);

  const handleDeleteDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) return;

    const toastPromise = toast.promise(
      deleteDiagram(diagramId),
      {
        loading: `Deleting "${diagram.name}"...`,
        success: `Deleted "${diagram.name}"`,
        error: (error) => (error as Error).message
      }
    );
    toastPromise.unwrap().catch(() => {
      // handled via toast.promise rejection
    });
  }, [deleteDiagram, diagrams]);

  const handleClearDiagram = useCallback(() => {
    if (!activeDiagramId || !hasChanges) {
      return;
    }
    workspace.openConfirmClear();
  }, [activeDiagramId, hasChanges, workspace]);

  const confirmClearDiagram = useCallback(() => {
    try {
      clearArchitecture();
      toast.success("Diagram cleared");
    } finally {
      workspace.closeConfirmClear();
    }
  }, [clearArchitecture, workspace]);

  const handleSelectPort = useCallback((blockId: string, portId: string | null) => {
    if (!portId) {
      workspace.selectPort(null, null);
      return;
    }
    workspace.selectPort(blockId, portId);
  }, [workspace]);

  // Package management callbacks with toast notifications
  const handleCreatePackage = useCallback(async (name: string, parentId?: string | null) => {
    try {
      await createPackage(name, parentId);
      toast.success('Package created successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }, [createPackage]);

  const handleRenamePackage = useCallback(async (packageId: string, name: string) => {
    try {
      await updatePackage(packageId, { name });
      toast.success('Package renamed successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }, [updatePackage]);

  const handleDeletePackage = useCallback(async (packageId: string) => {
    try {
      await deletePackage(packageId, false);
      toast.success('Package deleted successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }, [deletePackage]);

  const handleMoveToPackage = useCallback(async (itemId: string, itemType: 'package' | 'block' | 'diagram', targetPackageId: string | null) => {
    try {
      await moveToPackage(itemId, itemType, targetPackageId);
      toast.success('Item moved successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }, [moveToPackage]);

  const handleCreateDiagramInPackage = useCallback(async (name: string, packageId?: string | null) => {
    try {
      await createDiagram({ name });
      toast.success('Diagram created successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }, [createDiagram]);

  const handleDeleteDiagramFromBrowser = useCallback(async (diagramId: string) => {
    try {
      await deleteDiagram(diagramId);
      toast.success('Diagram hidden successfully');
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }, [deleteDiagram]);

  const handleReorderItems = useCallback(async (packageId: string | null, itemIds: string[]) => {
    try {
      await reorderInPackage(packageId, itemIds);
    } catch (error) {
      toast.error((error as Error).message);
      throw error;
    }
  }, [reorderInPackage]);

  return (
    <Fragment>
      <div className="architecture-shell">
        <header className="architecture-header">
          <div className="architecture-header-info">
            <h1>Interface Studio</h1>
            <p>Design and manage system interfaces for {project}</p>
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
          diagrams={diagrams.filter(d => !hiddenTabIds.has(d.id)).map(diagram => ({ id: diagram.id, name: diagram.name }))}
          activeDiagramId={activeDiagramId}
          onSelect={setActiveDiagramId}
          onRename={handleRenameDiagram}
          onClose={handleHideTab}
        />

        <div className="architecture-body">
          <aside className="architecture-pane palette-pane">
            <ArchitectureBrowserTree
              blocks={blocksLibrary}
              diagrams={diagrams}
              connectors={connectorRecords}
              packages={packages}
              disabled={!activeDiagramId}
              isLoading={isLibraryLoading || isPackagesLoading}
              error={libraryError || packagesError}
              onInsertBlock={handleReuseExistingBlock}
              onOpenDiagram={handleOpenDiagram}
              onCreatePackage={handleCreatePackage}
              onDeletePackage={handleDeletePackage}
              onRenamePackage={handleRenamePackage}
              onMoveToPackage={handleMoveToPackage}
              onReorderItems={handleReorderItems}
              onCreateDiagram={handleCreateDiagramInPackage}
              onDeleteDiagram={handleDeleteDiagramFromBrowser}
              currentDiagramId={activeDiagramId}
              blocksInDiagram={blocksInDiagram}
              showPorts
            />
          </aside>

          <DiagramCanvas
            ref={canvasRef}
            tenant={tenant}
            project={project}
            architecture={architecture}
            activeDiagram={activeDiagram}
            activeDiagramId={activeDiagramId}
            documents={workspace.documents}
            selectedBlockId={workspace.state.selection.blockId}
            selectedConnectorId={workspace.state.selection.connectorId}
            selectedPortId={workspace.state.selection.port?.portId ?? null}
            onSelectBlock={workspace.selectBlock}
            onSelectConnector={workspace.selectConnector}
            onSelectPort={handleSelectPort}
            addBlock={addBlock}
            reuseBlock={reuseBlock}
            updateBlock={updateBlock}
            updateBlockPosition={updateBlockPosition}
            updateBlockSize={updateBlockSize}
            removeBlock={removeBlock}
            addPort={addPort}
            updatePort={updatePort}
            removePort={removePort}
            addConnector={addConnector}
            updateConnector={updateConnector}
            removeConnector={removeConnector}
            onOpenDocument={openDocument}
            onOpenFloatingDiagram={openFloatingDiagram}
            viewport={workspace.viewport}
            onViewportChange={viewport => {
              if (!activeDiagramId) return;
              workspace.rememberViewport(activeDiagramId, viewport);
            }}
            isLoading={isLoading}
            blockPresets={INTERFACE_PRESETS}
            computePlacement={computeBlockPlacement}
            mapConnectorToEdge={mapInterfaceConnectorToEdge}
            hideDefaultHandles={true}
          />

          <aside className="architecture-pane inspector-pane">
            {workspace.selectedBlock && (
              <BlockDetailsPanel
                block={workspace.selectedBlock}
                onUpdate={updates => updateBlock(workspace.selectedBlock!.id, updates)}
                onUpdatePosition={position => updateBlockPosition(workspace.selectedBlock!.id, position)}
                onUpdateSize={size => updateBlockSize(workspace.selectedBlock!.id, size)}
                onRemove={() => removeBlock(workspace.selectedBlock!.id)}
                onAddPort={port => addPort(workspace.selectedBlock!.id, port)}
                onUpdatePort={(portId, updates) => updatePort(workspace.selectedBlock!.id, portId, updates)}
                onRemovePort={portId => removePort(workspace.selectedBlock!.id, portId)}
                documents={workspace.documents}
                onAddDocument={documentId => addDocumentToBlock(workspace.selectedBlock!.id, documentId)}
                onRemoveDocument={documentId => removeDocumentFromBlock(workspace.selectedBlock!.id, documentId)}
              />
            )}

            {workspace.selectedConnector && (
              <ConnectorDetailsPanel
                connector={workspace.selectedConnector}
                onUpdate={updates => updateConnector(workspace.selectedConnector!.id, updates)}
                onRemove={() => removeConnector(workspace.selectedConnector!.id)}
                documents={workspace.documents}
                onAddDocument={documentId => addDocumentToConnector(workspace.selectedConnector!.id, documentId)}
                onRemoveDocument={documentId => removeDocumentFromConnector(workspace.selectedConnector!.id, documentId)}
              />
            )}

            {workspace.selectedPort && (
              <PortDetailsPanel
                port={workspace.selectedPort.port}
                blockName={workspace.selectedPort.block.name}
                onUpdate={updates => updatePort(workspace.selectedPort!.block.id, workspace.selectedPort!.port.id, updates)}
                onRemove={() => {
                  removePort(workspace.selectedPort!.block.id, workspace.selectedPort!.port.id);
                  workspace.selectPort(null, null);
                }}
              />
            )}

            {!workspace.selectedBlock && !workspace.selectedConnector && !workspace.selectedPort && (
              <div className="architecture-hint">
                <h3>Workspace tips</h3>
                <ul>
                  <li>Use the palette to drop new interface elements into the canvas.</li>
                  <li>Right-click the canvas or blocks for quick actions.</li>
                  <li>Drag handles between ports to author connectors.</li>
                  <li>Open blocks to link supporting documents.</li>
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>

      <Dialog open={workspace.dialogs.create.open} onOpenChange={(open) => {
        if (!open) {
          workspace.closeCreateDialog();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Diagram</DialogTitle>
            <DialogDescription>Enter a name for the new interface diagram.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Diagram name"
              value={workspace.dialogs.create.draftName}
              onChange={(event) => workspace.setCreateDialogName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleConfirmCreate();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <button className="ghost-button" onClick={workspace.closeCreateDialog}>
              Cancel
            </button>
            <button className="primary-button" onClick={handleConfirmCreate}>
              Create
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={workspace.dialogs.rename.open} onOpenChange={(open) => {
        if (!open) {
          workspace.closeRenameDialog();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Diagram</DialogTitle>
            <DialogDescription>Enter a new name for the diagram.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Diagram name"
              value={workspace.dialogs.rename.draftName}
              onChange={(event) => workspace.setRenameDialogName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleConfirmRename();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <button className="ghost-button" onClick={workspace.closeRenameDialog}>
              Cancel
            </button>
            <button className="primary-button" onClick={handleConfirmRename}>
              Rename
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={workspace.dialogs.confirmClear.open} onOpenChange={(open) => {
        if (!open) {
          workspace.closeConfirmClear();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Diagram</DialogTitle>
            <DialogDescription>Remove all blocks and connectors from the active diagram?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="ghost-button" onClick={workspace.closeConfirmClear}>
              Cancel
            </button>
            <button className="primary-button" onClick={confirmClearDiagram}>
              Clear
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Fragment>
  );
}
