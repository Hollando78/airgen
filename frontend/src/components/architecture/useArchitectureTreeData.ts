import { useMemo, useCallback } from "react";
import type { TreeItemIndex, TreeDataProvider, TreeItem } from "react-complex-tree";
import {
  Box,
  Boxes,
  Wrench,
  User,
  Globe,
  Plug,
  Folder,
  Link,
  BarChart3,
  Package as PackageIcon,
  CircleDot
} from "lucide-react";
import { createElement } from "react";
import type {
  ArchitectureBlockLibraryRecord,
  ArchitectureDiagramRecord,
  ArchitectureConnectorRecord,
  BlockPortRecord
} from "../../types";

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

export type TreeItemData = {
  id: string;
  type: 'root' | 'section' | 'package' | 'block' | 'diagram' | 'connector' | 'port';
  name: string;
  icon?: React.ReactNode;
  parentId?: string | null;
  children: string[];
  isFolder: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  canDrag?: boolean;
  data?:
    | Package
    | ArchitectureBlockLibraryRecord
    | ArchitectureDiagramRecord
    | ArchitectureConnectorRecord
    | { blockId: string; port: BlockPortRecord };
};

interface UseArchitectureTreeDataParams {
  blocks: ArchitectureBlockLibraryRecord[];
  diagrams: ArchitectureDiagramRecord[];
  connectors: ArchitectureConnectorRecord[];
  packages: Package[];
  currentDiagramId: string | null;
  blocksInDiagram: Set<string>;
  showPorts: boolean;
  onRenamePackage: (packageId: string, name: string) => Promise<void>;
  onMoveToPackage: (itemId: string, itemType: 'package' | 'block' | 'diagram', targetPackageId: string | null) => Promise<void>;
  onReorderItems: (packageId: string | null, itemIds: string[]) => Promise<void>;
}

function iconEl(Icon: typeof Box, className = "w-4 h-4", strokeWidth = 2) {
  return createElement(Icon, { className, strokeWidth });
}

function getBlockIcon(kind: string): React.ReactNode {
  switch (kind) {
    case 'system': return iconEl(Box);
    case 'subsystem': return iconEl(Boxes);
    case 'component': return iconEl(Wrench);
    case 'actor': return iconEl(User);
    case 'external': return iconEl(Globe);
    case 'interface': return iconEl(Plug);
    default: return iconEl(Box);
  }
}

