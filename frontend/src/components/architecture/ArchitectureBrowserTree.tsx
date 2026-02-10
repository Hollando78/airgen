import { useState, useCallback, useEffect, useRef } from "react";
import {
  UncontrolledTreeEnvironment,
  Tree,
  TreeItem,
  TreeItemIndex
} from "react-complex-tree";
import {
  BarChart3,
  Folder,
  Plus,
  Check,
  ExternalLink
} from "lucide-react";
import { ImagineModal } from "../imagine/ImagineModal";
import type {
  ArchitectureBlockLibraryRecord,
  ArchitectureDiagramRecord,
  ArchitectureConnectorRecord,
  BlockPortRecord
} from "../../types";
import { useArchitectureTreeData, type TreeItemData } from "./useArchitectureTreeData";
import "react-complex-tree/lib/style-modern.css";

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

type ContextMenuItem = {
  label: string;
  action: () => void;
  variant?: 'default' | 'danger';
};

type ContextMenuState = {
  x: number;
  y: number;
  itemId: string;
  items: ContextMenuItem[];
} | null;

interface ArchitectureBrowserTreeProps {
  blocks: ArchitectureBlockLibraryRecord[];
  diagrams: ArchitectureDiagramRecord[];
  connectors: ArchitectureConnectorRecord[];
  packages: Package[];
  refreshKey: number;
  disabled: boolean;
  isLoading: boolean;
  error?: unknown;
  onInsertBlock: (blockId: string) => void;
  onOpenDiagram: (diagramId: string) => void;
  onCreatePackage: (name: string, parentId?: string | null) => Promise<void>;
  onDeletePackage: (packageId: string) => Promise<void>;
  onRenamePackage: (packageId: string, name: string) => Promise<void>;
  onMoveToPackage: (itemId: string, itemType: 'package' | 'block' | 'diagram', targetPackageId: string | null) => Promise<void>;
  onReorderItems: (packageId: string | null, itemIds: string[]) => Promise<void>;
  onCreateDiagram: (name: string, packageId?: string | null) => Promise<void>;
  onDeleteDiagram: (diagramId: string) => Promise<void>;
  currentDiagramId: string | null;
  blocksInDiagram: Set<string>;
  showPorts?: boolean;
}

