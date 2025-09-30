import { useState, useCallback, useRef, useEffect } from "react";
import type { ArchitectureBlockLibraryRecord } from "../../types";

interface Package {
  id: string;
  name: string;
  children: (Package | ArchitectureBlockLibraryRecord)[];
  parentId?: string;
  collapsed?: boolean;
}

interface ArchitectureTreeBrowserProps {
  blocks: ArchitectureBlockLibraryRecord[];
  disabled: boolean;
  isLoading: boolean;
  error?: unknown;
  onInsert: (blockId: string) => void;
  currentDiagramId: string | null;
  blocksInDiagram: Set<string>;
}

type TreeNode = Package | ArchitectureBlockLibraryRecord;

function isPackage(node: TreeNode): node is Package {
  return 'children' in node;
}

function isBlock(node: TreeNode): node is ArchitectureBlockLibraryRecord {
  return !('children' in node);
}

export function ArchitectureTreeBrowser({ 
  blocks, 
  disabled, 
  isLoading, 
  error, 
  onInsert, 
  currentDiagramId, 
  blocksInDiagram 
}: ArchitectureTreeBrowserProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [draggedItem, setDraggedItem] = useState<{ type: 'block' | 'package', id: string } | null>(null);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set());
  const dragCounter = useRef(0);

  // Helper function to normalize stereotypes (handle both plain and SysML format)
  const normalizeStereotype = (stereotype: string | null | undefined): string => {
    if (!stereotype) return '';
    // Remove angle brackets if present: <<system>> -> system
    return stereotype.replace(/^<<(.+)>>$/, '$1');
  };

  // Initialize with default packages and organize blocks
  useEffect(() => {
    const rootPackages: Package[] = [
      {
        id: 'systems',
        name: 'Systems',
        children: blocks.filter(b => {
          const normalized = normalizeStereotype(b.stereotype);
          return normalized === 'block' || normalized === 'system';
        }),
        collapsed: false
      },
      {
        id: 'subsystems',
        name: 'Subsystems', 
        children: blocks.filter(b => normalizeStereotype(b.stereotype) === 'subsystem'),
        collapsed: false
      },
      {
        id: 'components',
        name: 'Components',
        children: blocks.filter(b => normalizeStereotype(b.stereotype) === 'component'),
        collapsed: false
      },
      {
        id: 'actors',
        name: 'Actors',
        children: blocks.filter(b => normalizeStereotype(b.stereotype) === 'actor'),
        collapsed: false
      },
      {
        id: 'external',
        name: 'External',
        children: blocks.filter(b => normalizeStereotype(b.stereotype) === 'external'),
        collapsed: false
      }
    ];
    
    setPackages(rootPackages);
    setExpandedPackages(new Set(['systems', 'subsystems', 'components', 'actors', 'external']));
  }, [blocks]);

  const togglePackage = useCallback((packageId: string) => {
    setExpandedPackages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(packageId)) {
        newSet.delete(packageId);
      } else {
        newSet.add(packageId);
      }
      return newSet;
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, type: 'block' | 'package', id: string) => {
    setDraggedItem({ type, id });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${type}:${id}`);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
    dragCounter.current = 0;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (draggedItem) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  }, [draggedItem]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    dragCounter.current--;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetPackageId: string) => {
    e.preventDefault();
    dragCounter.current = 0;
    
    const data = e.dataTransfer.getData('text/plain');
    const [type, id] = data.split(':');
    
    if (type === 'block' && draggedItem?.type === 'block') {
      // Move block to target package
      setPackages(prevPackages => {
        return prevPackages.map(pkg => {
          if (pkg.id === targetPackageId) {
            // Add block to target package if not already there
            const blockExists = pkg.children.some(child => isBlock(child) && child.id === id);
            if (!blockExists) {
              const block = blocks.find(b => b.id === id);
              if (block) {
                return {
                  ...pkg,
                  children: [...pkg.children, block]
                };
              }
            }
          } else {
            // Remove block from other packages
            return {
              ...pkg,
              children: pkg.children.filter(child => !(isBlock(child) && child.id === id))
            };
          }
          return pkg;
        });
      });
    }
    
    setDraggedItem(null);
  }, [draggedItem, blocks]);

  const createNewPackage = useCallback(() => {
    const name = prompt('Package name:');
    if (name) {
      const newPackage: Package = {
        id: `package-${Date.now()}`,
        name,
        children: [],
        collapsed: false
      };
      setPackages(prev => [...prev, newPackage]);
      setExpandedPackages(prev => new Set([...prev, newPackage.id]));
    }
  }, []);

  const renderTreeNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    if (isPackage(node)) {
      const isExpanded = expandedPackages.has(node.id);
      const hasChildren = node.children.length > 0;
      
      return (
        <div key={node.id} className="tree-node package-node" style={{ marginLeft: `${depth * 16}px` }}>
          <div 
            className={`tree-item package-item ${draggedItem?.id === node.id ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, 'package', node.id)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node.id)}
          >
            <span 
              className="tree-expand-icon"
              onClick={() => togglePackage(node.id)}
              style={{ opacity: hasChildren ? 1 : 0.3 }}
            >
              {hasChildren ? (isExpanded ? '▼' : '▶') : '●'}
            </span>
            <span className="tree-icon">📁</span>
            <span className="tree-label">{node.name}</span>
            <span className="tree-count">({node.children.length})</span>
          </div>
          {isExpanded && hasChildren && (
            <div className="tree-children">
              {node.children.map(child => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      // Block node
      const alreadyInDiagram = currentDiagramId ? blocksInDiagram.has(node.id) : false;
      
      return (
        <div 
          key={node.id} 
          className="tree-node block-node" 
          style={{ marginLeft: `${depth * 16}px` }}
        >
          <div 
            className={`tree-item block-item ${draggedItem?.id === node.id ? 'dragging' : ''} ${alreadyInDiagram ? 'in-diagram' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, 'block', node.id)}
            onDragEnd={handleDragEnd}
          >
            <span className="tree-expand-icon" style={{ opacity: 0 }}></span>
            <span className="tree-icon">
              {node.stereotype === 'block' && '🔷'}
              {node.stereotype === 'subsystem' && '🔶'}
              {node.stereotype === 'component' && '🔧'}
              {node.stereotype === 'actor' && '👤'}
              {node.stereotype === 'external' && '🌐'}
            </span>
            <span className="tree-label">{node.name}</span>
            {node.stereotype && <span className="tree-stereotype">{node.stereotype}</span>}
            <button
              className="tree-add-button"
              onClick={() => onInsert(node.id)}
              disabled={disabled || alreadyInDiagram}
              title={alreadyInDiagram ? "Already in diagram" : "Add to diagram"}
            >
              {alreadyInDiagram ? '✓' : '+'}
            </button>
          </div>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="architecture-browser">
        <div className="browser-header">
          <h3>Architecture Browser</h3>
          <p>Loading reusable blocks…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="architecture-browser">
        <div className="browser-header">
          <h3>Architecture Browser</h3>
          <p className="browser-error">Failed to load block library.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="architecture-browser tree-browser">
      <div className="browser-header">
        <h3>Architecture Browser</h3>
        <div className="browser-actions">
          <p>Organize and reuse blocks</p>
          <button 
            className="create-package-button"
            onClick={createNewPackage}
            title="Create new package"
          >
            📁+
          </button>
        </div>
      </div>
      
      {blocks.length === 0 ? (
        <div className="browser-empty">
          No reusable blocks yet. Create blocks on diagrams to build your library.
        </div>
      ) : (
        <div className="tree-container">
          {packages.map(pkg => renderTreeNode(pkg))}
        </div>
      )}
    </div>
  );
}