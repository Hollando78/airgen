import { useState, useEffect, useRef } from "react";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { DocumentTree } from "../components/Trace/DocumentTree";
import { VisualLinksArea } from "../components/Trace/VisualLinksArea";
import { RequirementContextMenu } from "../components/RequirementContextMenu";
import { LinkTypeSelectionModal } from "../components/LinkTypeSelectionModal";
import { useRequirementLinking } from "../contexts/RequirementLinkingContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import type {
  DocumentRecord,
  RequirementRecord,
  TraceLinkType,
  CreateTraceLinkRequest,
  TraceLink
} from "../types";

interface ContextMenuProps {
  isOpen: boolean;
  x: number;
  y: number;
  requirement: RequirementRecord | null;
  onClose: () => void;
  onStartLink: () => void;
  onLinkFromStart: () => void;
}

function ContextMenu({ isOpen, x, y, requirement, onClose, onStartLink, onLinkFromStart }: ContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !requirement) {return <></>;}

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      <div className="context-menu-item" onClick={onStartLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        Start link from here
      </div>
      <div className="context-menu-item" onClick={onLinkFromStart}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
        Link to here
      </div>
    </div>
  );
}

// Link Confirmation Modal Component
interface LinkConfirmationModalProps {
  isOpen: boolean;
  sourceRequirements: RequirementRecord[];
  targetRequirements: RequirementRecord[];
  onConfirm: (linkType: TraceLinkType, description?: string) => void;
  onCancel: () => void;
}