export function ArchitectureBrowserTree({
  blocks,
  diagrams,
  connectors,
  packages,
  refreshKey,
  disabled,
  isLoading,
  error,
  onInsertBlock,
  onOpenDiagram,
  onCreatePackage,
  onDeletePackage,
  onRenamePackage,
  onMoveToPackage,
  onReorderItems,
  onCreateDiagram,
  onDeleteDiagram,
  currentDiagramId,
  blocksInDiagram,
  showPorts = false
}: ArchitectureBrowserTreeProps) {
  const [focusedItem, setFocusedItem] = useState<TreeItemIndex>();
  const [expandedItems, setExpandedItems] = useState<TreeItemIndex[]>(['root', 'packages-section', 'diagrams-section', 'blocks-section']);
  const [selectedItems, setSelectedItems] = useState<TreeItemIndex[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [imagineModal, setImagineModal] = useState<{ id: string; type: 'Block' | 'Interface'; name: string; documentIds?: string[]; diagramId?: string } | null>(null);
  const previousDataRef = useRef<{ blocks: ArchitectureBlockLibraryRecord[]; diagrams: ArchitectureDiagramRecord[]; connectors: ArchitectureConnectorRecord[]; packages: Package[] }>({
    blocks,
    diagrams,
    connectors,
    packages
  });
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const prev = previousDataRef.current;
    if (prev.blocks !== blocks || prev.diagrams !== diagrams || prev.connectors !== connectors || prev.packages !== packages) {
      previousDataRef.current = { blocks, diagrams, connectors, packages };
      setDataVersion(version => version + 1);
    }
  }, [blocks, diagrams, connectors, packages]);

  const { treeData, dataProvider } = useArchitectureTreeData({
    blocks,
    diagrams,
    connectors,
    packages,
    currentDiagramId,
    blocksInDiagram,
    showPorts,
    onRenamePackage,
    onMoveToPackage,
    onReorderItems
  });

  // Handle item click/activation
  const handlePrimaryAction = useCallback((item: TreeItem<TreeItemData>) => {
    if (item.data.type === 'block') {
      onInsertBlock(item.data.id);
    } else if (item.data.type === 'diagram') {
      onOpenDiagram(item.data.id);
    }
  }, [onInsertBlock, onOpenDiagram]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [contextMenu]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, itemId: TreeItemIndex) => {
    e.preventDefault();
    const item = treeData[itemId];
    let menuItems: ContextMenuItem[] = [];

    if (item.type === 'package') {
      menuItems = [
        { label: 'New Package', action: () => {
          setContextMenu(null);
          const name = prompt('Package name:');
          if (name) onCreatePackage(name, item.id);
        }},
        { label: 'New Diagram', action: () => {
          setContextMenu(null);
          const name = prompt('Diagram name:');
          if (name) onCreateDiagram(name, item.id);
        }},
        { label: 'Rename', action: () => {
          setContextMenu(null);
          const name = prompt('New name:', item.name);
          if (name && name !== item.name) onRenamePackage(item.id, name);
        }},
        { label: 'Delete', action: () => {
          setContextMenu(null);
          if (confirm(`Delete package "${item.name}"?`)) {
            onDeletePackage(item.id);
          }
        }, variant: 'danger' }
      ];
    } else if (item.type === 'diagram') {
      menuItems = [
        { label: 'Open', action: () => {
          setContextMenu(null);
          onOpenDiagram(item.id);
        }},
        { label: 'Delete', action: () => {
          setContextMenu(null);
          if (confirm(`Delete diagram "${item.name}"?`)) {
            onDeleteDiagram(item.id);
          }
        }, variant: 'danger' }
      ];
    } else if (item.type === 'block') {
      menuItems = [
        { label: 'Generate Imagine', action: () => {
          setContextMenu(null);
          setImagineModal({
            id: item.id,
            type: 'Block',
            name: item.name,
            documentIds: (item.data as any)?.documentIds
          });
        }}
      ];
    } else if (item.type === 'section') {
      if (item.id === 'packages-section') {
        menuItems = [
          { label: 'New Package', action: () => {
            setContextMenu(null);
            const name = prompt('Package name:');
            if (name) onCreatePackage(name, null);
          }}
        ];
      } else if (item.id === 'diagrams-section') {
        menuItems = [
          { label: 'New Diagram', action: () => {
            setContextMenu(null);
            const name = prompt('Diagram name:');
            if (name) onCreateDiagram(name, null);
          }}
        ];
      }
    }

    if (menuItems.length > 0) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        itemId: String(itemId),
        items: menuItems
      });
    }
  }, [treeData, onCreatePackage, onCreateDiagram, onRenamePackage, onDeletePackage, onOpenDiagram, onDeleteDiagram]);

  if (isLoading) {
    return (
      <div className="architecture-browser">
        <div className="browser-header">
          <h3>Architecture Browser</h3>
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="architecture-browser">
        <div className="browser-header">
          <h3>Architecture Browser</h3>
          <p className="browser-error">Failed to load architecture.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="architecture-browser tree-browser">
      <div className="browser-header">
        <h3>Architecture Browser</h3>
        <div className="browser-actions">
          <button
            className="create-package-button"
            onClick={() => {
              const name = prompt('Package name:');
              if (name) onCreatePackage(name, null);
            }}
            title="Create new package"
            disabled={disabled}
          >
            <Folder className="w-4 h-4" strokeWidth={2} />
            <Plus className="w-3 h-3" strokeWidth={2.5} />
          </button>
          <button
            className="create-diagram-button"
            onClick={() => {
              const name = prompt('Diagram name:');
              if (name) onCreateDiagram(name, null);
            }}
            title="Create new diagram"
            disabled={disabled}
          >
            <BarChart3 className="w-4 h-4" strokeWidth={2} />
            <Plus className="w-3 h-3" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="tree-container">
        <UncontrolledTreeEnvironment
          key={`${refreshKey}-${dataVersion}`}
          dataProvider={dataProvider}
          getItemTitle={(item) => item.data.name}
          viewState={{
            ['architecture-tree']: {
              focusedItem,
              expandedItems,
              selectedItems
            }
          }}
          onFocusItem={(item) => setFocusedItem(item.index)}
          onExpandItem={(item) => setExpandedItems(prev => [...prev, item.index])}
          onCollapseItem={(item) => setExpandedItems(prev => prev.filter(i => i !== item.index))}
          onSelectItems={(items, _treeId) => setSelectedItems(items)}
          onPrimaryAction={(item) => handlePrimaryAction(item)}
          canDragAndDrop={true}
          canDropOnFolder={true}
          canReorderItems={true}
          renderItemTitle={({ item }) => {
            const data = item.data;
            const alreadyInDiagram = data.type === 'block' && currentDiagramId ? blocksInDiagram.has(data.id) : false;
            const portMeta = data.type === 'port' ? (data.data as { blockId: string; port: BlockPortRecord } | undefined) : undefined;

            return (
              <div
                className={`tree-item-title ${data.type} ${alreadyInDiagram ? 'in-diagram' : ''}`}
                onContextMenu={(e) => handleContextMenu(e, item.index)}
              >
                {data.icon && <span className="tree-icon">{data.icon}</span>}
                <span className="tree-label">{data.name}</span>
                {data.type === 'block' && (
                  <button
                    className="tree-add-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInsertBlock(data.id);
                    }}
                    disabled={disabled || alreadyInDiagram}
                    title={alreadyInDiagram ? "Already in diagram" : "Add to diagram"}
                  >
                    {alreadyInDiagram ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />}
                  </button>
                )}
                {data.type === 'diagram' && (
                  <button
                    className="tree-open-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDiagram(data.id);
                    }}
                    disabled={disabled}
                    title="Open diagram"
                  >
                    <ExternalLink className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                )}
                {data.type === 'port' && portMeta?.port.direction && portMeta.port.direction !== "none" && (
                  <span className="tree-port-direction">
                    {portMeta.port.direction.toUpperCase()}
                  </span>
                )}
              </div>
            );
          }}
        >
          <Tree treeId="architecture-tree" rootItem="root" treeLabel="Architecture Browser" />
        </UncontrolledTreeEnvironment>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            zIndex: 9999,
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            minWidth: '180px',
            padding: '4px',
          }}
        >
          {contextMenu.items.map((item, index) => (
            <button
              key={index}
              className={`context-menu-item ${item.variant === 'danger' ? 'danger' : ''}`}
              onClick={item.action}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                borderRadius: '4px',
                color: item.variant === 'danger' ? '#ef4444' : '#1f2937',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = item.variant === 'danger'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'var(--bg-hover, rgba(0, 0, 0, 0.05))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Imagine Modal */}
      {imagineModal && (() => {
        const tenant = blocks[0]?.tenant || diagrams[0]?.tenant || packages[0]?.tenant || '';
        const project = blocks[0]?.projectKey || diagrams[0]?.projectKey || packages[0]?.projectKey || '';

        return (
          <ImagineModal
            isOpen={true}
            onClose={() => setImagineModal(null)}
            elementId={imagineModal.id}
            elementType={imagineModal.type}
            elementName={imagineModal.name}
            tenant={tenant}
            project={project}
            documentIds={imagineModal.documentIds}
            diagramId={imagineModal.diagramId}
          />
        );
      })()}
    </div>
  );
}
