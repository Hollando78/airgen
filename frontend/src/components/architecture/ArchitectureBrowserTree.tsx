import { useState, useCallback, useMemo } from "react";
import {
  UncontrolledTreeEnvironment,
  Tree,
  TreeItem,
  TreeItemIndex,
  TreeDataProvider
} from "react-complex-tree";
import {
  Package as PackageIcon,
  BarChart3,
  Box,
  Boxes,
  Wrench,
  User,
  Globe,
  Plug,
  Folder,
  Link,
  Plus,
  Check,
  ExternalLink
} from "lucide-react";
import type {
  ArchitectureBlockLibraryRecord,
  ArchitectureDiagramRecord,
  ArchitectureConnectorRecord
} from "../../types";
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

interface ArchitectureBrowserTreeProps {
  blocks: ArchitectureBlockLibraryRecord[];
  diagrams: ArchitectureDiagramRecord[];
  connectors: ArchitectureConnectorRecord[];
  packages: Package[];
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
}

type TreeItemData = {
  id: string;
  type: 'root' | 'section' | 'package' | 'block' | 'diagram' | 'connector';
  name: string;
  icon?: React.ReactNode;
  parentId?: string | null;
  children: string[];
  isFolder: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  canDrag?: boolean;
  data?: Package | ArchitectureBlockLibraryRecord | ArchitectureDiagramRecord | ArchitectureConnectorRecord;
};

