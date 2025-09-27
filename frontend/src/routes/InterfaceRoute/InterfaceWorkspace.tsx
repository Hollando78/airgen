import { useCallback, useMemo, useRef, useState } from "react";
import { BlockDetailsPanel } from "../../components/architecture/BlockDetailsPanel";
import { ConnectorDetailsPanel } from "../../components/architecture/ConnectorDetailsPanel";
import { ArchitectureTreeBrowser } from "../../components/architecture/ArchitectureTreeBrowser";
import { FloatingDocumentWindow } from "../../components/FloatingDocumentWindow";
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
import { InterfacePalette } from "./components/InterfacePalette";
import { DiagramTabs } from "../ArchitectureRoute/components/DiagramTabs";
import { DiagramCanvas, type DiagramCanvasHandle } from "../../components/diagram/DiagramCanvas";
import { INTERFACE_PRESETS } from "./constants";
import { computeBlockPlacement } from "../ArchitectureRoute/utils/diagram";
import { mapInterfaceConnectorToEdge } from "./utils/diagram";
import type { BlockPreset } from "./types";
import { useFloatingDocumentsManager } from "../ArchitectureRoute/hooks/useFloatingDocumentsManager";

interface InterfaceWorkspaceProps {
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
  updatePort: (blockId: string, portId: string, updates: { name?: string; direction?: PortDirection }) => void;
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
  blocksLibrary: ArchitectureBlockLibraryRecord[];
  isLibraryLoading: boolean;
  libraryError: unknown;
  hasChanges: boolean;
  isLoading: boolean;
  documents: DocumentRecord[];
}

export function InterfaceWorkspace({
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
  blocksLibrary,
  isLibraryLoading,
  libraryError,
  hasChanges,
  isLoading,
  documents: documentList
}: InterfaceWorkspaceProps): JSX.Element {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const canvasRef = useRef<DiagramCanvasHandle>(null);

  const {
    floatingDocuments,
    openDocument,
    closeDocument
  } = useFloatingDocumentsManager({ documents: documentList });

  const documents = useMemo(() => documentList, [documentList]);
  const blocksInDiagram = useMemo(() => new Set(architecture.blocks.map(block => block.id)), [architecture.blocks]);

  const handleCreateDiagram = useCallback(async () => {
    const baseName = `View ${diagrams.length + 1}`;
    const name = window.prompt("Name for the new diagram", baseName);
    if (!name || !name.trim()) return;

    try {
      await createDiagram({ name: name.trim() });
    } catch (error) {
      window.alert((error as Error).message);
    }
  }, [createDiagram, diagrams.length]);

  const handleRenameDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) return;

    const nextName = window.prompt("Rename diagram", diagram.name);
    if (!nextName || !nextName.trim() || nextName.trim() === diagram.name) return;

    renameDiagram(diagramId, { name: nextName.trim() }).catch(error => {
      window.alert((error as Error).message);
    });
  }, [diagrams, renameDiagram]);

  const handleDeleteDiagram = useCallback((diagramId: string) => {
    const diagram = diagrams.find(item => item.id === diagramId);
    if (!diagram) return;
    const confirmed = window.confirm(`Delete diagram "${diagram.name}"? This removes its blocks and connectors.`);
    if (!confirmed) return;
    deleteDiagram(diagramId).catch(error => {
      window.alert((error as Error).message);
    });
  }, [deleteDiagram, diagrams]);

  const handleClearDiagram = useCallback(() => {
    if (!activeDiagramId || !hasChanges) return;
    if (!window.confirm("Remove all blocks and connectors from this diagram?")) return;
    clearArchitecture();
  }, [activeDiagramId, clearArchitecture, hasChanges]);

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
        diagrams={diagrams.map(diagram => ({ id: diagram.id, name: diagram.name }))}
        activeDiagramId={activeDiagramId}
        onSelect={setActiveDiagramId}
        onRename={handleRenameDiagram}
        onDelete={handleDeleteDiagram}
      />

      <div className="architecture-body">
        <aside className="architecture-pane palette-pane">
          <InterfacePalette
            presets={INTERFACE_PRESETS}
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
          addPort={addPort}
          updatePort={updatePort}
          removePort={removePort}
          addConnector={addConnector}
          updateConnector={updateConnector}
          removeConnector={removeConnector}
          onOpenDocument={openDocument}
          isLoading={isLoading}
          blockPresets={INTERFACE_PRESETS}
          computePlacement={computeBlockPlacement}
          mapConnectorToEdge={mapInterfaceConnectorToEdge}
        />

        <aside className="architecture-pane inspector-pane">
          {selectedBlock && (
            <BlockDetailsPanel
              block={selectedBlock}
              onUpdate={updates => updateBlock(selectedBlock.id, updates)}
              onUpdatePosition={position => updateBlockPosition(selectedBlock.id, position)}
              onUpdateSize={size => updateBlockSize(selectedBlock.id, size)}
              onRemove={() => removeBlock(selectedBlock.id)}
              onAddPort={port => addPort(selectedBlock.id, port)}
              onUpdatePort={(portId, updates) => updatePort(selectedBlock.id, portId, updates)}
              onRemovePort={portId => removePort(selectedBlock.id, portId)}
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
            />
          )}

          {!selectedBlock && !selectedConnector && (
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

      {floatingDocuments.map(doc => (
        <FloatingDocumentWindow
          key={doc.id}
          tenant={tenant}
          project={project}
          documentSlug={doc.documentSlug}
          documentName={doc.documentName}
          initialPosition={doc.position}
          onClose={() => closeDocument(doc.id)}
        />
      ))}
    </div>
  );
}
