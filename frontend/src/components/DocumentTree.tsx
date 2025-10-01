import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import type { DocumentRecord, FolderRecord } from "../types";

interface TreeNode {
  type: 'folder' | 'document';
  data: FolderRecord | DocumentRecord;
  children: TreeNode[];
  isExpanded?: boolean;
}

interface DocumentTreeProps {
  tenant: string;
  project: string;
  folders: FolderRecord[];
  documents: DocumentRecord[];
  selectedItem?: string | null;
  onSelectItem?: (type: 'folder' | 'document', slug: string) => void;
  onOpenDocument?: (documentSlug: string) => void;
  onCreateFolder?: (parentFolder?: string) => void;
  onCreateDocument?: (parentFolder?: string) => void;
}

export function DocumentTree({
  tenant,
  project,
  folders,
  documents,
  selectedItem,
  onSelectItem,
  onOpenDocument,
  onCreateFolder,
  onCreateDocument
}: DocumentTreeProps): JSX.Element {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'folder' | 'document';
    item: FolderRecord | DocumentRecord | null;
  }>({ isOpen: false, type: 'document', item: null });
  
  const api = useApiClient();
  const queryClient = useQueryClient();

  const moveDocumentMutation = useMutation({
    mutationFn: ({ documentSlug, parentFolder }: { documentSlug: string; parentFolder?: string | null }) =>
      api.updateDocumentFolder(tenant, project, documentSlug, parentFolder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
    }
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentSlug: string) => api.deleteDocument(tenant, project, documentSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
      setDeleteModal({ isOpen: false, type: 'document', item: null });
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderSlug: string) => api.deleteFolder(tenant, project, folderSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders", tenant, project] });
      setDeleteModal({ isOpen: false, type: 'folder', item: null });
    }
  });

  // Build tree structure
  const buildTree = (): TreeNode[] => {
    const nodes: TreeNode[] = [];
    const nodeMap = new Map<string, TreeNode>();

    // Create folder nodes
    folders.forEach(folder => {
      const node: TreeNode = {
        type: 'folder',
        data: folder,
        children: [],
        isExpanded: expandedFolders.has(folder.slug)
      };
      nodeMap.set(folder.slug, node);
    });

    // Create document nodes
    documents.forEach(doc => {
      const node: TreeNode = {
        type: 'document',
        data: doc,
        children: []
      };
      nodeMap.set(`doc-${doc.slug}`, node);
    });

    // Build hierarchy
    folders.forEach(folder => {
      const node = nodeMap.get(folder.slug);
      if (!node) {return;}

      if (folder.parentFolder) {
        const parent = nodeMap.get(folder.parentFolder);
        if (parent) {
          parent.children.push(node);
        } else {
          nodes.push(node);
        }
      } else {
        nodes.push(node);
      }
    });

    documents.forEach(doc => {
      const node = nodeMap.get(`doc-${doc.slug}`);
      if (!node) {return;}

      if (doc.parentFolder) {
        const parent = nodeMap.get(doc.parentFolder);
        if (parent) {
          parent.children.push(node);
        } else {
          nodes.push(node);
        }
      } else {
        nodes.push(node);
      }
    });

    return nodes.sort((a, b) => {
      // Folders first, then documents
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.data.name.localeCompare(b.data.name);
    });
  };

  const toggleFolder = (folderSlug: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderSlug)) {
      newExpanded.delete(folderSlug);
    } else {
      newExpanded.add(folderSlug);
    }
    setExpandedFolders(newExpanded);
  };

  const renderNode = (node: TreeNode, depth: number = 0): JSX.Element => {
    const isSelected = selectedItem === node.data.slug || 
                     (node.type === 'document' && selectedItem === `doc-${node.data.slug}`);
    const hasChildren = node.children.length > 0;
    const isExpanded = node.isExpanded;

    return (
      <div key={`${node.type}-${node.data.slug}`}>
        <div
          draggable={node.type === 'document'}
          onDragStart={(e) => {
            if (node.type === 'document') {
              e.dataTransfer.setData('text/plain', `document:${node.data.slug}`);
            }
          }}
          onDragOver={(e) => {
            if (node.type === 'folder') {
              e.preventDefault();
            }
          }}
          onDrop={(e) => {
            if (node.type === 'folder') {
              e.preventDefault();
              const data = e.dataTransfer.getData('text/plain');
              if (data.startsWith('document:')) {
                const documentSlug = data.replace('document:', '');
                moveDocumentMutation.mutate({ 
                  documentSlug, 
                  parentFolder: node.data.slug 
                });
              }
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: `${depth * 20 + 8}px`,
            paddingRight: '8px',
            paddingTop: '4px',
            paddingBottom: '4px',
            cursor: node.type === 'document' ? 'grab' : 'pointer',
            backgroundColor: isSelected ? '#e2e8f0' : 'transparent',
            borderRadius: '4px',
            margin: '1px 0',
            opacity: node.type === 'document' ? 0.9 : 1
          }}
          onClick={() => {
            if (node.type === 'folder') {
              toggleFolder(node.data.slug);
            }
            onSelectItem?.(node.type, node.data.slug);
          }}
          onDoubleClick={() => {
            if (node.type === 'document') {
              onOpenDocument?.(node.data.slug);
            }
          }}
        >
          {node.type === 'folder' && (
            <span style={{ marginRight: '6px', fontSize: '12px', width: '12px' }}>
              {hasChildren ? (isExpanded ? '▼' : '▶') : '📁'}
            </span>
          )}
          {node.type === 'document' && (
            <span style={{ marginRight: '6px', fontSize: '12px', width: '12px' }}>
              📄
            </span>
          )}
          <span style={{ flex: 1, fontSize: '14px' }}>
            {node.data.name}
          </span>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {node.type === 'folder' && (
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {(node.data as FolderRecord).documentCount || 0}
              </span>
            )}
            {node.type === 'document' && (
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {(node.data as DocumentRecord).requirementCount || 0}
              </span>
            )}
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDeleteModal({
                  isOpen: true,
                  type: node.type,
                  item: node.data
                });
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
                fontSize: '12px',
                color: '#dc3545',
                borderRadius: '2px',
                opacity: 0.7
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.opacity = '1';
                (e.target as HTMLElement).style.backgroundColor = '#fee';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.opacity = '0.7';
                (e.target as HTMLElement).style.backgroundColor = 'transparent';
              }}
              title={`Delete ${node.type}`}
            >
              🗑️
            </button>
          </div>
        </div>

        {node.type === 'folder' && isExpanded && hasChildren && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const tree = buildTree();

  return (
    <div style={{ 
      border: '1px solid #e2e8f0', 
      borderRadius: '6px', 
      backgroundColor: '#fafafa',
      minHeight: '300px'
    }}>
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#f8f9fa',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Project Files</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => onCreateFolder?.()}
            className="ghost-button"
            style={{ padding: '4px 8px', fontSize: '12px' }}
            title="New Folder"
          >
            📁+
          </button>
          <button
            onClick={() => onCreateDocument?.()}
            className="ghost-button"
            style={{ padding: '4px 8px', fontSize: '12px' }}
            title="New Document"
          >
            📄+
          </button>
        </div>
      </div>

      <div 
        style={{ padding: '8px', minHeight: '200px' }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const data = e.dataTransfer.getData('text/plain');
          if (data.startsWith('document:')) {
            const documentSlug = data.replace('document:', '');
            // Move to root level (no parent folder)
            moveDocumentMutation.mutate({ 
              documentSlug, 
              parentFolder: null 
            });
          }
        }}
      >
        {tree.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#64748b',
            padding: '40px 20px',
            fontSize: '14px'
          }}>
            <div>No files yet</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              Create folders and documents to organize your project
            </div>
          </div>
        ) : (
          tree.map(node => renderNode(node))
        )}
      </div>

      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        title={`Delete ${deleteModal.type === 'folder' ? 'Folder' : 'Document'}`}
        message={`Are you sure you want to delete this ${deleteModal.type}?`}
        itemName={deleteModal.item?.name || ''}
        onConfirm={() => {
          if (deleteModal.item) {
            if (deleteModal.type === 'folder') {
              deleteFolderMutation.mutate(deleteModal.item.slug);
            } else {
              deleteDocumentMutation.mutate(deleteModal.item.slug);
            }
          }
        }}
        onCancel={() => setDeleteModal({ isOpen: false, type: 'document', item: null })}
        isDeleting={deleteDocumentMutation.isPending || deleteFolderMutation.isPending}
      />
    </div>
  );
}