export function ArchitectureBrowserTree({
  blocks,
  diagrams,
  connectors,
  packages,
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
  blocksInDiagram
}: ArchitectureBrowserTreeProps) {
  const [focusedItem, setFocusedItem] = useState<TreeItemIndex>();
  const [expandedItems, setExpandedItems] = useState<TreeItemIndex[]>(['root', 'packages-section', 'diagrams-section', 'blocks-section']);
  const [selectedItems, setSelectedItems] = useState<TreeItemIndex[]>([]);

  // Helper function to get block icon (must be defined before treeData)
  const getBlockIcon = useCallback((kind: string): React.ReactNode => {
    const iconProps = { className: "w-4 h-4", strokeWidth: 2 };
    switch (kind) {
      case 'system': return <Box {...iconProps} />;
      case 'subsystem': return <Boxes {...iconProps} />;
      case 'component': return <Wrench {...iconProps} />;
      case 'actor': return <User {...iconProps} />;
      case 'external': return <Globe {...iconProps} />;
      case 'interface': return <Plug {...iconProps} />;
      default: return <Box {...iconProps} />;
    }
  }, []);

  // Build tree data structure
  const treeData = useMemo<Record<TreeItemIndex, TreeItemData>>(() => {
    const items: Record<TreeItemIndex, TreeItemData> = {};

    // Root item
    items['root'] = {
      id: 'root',
      type: 'root',
      name: 'Architecture Browser',
      children: ['packages-section', 'diagrams-section', 'blocks-section'],
      isFolder: true
    };

    // Packages section
    items['packages-section'] = {
      id: 'packages-section',
      type: 'section',
      name: 'Packages',
      icon: <PackageIcon className="w-4 h-4" strokeWidth={2} />,
      children: [],
      isFolder: true
    };

    // Diagrams section
    items['diagrams-section'] = {
      id: 'diagrams-section',
      type: 'section',
      name: 'Diagrams',
      icon: <BarChart3 className="w-4 h-4" strokeWidth={2} />,
      children: [],
      isFolder: true
    };

    // Blocks section
    items['blocks-section'] = {
      id: 'blocks-section',
      type: 'section',
      name: 'Blocks',
      icon: <Box className="w-4 h-4" strokeWidth={2} />,
      children: [],
      isFolder: true
    };

    // Build package hierarchy
    const rootPackages = packages.filter(p => !p.parentId);
    const childPackagesByParent = new Map<string, Package[]>();

    packages.forEach(pkg => {
      if (pkg.parentId) {
        if (!childPackagesByParent.has(pkg.parentId)) {
          childPackagesByParent.set(pkg.parentId, []);
        }
        childPackagesByParent.get(pkg.parentId)!.push(pkg);
      }
    });

    // Sort packages by order
    rootPackages.sort((a, b) => a.order - b.order);
    childPackagesByParent.forEach(children => children.sort((a, b) => a.order - b.order));

    // Add packages to tree recursively
    const addPackageToTree = (pkg: Package, parentKey: string) => {
      const packageKey = `package-${pkg.id}`;
      const children: string[] = [];

      // Add child packages
      const childPackages = childPackagesByParent.get(pkg.id) || [];
      childPackages.forEach(child => {
        children.push(`package-${child.id}`);
        addPackageToTree(child, packageKey);
      });

      // Add diagrams in this package
      const diagramsInPackage = diagrams.filter(d => d.packageId === pkg.id);
      diagramsInPackage.forEach(diagram => {
        const diagramKey = `diagram-${diagram.id}`;
        const diagramConnectors = connectors.filter(c => c.diagramId === diagram.id);
        const diagramChildren = diagramConnectors.map(c => `connector-${c.id}`);

        items[diagramKey] = {
          id: diagram.id,
          type: 'diagram',
          name: diagram.name,
          icon: <BarChart3 className="w-4 h-4" strokeWidth={2} />,
          children: diagramChildren,
          isFolder: diagramConnectors.length > 0,
          canRename: false,
          canDelete: true,
          canDrag: true,
          data: diagram
        };

        children.push(diagramKey);

        // Add connectors for this diagram
        diagramConnectors.forEach(connector => {
          const connectorKey = `connector-${connector.id}`;
          items[connectorKey] = {
            id: connector.id,
            type: 'connector',
            name: connector.label || `${connector.source} → ${connector.target}`,
            icon: <Link className="w-4 h-4" strokeWidth={2} />,
            children: [],
            isFolder: false,
            canRename: false,
            canDelete: false,
            canDrag: false,
            data: connector
          };
        });
      });

      // Add blocks in this package
      const blocksInPackage = blocks.filter(b => b.packageId === pkg.id);
      blocksInPackage.forEach(block => {
        const blockKey = `block-${block.id}`;
        items[blockKey] = {
          id: block.id,
          type: 'block',
          name: block.name,
          icon: getBlockIcon(block.kind),
          children: [],
          isFolder: false,
          canRename: false,
          canDelete: false,
          canDrag: true,
          data: block
        };

        children.push(blockKey);
      });

      items[packageKey] = {
        id: pkg.id,
        type: 'package',
        name: pkg.name,
        icon: <Folder className="w-4 h-4" strokeWidth={2} />,
        parentId: pkg.parentId,
        children,
        isFolder: true,
        canRename: true,
        canDelete: true,
        canDrag: true,
        data: pkg
      };

      // Add to parent's children
      items[parentKey].children.push(packageKey);
    };

    rootPackages.forEach(pkg => addPackageToTree(pkg, 'packages-section'));

    // Add diagrams to diagrams section (only those not in packages)
    diagrams.filter(d => !d.packageId).forEach(diagram => {
      const diagramKey = `diagram-${diagram.id}`;

      // Find connectors for this diagram
      const diagramConnectors = connectors.filter(c => c.diagramId === diagram.id);
      const children = diagramConnectors.map(c => `connector-${c.id}`);

      items[diagramKey] = {
        id: diagram.id,
        type: 'diagram',
        name: diagram.name,
        icon: <BarChart3 className="w-4 h-4" strokeWidth={2} />,
        children,
        isFolder: diagramConnectors.length > 0,
        canRename: false,
        canDelete: true,
        canDrag: true,
        data: diagram
      };

      items['diagrams-section'].children.push(diagramKey);

      // Add connectors
      diagramConnectors.forEach(connector => {
        const connectorKey = `connector-${connector.id}`;
        items[connectorKey] = {
          id: connector.id,
          type: 'connector',
          name: connector.label || `${connector.source} → ${connector.target}`,
          icon: <Link className="w-4 h-4" strokeWidth={2} />,
          children: [],
          isFolder: false,
          canRename: false,
          canDelete: false,
          canDrag: false,
          data: connector
        };
      });
    });

    // Add blocks to blocks section (only those not in packages)
    blocks.filter(b => !b.packageId).forEach(block => {
      const blockKey = `block-${block.id}`;
      const alreadyInDiagram = currentDiagramId ? blocksInDiagram.has(block.id) : false;

      items[blockKey] = {
        id: block.id,
        type: 'block',
        name: block.name,
        icon: getBlockIcon(block.kind),
        children: [],
        isFolder: false,
        canRename: false,
        canDelete: false,
        canDrag: true,
        data: block
      };

      items['blocks-section'].children.push(blockKey);
    });

    return items;
  }, [blocks, diagrams, connectors, packages, currentDiagramId, blocksInDiagram, getBlockIcon]);

  // TreeDataProvider implementation
  const dataProvider: TreeDataProvider = useMemo(() => ({
    async getTreeItem(itemId: TreeItemIndex): Promise<TreeItem<TreeItemData>> {
      const item = treeData[itemId];
      if (!item) {
        throw new Error(`Item ${itemId} not found`);
      }

      return {
        index: itemId,
        data: item,
        canMove: item.canDrag ?? false,
        canRename: item.canRename ?? false,
        isFolder: item.isFolder,
        children: item.children,
        hasChildren: item.children.length > 0
      };
    },

    async onChangeItemChildren(itemId: TreeItemIndex, newChildren: TreeItemIndex[]): Promise<void> {
      // Handle moving items to a new parent and reordering
      const parentItem = treeData[itemId];

      if (!parentItem) return;

      // Determine target package ID
      let targetPackageId: string | null = null;
      if (parentItem.type === 'package') {
        targetPackageId = parentItem.id;
      } else if (parentItem.type === 'section' && parentItem.id === 'packages-section') {
        targetPackageId = null; // Root level packages
      } else if (parentItem.type === 'section' && parentItem.id === 'diagrams-section') {
        targetPackageId = null; // Root level diagrams
      } else if (parentItem.type === 'section' && parentItem.id === 'blocks-section') {
        targetPackageId = null; // Root level blocks
      } else {
        // Can't move to other sections
        return;
      }

      // Find items that are newly added to this parent (not in original children)
      const originalChildren = new Set(parentItem.children);
      const newlyAddedChildren = newChildren.filter(child => !originalChildren.has(String(child)));

      // Move each newly added item to this package
      for (const childKey of newlyAddedChildren) {
        const childKeyStr = String(childKey);
        let itemId: string;
        let itemType: 'package' | 'block' | 'diagram';

        if (childKeyStr.startsWith('package-')) {
          itemId = childKeyStr.substring(8);
          itemType = 'package';
        } else if (childKeyStr.startsWith('diagram-')) {
          itemId = childKeyStr.substring(8);
          itemType = 'diagram';
        } else if (childKeyStr.startsWith('block-')) {
          itemId = childKeyStr.substring(6);
          itemType = 'block';
        } else {
          continue;
        }

        // Call the move handler
        await onMoveToPackage(itemId, itemType, targetPackageId);
      }

      // Handle reordering: extract IDs from the new children list
      const itemIds = newChildren.map(child => {
        const childStr = String(child);
        // Remove the prefix (package-, diagram-, block-, connector-)
        if (childStr.startsWith('package-')) return childStr.substring(8);
        if (childStr.startsWith('diagram-')) return childStr.substring(8);
        if (childStr.startsWith('block-')) return childStr.substring(6);
        if (childStr.startsWith('connector-')) return childStr.substring(10);
        return childStr;
      }).filter(Boolean);

      // Only call reorder if there are items and they've changed order
      if (itemIds.length > 0) {
        await onReorderItems(targetPackageId, itemIds);
      }
    },

    async onRenameItem(item: TreeItem<TreeItemData>, name: string): Promise<void> {
      if (item.data.type === 'package') {
        await onRenamePackage(item.data.id, name);
      }
    },

    async onDidSelectItems(items: TreeItemIndex[]): Promise<void> {
      setSelectedItems(items);
    }
  }), [treeData, onRenamePackage, onMoveToPackage, onReorderItems]);

  // Handle item click/activation
  const handlePrimaryAction = useCallback((items: TreeItem<TreeItemData>[]) => {
    if (items.length !== 1) return;

    const item = items[0];

    if (item.data.type === 'block') {
      onInsertBlock(item.data.id);
    } else if (item.data.type === 'diagram') {
      onOpenDiagram(item.data.id);
    }
  }, [onInsertBlock, onOpenDiagram]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, itemId: TreeItemIndex) => {
    e.preventDefault();
    const item = treeData[itemId];

    if (item.type === 'package') {
      // Show package context menu
      const menu = [
        { label: 'New Package', action: () => {
          const name = prompt('Package name:');
          if (name) onCreatePackage(name, item.id);
        }},
        { label: 'New Diagram', action: () => {
          const name = prompt('Diagram name:');
          if (name) onCreateDiagram(name, item.id);
        }},
        { label: 'Rename', action: () => {
          const name = prompt('New name:', item.name);
          if (name && name !== item.name) onRenamePackage(item.id, name);
        }},
        { label: 'Delete', action: () => {
          if (confirm(`Delete package "${item.name}"?`)) {
            onDeletePackage(item.id);
          }
        }}
      ];

      // Simple context menu implementation
      console.log('Context menu:', menu);

    } else if (item.type === 'diagram') {
      const menu = [
        { label: 'Open', action: () => onOpenDiagram(item.id) },
        { label: 'Delete', action: () => {
          if (confirm(`Delete diagram "${item.name}"?`)) {
            onDeleteDiagram(item.id);
          }
        }}
      ];

      console.log('Context menu:', menu);
    } else if (item.type === 'section') {
      if (item.id === 'packages-section') {
        const menu = [
          { label: 'New Package', action: () => {
            const name = prompt('Package name:');
            if (name) onCreatePackage(name, null);
          }}
        ];
        console.log('Context menu:', menu);
      } else if (item.id === 'diagrams-section') {
        const menu = [
          { label: 'New Diagram', action: () => {
            const name = prompt('Diagram name:');
            if (name) onCreateDiagram(name, null);
          }}
        ];
        console.log('Context menu:', menu);
      }
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
          onSelectItems={(items) => setSelectedItems(items)}
          onPrimaryAction={handlePrimaryAction}
          canDragAndDrop={true}
          canDropOnFolder={true}
          canReorderItems={true}
          onDrop={async (items, target) => {
            // Handle dropping items into a new location
            const targetId = String(target.targetItem);
            const targetItem = treeData[targetId];

            if (!targetItem) return;

            // Process each dropped item
            for (const droppedItemId of items) {
              const droppedKeyStr = String(droppedItemId);
              let itemId: string;
              let itemType: 'package' | 'block' | 'diagram';

              if (droppedKeyStr.startsWith('package-')) {
                itemId = droppedKeyStr.substring(8);
                itemType = 'package';
              } else if (droppedKeyStr.startsWith('diagram-')) {
                itemId = droppedKeyStr.substring(8);
                itemType = 'diagram';
              } else if (droppedKeyStr.startsWith('block-')) {
                itemId = droppedKeyStr.substring(6);
                itemType = 'block';
              } else {
                continue;
              }

              // Determine target package ID
              let targetPackageId: string | null = null;
              if (targetItem.type === 'package') {
                targetPackageId = targetItem.id;
              } else if (targetItem.type === 'section') {
                // Dropping into section means root level
                targetPackageId = null;
              }

              // Move item to new package
              await onMoveToPackage(itemId, itemType, targetPackageId);
            }
          }}
          renderItemTitle={({ item, context }) => {
            const data = item.data;
            const alreadyInDiagram = data.type === 'block' && currentDiagramId ? blocksInDiagram.has(data.id) : false;

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
              </div>
            );
          }}
        >
          <Tree treeId="architecture-tree" rootItem="root" treeLabel="Architecture Browser" />
        </UncontrolledTreeEnvironment>
      </div>
    </div>
  );
}