export function useArchitectureTreeData({
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
}: UseArchitectureTreeDataParams) {
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

    // Section headers
    items['packages-section'] = {
      id: 'packages-section',
      type: 'section',
      name: 'Packages',
      icon: iconEl(PackageIcon),
      children: [],
      isFolder: true
    };

    items['diagrams-section'] = {
      id: 'diagrams-section',
      type: 'section',
      name: 'Diagrams',
      icon: iconEl(BarChart3),
      children: [],
      isFolder: true
    };

    items['blocks-section'] = {
      id: 'blocks-section',
      type: 'section',
      name: 'Blocks',
      icon: iconEl(Box),
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

    rootPackages.sort((a, b) => a.order - b.order);
    childPackagesByParent.forEach(children => children.sort((a, b) => a.order - b.order));

    const addPortsToBlock = (block: ArchitectureBlockLibraryRecord): string[] => {
      const portChildren: string[] = [];
      if (showPorts && block.ports?.length) {
        block.ports.forEach((port, index) => {
          const portKey = `port-${block.id}-${port.id || index}`;
          portChildren.push(portKey);

          items[portKey] = {
            id: port.id,
            type: 'port',
            name: port.direction && port.direction !== "none"
              ? `${port.name} (${port.direction.toUpperCase()})`
              : port.name,
            icon: iconEl(CircleDot, "w-3.5 h-3.5", 2.5),
            children: [],
            isFolder: false,
            canRename: false,
            canDelete: false,
            canDrag: false,
            data: { blockId: block.id, port }
          };
        });
      }
      return portChildren;
    };

    const addConnectorsForDiagram = (diagram: ArchitectureDiagramRecord): string[] => {
      const diagramConnectors = connectors.filter(c => c.diagramId === diagram.id);
      diagramConnectors.forEach(connector => {
        const connectorKey = `connector-${connector.id}`;
        items[connectorKey] = {
          id: connector.id,
          type: 'connector',
          name: connector.label || `${connector.source} → ${connector.target}`,
          icon: iconEl(Link),
          children: [],
          isFolder: false,
          canRename: false,
          canDelete: false,
          canDrag: false,
          data: connector
        };
      });
      return diagramConnectors.map(c => `connector-${c.id}`);
    };

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
        const diagramChildren = addConnectorsForDiagram(diagram);

        items[diagramKey] = {
          id: diagram.id,
          type: 'diagram',
          name: diagram.name,
          icon: iconEl(BarChart3),
          children: diagramChildren,
          isFolder: diagramChildren.length > 0,
          canRename: false,
          canDelete: true,
          canDrag: true,
          data: diagram
        };

        children.push(diagramKey);
      });

      // Add blocks in this package
      const blocksInPackage = blocks.filter(b => b.packageId === pkg.id);
      blocksInPackage.forEach(block => {
        const blockKey = `block-${block.id}`;
        const portChildren = addPortsToBlock(block);

        items[blockKey] = {
          id: block.id,
          type: 'block',
          name: block.name,
          icon: getBlockIcon(block.kind),
          children: portChildren,
          isFolder: portChildren.length > 0,
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
        icon: iconEl(Folder),
        parentId: pkg.parentId,
        children,
        isFolder: true,
        canRename: true,
        canDelete: true,
        canDrag: true,
        data: pkg
      };

      items[parentKey].children.push(packageKey);
    };

    rootPackages.forEach(pkg => addPackageToTree(pkg, 'packages-section'));

    // Add diagrams not in packages
    diagrams.filter(d => !d.packageId).forEach(diagram => {
      const diagramKey = `diagram-${diagram.id}`;
      const children = addConnectorsForDiagram(diagram);

      items[diagramKey] = {
        id: diagram.id,
        type: 'diagram',
        name: diagram.name,
        icon: iconEl(BarChart3),
        children,
        isFolder: children.length > 0,
        canRename: false,
        canDelete: true,
        canDrag: true,
        data: diagram
      };

      items['diagrams-section'].children.push(diagramKey);
    });

    // Add blocks not in packages
    blocks.filter(b => !b.packageId).forEach(block => {
      const blockKey = `block-${block.id}`;
      const portChildren = addPortsToBlock(block);

      items[blockKey] = {
        id: block.id,
        type: 'block',
        name: block.name,
        icon: getBlockIcon(block.kind),
        children: portChildren,
        isFolder: portChildren.length > 0,
        canRename: false,
        canDelete: false,
        canDrag: true,
        data: block
      };

      items['blocks-section'].children.push(blockKey);
    });

    return items;
  }, [blocks, diagrams, connectors, packages, currentDiagramId, blocksInDiagram, showPorts]);

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
        children: item.children
      };
    },

    async onChangeItemChildren(itemId: TreeItemIndex, newChildren: TreeItemIndex[]): Promise<void> {
      const parentItem = treeData[itemId];
      if (!parentItem) return;

      let targetPackageId: string | null = null;
      if (parentItem.type === 'package') {
        targetPackageId = parentItem.id;
      } else if (parentItem.type === 'section') {
        targetPackageId = null;
      } else {
        return;
      }

      // Find items newly added to this parent
      const originalChildren = new Set(parentItem.children);
      const newlyAddedChildren = newChildren.filter(child => !originalChildren.has(String(child)));

      for (const childKey of newlyAddedChildren) {
        const childKeyStr = String(childKey);
        let movedItemId: string;
        let itemType: 'package' | 'block' | 'diagram';

        if (childKeyStr.startsWith('package-')) {
          movedItemId = childKeyStr.substring(8);
          itemType = 'package';
        } else if (childKeyStr.startsWith('diagram-')) {
          movedItemId = childKeyStr.substring(8);
          itemType = 'diagram';
        } else if (childKeyStr.startsWith('block-')) {
          movedItemId = childKeyStr.substring(6);
          itemType = 'block';
        } else {
          continue;
        }

        await onMoveToPackage(movedItemId, itemType, targetPackageId);
      }

      const itemIds = newChildren.map(child => {
        const childStr = String(child);
        if (childStr.startsWith('package-')) return childStr.substring(8);
        if (childStr.startsWith('diagram-')) return childStr.substring(8);
        if (childStr.startsWith('block-')) return childStr.substring(6);
        if (childStr.startsWith('connector-')) return childStr.substring(10);
        if (childStr.startsWith('port-')) return null;
        return childStr;
      }).filter((value): value is string => Boolean(value));

      if (itemIds.length > 0) {
        await onReorderItems(targetPackageId, itemIds);
      }
    },

    async onRenameItem(item: TreeItem<TreeItemData>, name: string): Promise<void> {
      if (item.data.type === 'package') {
        await onRenamePackage(item.data.id, name);
      }
    },

    async onDidSelectItems(): Promise<void> {
      // Selection handled by component state
    }
  }), [treeData, onRenamePackage, onMoveToPackage, onReorderItems]);

  return { treeData, dataProvider };
}