function LinkConfirmationModal({ isOpen, sourceRequirements, targetRequirements, onConfirm, onCancel }: LinkConfirmationModalProps): JSX.Element {
  const [linkType, setLinkType] = useState<TraceLinkType>('satisfies');
  const [description, setDescription] = useState('');

  const linkTypes: Array<{ value: TraceLinkType; label: string; description: string }> = [
    { value: "satisfies", label: "Satisfies", description: "Target requirement satisfies source requirement" },
    { value: "derives", label: "Derives", description: "Target requirement is derived from source requirement" },
    { value: "verifies", label: "Verifies", description: "Target requirement verifies source requirement" },
    { value: "implements", label: "Implements", description: "Target requirement implements source requirement" },
    { value: "refines", label: "Refines", description: "Target requirement refines source requirement" },
    { value: "conflicts", label: "Conflicts", description: "Target requirement conflicts with source requirement" }
  ];

  const handleConfirm = () => {
    onConfirm(linkType, description.trim() || undefined);
    setDescription('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Confirm Trace Link Creation</DialogTitle>
          <DialogDescription>
            Create relationships between the selected requirements
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">From ({sourceRequirements.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sourceRequirements.map(req => (
                  <div key={req.id} className="flex flex-col space-y-1">
                    <span className="font-mono text-xs text-muted-foreground">{req.ref}</span>
                    <span className="text-sm">{req.title}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            
            <div className="flex justify-center">
              <div className="text-2xl text-muted-foreground">→</div>
            </div>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">To ({targetRequirements.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {targetRequirements.map(req => (
                  <div key={req.id} className="flex flex-col space-y-1">
                    <span className="font-mono text-xs text-muted-foreground">{req.ref}</span>
                    <span className="text-sm">{req.title}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Link Type</Label>
              <Select value={linkType} onValueChange={(value) => setLinkType(value as TraceLinkType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {linkTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {linkTypes.find(t => t.value === linkType)?.description}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional notes about this relationship..."
                rows={3}
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Create {sourceRequirements.length * targetRequirements.length} Link{sourceRequirements.length * targetRequirements.length > 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LinksRoute(): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { state } = useTenantProject();
  
  const [selectedLinksetId, setSelectedLinksetId] = useState<string>("");
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set());
  const [linkStartRequirements, setLinkStartRequirements] = useState<RequirementRecord[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    requirement: RequirementRecord | null;
  }>({ isOpen: false, x: 0, y: 0, requirement: null });
  const [linkModal, setLinkModal] = useState<{
    isOpen: boolean;
    sourceRequirements: RequirementRecord[];
    targetRequirements: RequirementRecord[];
  }>({ isOpen: false, sourceRequirements: [], targetRequirements: [] });

  const linksetsQuery = useQuery({
    queryKey: ["linksets", state.tenant, state.project],
    queryFn: () => api.listLinksets(state.tenant!, state.project!),
    enabled: Boolean(state.tenant && state.project)
  });

  // Find selected linkset
  const selectedLinkset = React.useMemo(() => {
    if (!selectedLinksetId || !linksetsQuery.data?.linksets) {return null;}
    const linkset = linksetsQuery.data.linksets.find(ls => ls.id === selectedLinksetId);
    return linkset || null;
  }, [selectedLinksetId, linksetsQuery.data]);
  
  // Reset selection if linkset no longer exists
  React.useEffect(() => {
    if (selectedLinksetId && linksetsQuery.data?.linksets && !selectedLinkset) {
      console.warn(`Linkset "${selectedLinksetId}" not found, clearing selection`);
      setSelectedLinksetId("");
    }
  }, [selectedLinksetId, selectedLinkset, linksetsQuery.data]);

  const traceLinksQuery = useQuery({
    queryKey: ["traceLinks", state.tenant, state.project],
    queryFn: () => api.listTraceLinks(state.tenant!, state.project!),
    enabled: Boolean(state.tenant && state.project)
  });


  const deleteLinkMutation = useMutation({
    mutationFn: (linkId: string) => {
      return api.deleteTraceLink(state.tenant!, state.project!, linkId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traceLinks", state.tenant, state.project] });
    }
  });

  const createLinkMutation = useMutation({
    mutationFn: (request: CreateTraceLinkRequest) => {
      return api.createTraceLink({
        ...request,
        tenant: state.tenant!,
        projectKey: state.project!
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traceLinks", state.tenant, state.project] });
    }
  });

  const handleRequirementSelect = (requirement: RequirementRecord, isMultiSelect: boolean) => {
    setSelectedRequirements(prev => {
      const newSet = new Set(prev);
      if (isMultiSelect) {
        if (newSet.has(requirement.id)) {
          newSet.delete(requirement.id);
        } else {
          newSet.add(requirement.id);
        }
      } else {
        newSet.clear();
        newSet.add(requirement.id);
      }
      return newSet;
    });
  };

  const handleContextMenu = (requirement: RequirementRecord, event: React.MouseEvent) => {
    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      requirement
    });
  };

  const handleStartLink = () => {
    if (contextMenu.requirement) {
      setLinkStartRequirements([contextMenu.requirement]);
    }
    setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null });
  };

  const handleLinkFromStart = () => {
    if (contextMenu.requirement && linkStartRequirements.length > 0) {
      setLinkModal({
        isOpen: true,
        sourceRequirements: linkStartRequirements,
        targetRequirements: [contextMenu.requirement]
      });
    }
    setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null });
  };

  const [draggedRequirement, setDraggedRequirement] = useState<RequirementRecord | null>(null);

  const handleDragStart = (requirement: RequirementRecord) => {
    setDraggedRequirement(requirement);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault(); // Allow drop
    const target = event.currentTarget as HTMLElement;
    target.classList.add('drag-over');
  };

  const handleDragLeave = (event: React.DragEvent) => {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  };

  const handleDrop = (event: React.DragEvent, targetRequirement: RequirementRecord) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
    
    if (draggedRequirement && draggedRequirement.id !== targetRequirement.id) {
      // Show link confirmation modal
      setLinkModal({
        isOpen: true,
        sourceRequirements: [draggedRequirement],
        targetRequirements: [targetRequirement]
      });
    }
    setDraggedRequirement(null);
  };

  const handleCreateLink = (linkType: TraceLinkType, description?: string) => {
    const { sourceRequirements, targetRequirements } = linkModal;
    
    // Create all combinations of links
    const linkPromises = sourceRequirements.flatMap(source =>
      targetRequirements.map(target =>
        createLinkMutation.mutateAsync({
          sourceRequirementId: source.id,
          targetRequirementId: target.id,
          linkType,
          description
        })
      )
    );
    
    Promise.all(linkPromises).then(() => {
      setLinkModal({ isOpen: false, sourceRequirements: [], targetRequirements: [] });
      setSelectedRequirements(new Set());
      setLinkStartRequirements([]);
    });
  };

  const handleCancelLink = () => {
    setLinkModal({ isOpen: false, sourceRequirements: [], targetRequirements: [] });
  };

  if (!state.tenant || !state.project) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Trace Links</CardTitle>
            <CardDescription>Select a tenant and project first.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <TraceLinksView />
  );
}

