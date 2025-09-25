import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import type { DocumentRecord, FolderRecord } from "../../types";
import { FileManagerToolbar } from "./FileManagerToolbar";
import { FileManagerBreadcrumb } from "./FileManagerBreadcrumb";
import { FileManagerGrid } from "./FileManagerGrid";
import { FileManagerList } from "./FileManagerList";
import { ContextMenu } from "./ContextMenu";
import { RenameModal } from "./RenameModal";
import { ConfirmDeleteModal } from "../ConfirmDeleteModal";

export type ViewMode = "grid" | "list";
export type SortField = "name" | "modified" | "size" | "type";
export type SortOrder = "asc" | "desc";

interface DocumentManagerProps {
  tenant: string;
  project: string;
  folders: FolderRecord[];
  documents: DocumentRecord[];
  onOpenDocument?: (documentSlug: string) => void;
  onCreateFolder?: (parentFolder?: string) => void;
  onCreateDocument?: (parentFolder?: string) => void;
}

export interface FileItem {
  id: string;
  name: string;
  type: "folder" | "document";
  slug: string;
  parentFolder?: string | null;
  description?: string | null;
  shortCode?: string | null;
  size?: number;
  updatedAt: string;
  createdAt: string;
  itemCount?: number;
}

export function DocumentManager({
  tenant,
  project,
  folders,
  documents,
  onOpenDocument,
  onCreateFolder,
  onCreateDocument
}: DocumentManagerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: FileItem;
  } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    item: FileItem | null;
  }>({ isOpen: false, item: null });
  const [renameModal, setRenameModal] = useState<{
    isOpen: boolean;
    item: FileItem | null;
  }>({ isOpen: false, item: null });

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
      // Force immediate refetch of documents
      queryClient.invalidateQueries({ 
        queryKey: ["documents", tenant, project],
        refetchType: 'all' 
      });
      queryClient.refetchQueries({ 
        queryKey: ["documents", tenant, project],
        type: 'active'
      });
      setDeleteModal({ isOpen: false, item: null });
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderSlug: string) => api.deleteFolder(tenant, project, folderSlug),
    onSuccess: () => {
      // Force immediate refetch of folders
      queryClient.invalidateQueries({ 
        queryKey: ["folders", tenant, project],
        refetchType: 'all'
      });
      queryClient.refetchQueries({ 
        queryKey: ["folders", tenant, project],
        type: 'active'
      });
      setDeleteModal({ isOpen: false, item: null });
    }
  });

  const renameDocumentMutation = useMutation({
    mutationFn: ({ documentSlug, name, description, shortCode }: { 
      documentSlug: string; 
      name: string; 
      description?: string; 
      shortCode?: string; 
    }) => api.updateDocument(tenant, project, documentSlug, { name, description, shortCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
      setRenameModal({ isOpen: false, item: null });
    }
  });

  const renameFolderMutation = useMutation({
    mutationFn: ({ folderSlug, name, description }: { 
      folderSlug: string; 
      name: string; 
      description?: string; 
    }) => api.updateFolder(tenant, project, folderSlug, { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders", tenant, project] });
      setRenameModal({ isOpen: false, item: null });
    }
  });

  // Convert API data to FileItem format with accurate item counts
  const fileItems = useMemo<FileItem[]>(() => {
    const items: FileItem[] = [];

    // Calculate accurate folder counts based on actual data
    const calculateFolderItemCount = (folderSlug: string): number => {
      const subfolders = folders.filter(f => f.parentFolder === folderSlug);
      const documentsInFolder = documents.filter(d => d.parentFolder === folderSlug);
      return subfolders.length + documentsInFolder.length;
    };

    folders.forEach(folder => {
      items.push({
        id: folder.id,
        name: folder.name,
        type: "folder",
        slug: folder.slug,
        parentFolder: folder.parentFolder,
        description: folder.description,
        updatedAt: folder.updatedAt,
        createdAt: folder.createdAt,
        itemCount: calculateFolderItemCount(folder.slug)
      });
    });

    documents.forEach(doc => {
      items.push({
        id: doc.id,
        name: doc.name,
        type: "document",
        slug: doc.slug,
        parentFolder: doc.parentFolder,
        description: doc.description,
        shortCode: doc.shortCode,
        updatedAt: doc.updatedAt,
        createdAt: doc.createdAt,
        itemCount: doc.requirementCount
      });
    });

    return items;
  }, [folders, documents]);

  // Get current folder path
  const currentFolder = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;

  // Filter items for current directory
  const currentItems = useMemo(() => {
    let items = fileItems.filter(item => item.parentFolder === currentFolder);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query))
      );
    }

    // Apply sorting
    items.sort((a, b) => {
      let comparison = 0;

      // Always sort folders before documents
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }

      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "modified":
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case "size":
          comparison = (a.itemCount || 0) - (b.itemCount || 0);
          break;
        case "type":
          comparison = a.type.localeCompare(b.type);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return items;
  }, [fileItems, currentFolder, searchQuery, sortField, sortOrder]);

  // Build breadcrumb path
  const breadcrumbPath = useMemo(() => {
    const path = [{ name: project, slug: null as string | null }];
    
    currentPath.forEach(folderSlug => {
      const folder = folders.find(f => f.slug === folderSlug);
      if (folder) {
        path.push({ name: folder.name, slug: folder.slug as string | null });
      }
    });

    return path;
  }, [currentPath, folders, project]);

  const handleNavigateToFolder = (folderSlug: string) => {
    setCurrentPath(prev => [...prev, folderSlug]);
    setSelectedItems(new Set());
  };

  const handleNavigateToBreadcrumb = (index: number) => {
    if (index === 0) {
      setCurrentPath([]);
    } else {
      setCurrentPath(prev => prev.slice(0, index));
    }
    setSelectedItems(new Set());
  };

  const handleContextMenu = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const handleDeleteItem = (item: FileItem) => {
    setDeleteModal({ isOpen: true, item });
    setContextMenu(null);
  };

  const handleConfirmDelete = () => {
    if (deleteModal.item) {
      if (deleteModal.item.type === "folder") {
        deleteFolderMutation.mutate(deleteModal.item.slug);
      } else {
        deleteDocumentMutation.mutate(deleteModal.item.slug);
      }
    }
  };

  const handleRenameItem = (item: FileItem) => {
    setRenameModal({ isOpen: true, item });
    setContextMenu(null);
  };

  const handleConfirmRename = (newName: string, newDescription?: string, newShortCode?: string) => {
    if (renameModal.item) {
      if (renameModal.item.type === "document") {
        renameDocumentMutation.mutate({
          documentSlug: renameModal.item.slug,
          name: newName,
          description: newDescription,
          shortCode: newShortCode
        });
      } else {
        renameFolderMutation.mutate({
          folderSlug: renameModal.item.slug,
          name: newName,
          description: newDescription
        });
      }
    }
  };

  const handleDrop = (targetFolder: string | null) => {
    selectedItems.forEach(itemId => {
      const item = fileItems.find(f => f.id === itemId);
      if (item && item.type === "document") {
        moveDocumentMutation.mutate({
          documentSlug: item.slug,
          parentFolder: targetFolder
        });
      }
    });
    setSelectedItems(new Set());
  };

  return (
    <div className="file-manager">
      <FileManagerToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={(field, order) => {
          setSortField(field);
          setSortOrder(order);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCreateFolder={() => onCreateFolder?.(currentFolder || undefined)}
        onCreateDocument={() => onCreateDocument?.(currentFolder || undefined)}
        selectedCount={selectedItems.size}
      />

      <FileManagerBreadcrumb
        path={breadcrumbPath}
        onNavigate={handleNavigateToBreadcrumb}
      />

      <div className="file-manager-content">
        {viewMode === "grid" ? (
          <FileManagerGrid
            items={currentItems}
            selectedItems={selectedItems}
            onSelectionChange={setSelectedItems}
            onItemDoubleClick={(item) => {
              if (item.type === "folder") {
                handleNavigateToFolder(item.slug);
              } else {
                onOpenDocument?.(item.slug);
              }
            }}
            onContextMenu={handleContextMenu}
            onDrop={handleDrop}
          />
        ) : (
          <FileManagerList
            items={currentItems}
            selectedItems={selectedItems}
            onSelectionChange={setSelectedItems}
            onItemDoubleClick={(item) => {
              if (item.type === "folder") {
                handleNavigateToFolder(item.slug);
              } else {
                onOpenDocument?.(item.slug);
              }
            }}
            onContextMenu={handleContextMenu}
            onDrop={handleDrop}
          />
        )}

        {currentItems.length === 0 && (
          <div className="file-manager-empty">
            <div className="empty-state">
              <div className="empty-icon">📁</div>
              <h3>No files found</h3>
              <p>
                {searchQuery.trim() 
                  ? "No files match your search criteria"
                  : "This folder is empty. Create folders and documents to organize your project."
                }
              </p>
              {!searchQuery.trim() && (
                <div className="empty-actions">
                  <button 
                    className="primary-button"
                    onClick={() => onCreateDocument?.(currentFolder || undefined)}
                  >
                    Create Document
                  </button>
                  <button 
                    className="ghost-button"
                    onClick={() => onCreateFolder?.(currentFolder || undefined)}
                  >
                    Create Folder
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onRename={() => handleRenameItem(contextMenu.item)}
          onDelete={() => handleDeleteItem(contextMenu.item)}
          onOpen={() => {
            if (contextMenu.item.type === "document") {
              onOpenDocument?.(contextMenu.item.slug);
            } else {
              handleNavigateToFolder(contextMenu.item.slug);
            }
            setContextMenu(null);
          }}
        />
      )}

      <RenameModal
        isOpen={renameModal.isOpen}
        item={renameModal.item}
        onClose={() => setRenameModal({ isOpen: false, item: null })}
        onRename={handleConfirmRename}
      />

      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        title={`Delete ${deleteModal.item?.type === 'folder' ? 'Folder' : 'Document'}`}
        message={`Are you sure you want to delete "${deleteModal.item?.name}"?`}
        itemName={deleteModal.item?.name || ''}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModal({ isOpen: false, item: null })}
        isDeleting={deleteDocumentMutation.isPending || deleteFolderMutation.isPending}
      />
    </div>
  );
}