function TraceLinksView(): JSX.Element {
  const { state: { tenant, project } } = useTenantProject();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  
  const [selectedLinksetId, setSelectedLinksetId] = useState<string>("");
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
    requirement: RequirementRecord | null;
  }>({ isOpen: false, x: 0, y: 0, requirement: null });
  
  const [linkingState, setLinkingState] = useState<{
    sourceRequirement: RequirementRecord | null;
    isLinking: boolean;
  }>({ sourceRequirement: null, isLinking: false });

  const [linkModal, setLinkModal] = useState<{
    sourceRequirement: RequirementRecord;
    targetRequirement: RequirementRecord;
  } | null>(null);

  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set());
  const [draggedRequirement, setDraggedRequirement] = useState<RequirementRecord | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [targetFilter, setTargetFilter] = useState<string>("");

  // Fetch linksets
  const linksetsQuery = useQuery({
    queryKey: ["linksets", tenant, project],
    queryFn: () => apiClient.listLinksets(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Fetch trace links
  const traceLinksQuery = useQuery({
    queryKey: ["trace-links", tenant, project],
    queryFn: () => apiClient.listTraceLinks(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Get selected linkset
  const selectedLinkset = React.useMemo(() => {
    if (!selectedLinksetId || !linksetsQuery.data?.linksets) {return null;}
    return linksetsQuery.data.linksets.find(ls => ls.id === selectedLinksetId) || null;
  }, [selectedLinksetId, linksetsQuery.data?.linksets]);

  // Create trace link mutation
  const createTraceLinkMutation = useMutation({
    mutationFn: (body: CreateTraceLinkRequest) =>
      apiClient.createTraceLink(tenant, project, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
      setLinkModal(null);
    }
  });

  // Delete trace link mutation
  const deleteTraceLinkMutation = useMutation({
    mutationFn: (linkId: string) =>
      apiClient.deleteTraceLink(tenant, project, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
    }
  });

  const handleDeleteLink = React.useCallback((linkId: string) => {
    deleteTraceLinkMutation.mutate(linkId);
  }, [deleteTraceLinkMutation]);

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: (requirementId: string) =>
      apiClient.archiveRequirements(tenant, project, [requirementId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
    }
  });

  // Unarchive mutation
  const unarchiveMutation = useMutation({
    mutationFn: (requirementId: string) =>
      apiClient.unarchiveRequirements(tenant, project, [requirementId]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trace-links", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["linksets", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
    }
  });

  const handleArchive = React.useCallback((requirementId: string) => {
    archiveMutation.mutate(requirementId);
  }, [archiveMutation]);

  const handleUnarchive = React.useCallback((requirementId: string) => {
    unarchiveMutation.mutate(requirementId);
  }, [unarchiveMutation]);

  const handleStartLink = React.useCallback(() => {
    if (contextMenu.requirement) {
      setLinkingState({
        sourceRequirement: contextMenu.requirement,
        isLinking: true
      });
      setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null });
    }
  }, [contextMenu.requirement]);

  const handleLinkFromStart = React.useCallback(() => {
    if (linkingState.sourceRequirement && contextMenu.requirement) {
      setLinkModal({
        sourceRequirement: linkingState.sourceRequirement,
        targetRequirement: contextMenu.requirement
      });
      setLinkingState({ sourceRequirement: null, isLinking: false });
      setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null });
    }
  }, [linkingState.sourceRequirement, contextMenu.requirement]);

  const handleCreateLink = React.useCallback((linkType: TraceLinkType, description?: string) => {
    if (!linkModal) {return;}

    createTraceLinkMutation.mutate({
      sourceRequirementId: linkModal.sourceRequirement.id,
      targetRequirementId: linkModal.targetRequirement.id,
      linkType,
      description
    });
  }, [linkModal, createTraceLinkMutation]);

  const handleCancelLink = React.useCallback(() => {
    setLinkModal(null);
    setLinkingState({ sourceRequirement: null, isLinking: false });
  }, []);

  const handleRequirementSelect = React.useCallback((requirement: RequirementRecord, isMultiSelect: boolean) => {
    setSelectedRequirements(prev => {
      const newSet = new Set(prev);
      if (isMultiSelect) {
        if (newSet.has(requirement.id)) {
          newSet.delete(requirement.id);
        } else {
          newSet.add(requirement.id);
        }
      } else {
        newSet.clear();
        newSet.add(requirement.id);
      }
      return newSet;
    });
  }, []);

  const handleRequirementContextMenu = React.useCallback((event: React.MouseEvent, requirement: RequirementRecord) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      requirement
    });
  }, []);

  // Alias for DocumentTree compatibility
  const handleContextMenu = React.useCallback((requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      isOpen: true,
      x: event.clientX,
      y: event.clientY,
      requirement
    });
  }, []);

  const handleDragStart = React.useCallback((requirement: RequirementRecord) => {
    setDraggedRequirement(requirement);
  }, []);

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault(); // Allow drop
    const target = event.currentTarget as HTMLElement;
    target.classList.add('drag-over');
  }, []);

  const handleDragLeave = React.useCallback((event: React.DragEvent) => {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  }, []);

  const handleDrop = React.useCallback((event: React.DragEvent, targetRequirement: RequirementRecord) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (draggedRequirement && draggedRequirement.id !== targetRequirement.id) {
      setLinkModal({
        sourceRequirement: draggedRequirement,
        targetRequirement
      });
    }
    setDraggedRequirement(null);
  }, [draggedRequirement]);


  if (!tenant || !project) {
    return (
      <div className="p-6 space-y-6 min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Trace Links</CardTitle>
            <CardDescription>Select a tenant and project first.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (linksetsQuery.isLoading || traceLinksQuery.isLoading) {
    return <Spinner />;
  }

  if (linksetsQuery.error || traceLinksQuery.error) {
    return <ErrorState message="Failed to load trace links" />;
  }

  return (
    <div className="p-6 space-y-6 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle>Trace Links</CardTitle>
          <CardDescription>
            View and manage relationships between requirements across documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Select Document Linkset</Label>
              <Select value={selectedLinksetId} onValueChange={setSelectedLinksetId}>
                <SelectTrigger className="h-10 mt-2">
                  <SelectValue placeholder="Choose a linkset to view..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] bg-white border border-gray-200 shadow-lg">
                  {linksetsQuery.isLoading ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading linksets...</div>
                  ) : linksetsQuery.error ? (
                    <div className="p-2 text-sm text-destructive">Error loading linksets</div>
                  ) : linksetsQuery.data?.linksets.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No linksets available</div>
                  ) : (
                    linksetsQuery.data?.linksets.map(linkset => (
                      <SelectItem key={linkset.id} value={linkset.id} className="cursor-pointer">
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{linkset.sourceDocument.name}</span>
                            <span className="text-xs font-bold text-blue-600">→</span>
                            <span className="font-medium text-sm">{linkset.targetDocument.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {linkset.linkCount} link{linkset.linkCount !== 1 ? 's' : ''} • Directional linkset
                          </div>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            {selectedLinkset && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="text-sm font-medium text-blue-900 flex items-center gap-2">
                  <span>{selectedLinkset.sourceDocument.name}</span>
                  <span className="text-base font-bold text-blue-600">→</span>
                  <span>{selectedLinkset.targetDocument.name}</span>
                </div>
                <div className="text-xs text-blue-700 mt-1">
                  {selectedLinkset.linkCount} trace link{selectedLinkset.linkCount !== 1 ? 's' : ''} between these documents
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedLinkset && (
        <div className="desktop-three-columns h-[600px]">
        {/* Source Document Panel */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selectedLinkset.sourceDocument.name}</CardTitle>
            <div className="mt-2">
              <input
                type="text"
                placeholder="Filter requirements..."
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-7rem)]">
            <div className="document-panel left-panel h-full overflow-y-auto">
              <DocumentTree
                document={selectedLinkset.sourceDocument}
                selectedRequirements={selectedRequirements}
                onRequirementSelect={handleRequirementSelect}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                traceLinks={selectedLinkset.links.map(link => ({
                  id: link.id,
                  sourceRequirementId: link.sourceRequirementId,
                  targetRequirementId: link.targetRequirementId,
                  linkType: link.linkType,
                  description: link.description,
                  createdAt: link.createdAt,
                  updatedAt: link.updatedAt,
                  sourceRequirement: {} as any,
                  targetRequirement: {} as any
                }))}
                documentSide="left"
                filter={sourceFilter}
              />
            </div>
          </CardContent>
        </Card>

        {/* Visual Links Panel */}
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Visual Links</CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-4rem)]">
            <div className="linking-panel h-full relative">
              <VisualLinksArea
                traceLinks={selectedLinkset.links.map(link => ({
                  id: link.id,
                  sourceRequirementId: link.sourceRequirementId,
                  targetRequirementId: link.targetRequirementId,
                  linkType: link.linkType,
                  description: link.description,
                  createdAt: link.createdAt,
                  updatedAt: link.updatedAt,
                  sourceRequirement: {} as any,
                  targetRequirement: {} as any
                }))}
                leftDocument={selectedLinkset.sourceDocument}
                rightDocument={selectedLinkset.targetDocument}
                onDeleteLink={(linkId) => {
                  // TODO: Implement linkset link deletion
                  console.log('Delete link from linkset:', linkId);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Target Document Panel */}
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selectedLinkset.targetDocument.name}</CardTitle>
            <div className="mt-2">
              <input
                type="text"
                placeholder="Filter requirements..."
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-7rem)]">
            <div className="document-panel right-panel h-full overflow-y-auto">
              <DocumentTree
                document={selectedLinkset.targetDocument}
                selectedRequirements={selectedRequirements}
                onRequirementSelect={handleRequirementSelect}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                traceLinks={selectedLinkset.links.map(link => ({
                  id: link.id,
                  sourceRequirementId: link.sourceRequirementId,
                  targetRequirementId: link.targetRequirementId,
                  linkType: link.linkType,
                  description: link.description,
                  createdAt: link.createdAt,
                  updatedAt: link.updatedAt,
                  sourceRequirement: {} as any,
                  targetRequirement: {} as any
                }))}
                documentSide="right"
                filter={targetFilter}
              />
            </div>
          </CardContent>
        </Card>
        </div>
      )}
      
      {contextMenu.isOpen && contextMenu.requirement && (
        <RequirementContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          requirement={contextMenu.requirement}
          tenant={tenant}
          project={project}
          onClose={() => setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null })}
          onStartLink={handleStartLink}
          onEndLink={handleLinkFromStart}
          onCancelLink={() => setLinkingState({ sourceRequirement: null, isLinking: false })}
          onArchive={handleArchive}
          onUnarchive={handleUnarchive}
          linkingRequirement={linkingState.sourceRequirement}
          traceLinks={selectedLinkset?.links || []}
        />
      )}

      {linkModal && (
        <LinkTypeSelectionModal
          isOpen={true}
          sourceRequirement={linkModal.sourceRequirement}
          targetRequirement={linkModal.targetRequirement}
          onConfirm={handleCreateLink}
          onCancel={handleCancelLink}
        />
      )}
    </div>
  );
}
