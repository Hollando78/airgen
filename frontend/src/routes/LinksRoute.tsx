import { useState, useEffect, useRef } from "react";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { DocumentTree } from "../components/Trace/DocumentTree";
import { VisualLinksArea } from "../components/Trace/VisualLinksArea";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
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
  if (!isOpen || !requirement) return <></>;

  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuContent
        className="w-48"
        style={{ position: 'fixed', left: x, top: y }}
      >
        <DropdownMenuItem onClick={onStartLink}>
          🔗 Start link from here
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLinkFromStart}>
          ➡️ Link to here
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  
  const [leftDocument, setLeftDocument] = useState<string>("");
  const [rightDocument, setRightDocument] = useState<string>("");
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

  const documentsQuery = useQuery({
    queryKey: ["documents", state.tenant, state.project],
    queryFn: () => api.listDocuments(state.tenant!, state.project!),
    enabled: Boolean(state.tenant && state.project)
  });

  // Find selected documents and handle cases where they might not exist
  const leftDocumentData = React.useMemo(() => {
    if (!leftDocument || !documentsQuery.data?.documents) return null;
    const doc = documentsQuery.data.documents.find(d => d?.slug === leftDocument);
    return doc || null;
  }, [leftDocument, documentsQuery.data]);
  
  const rightDocumentData = React.useMemo(() => {
    if (!rightDocument || !documentsQuery.data?.documents) return null;
    const doc = documentsQuery.data.documents.find(d => d?.slug === rightDocument);
    return doc || null;
  }, [rightDocument, documentsQuery.data]);
  
  // Reset selections if documents no longer exist
  React.useEffect(() => {
    if (leftDocument && documentsQuery.data?.documents && !leftDocumentData) {
      console.warn(`Left document "${leftDocument}" not found, clearing selection`);
      setLeftDocument("");
    }
  }, [leftDocument, leftDocumentData, documentsQuery.data]);
  
  React.useEffect(() => {
    if (rightDocument && documentsQuery.data?.documents && !rightDocumentData) {
      console.warn(`Right document "${rightDocument}" not found, clearing selection`);
      setRightDocument("");
    }
  }, [rightDocument, rightDocumentData, documentsQuery.data]);

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
    <div className="p-6 space-y-6 min-h-screen">
      <Card>
        <CardHeader>
          <CardTitle>Trace Links</CardTitle>
          <CardDescription>
            Create relationships between requirements across documents
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="left-doc" className="text-sm font-medium">
                Left Document
              </Label>
              <Select value={leftDocument} onValueChange={setLeftDocument}>
                <SelectTrigger id="left-doc" className="h-10">
                  <SelectValue placeholder="Select a document..." />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] bg-white border border-gray-200 shadow-lg">
                  {documentsQuery.isLoading ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading documents...</div>
                  ) : documentsQuery.error ? (
                    <div className="p-2 text-sm text-destructive">Error loading documents</div>
                  ) : documentsQuery.data?.documents.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No documents available</div>
                  ) : (
                    documentsQuery.data?.documents
                      .filter(doc => doc && doc.name && doc.slug) // Filter out invalid documents
                      .reduce((uniqueDocs: typeof documentsQuery.data.documents, doc) => {
                        // Deduplicate by slug (slug should be unique)
                        if (!uniqueDocs.find(existing => existing.slug === doc.slug)) {
                          uniqueDocs.push(doc);
                        }
                        return uniqueDocs;
                      }, [])
                      .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
                      .map(doc => (
                        <SelectItem key={doc.slug} value={doc.slug} className="cursor-pointer py-3">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{doc.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{doc.slug}</span>
                            </div>
                            {(doc as any).version && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded ml-2">
                                v{(doc as any).version}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label htmlFor="right-doc" className="text-sm font-medium">
                Right Document
              </Label>
              <Select value={rightDocument} onValueChange={setRightDocument}>
                <SelectTrigger id="right-doc" className="h-10">
                  <SelectValue placeholder="Select a document..." />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] bg-white border border-gray-200 shadow-lg">
                  {documentsQuery.isLoading ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading documents...</div>
                  ) : documentsQuery.error ? (
                    <div className="p-2 text-sm text-destructive">Error loading documents</div>
                  ) : documentsQuery.data?.documents.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No documents available</div>
                  ) : (
                    documentsQuery.data?.documents
                      .filter(doc => doc && doc.name && doc.slug) // Filter out invalid documents
                      .reduce((uniqueDocs: typeof documentsQuery.data.documents, doc) => {
                        // Deduplicate by slug (slug should be unique)
                        if (!uniqueDocs.find(existing => existing.slug === doc.slug)) {
                          uniqueDocs.push(doc);
                        }
                        return uniqueDocs;
                      }, [])
                      .sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically
                      .map(doc => (
                        <SelectItem key={doc.slug} value={doc.slug} className="cursor-pointer py-3">
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{doc.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{doc.slug}</span>
                            </div>
                            {(doc as any).version && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded ml-2">
                                v{(doc as any).version}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="desktop-three-columns h-[600px]">
        {/* Left Document Panel */}
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {leftDocumentData?.name || "Left Document"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-4rem)]">
            <div className="document-panel left-panel h-full overflow-y-auto">
              <DocumentTree
                document={leftDocumentData || null}
                selectedRequirements={selectedRequirements}
                onRequirementSelect={handleRequirementSelect}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
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
                traceLinks={traceLinksQuery.data?.traceLinks || []}
                leftDocument={leftDocumentData}
                rightDocument={rightDocumentData}
                onDeleteLink={(linkId) => deleteLinkMutation.mutate(linkId)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Right Document Panel */}
        <Card className="h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {rightDocumentData?.name || "Right Document"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[calc(100%-4rem)]">
            <div className="document-panel right-panel h-full overflow-y-auto">
              <DocumentTree
                document={rightDocumentData || null}
                selectedRequirements={selectedRequirements}
                onRequirementSelect={handleRequirementSelect}
                onContextMenu={handleContextMenu}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              />
            </div>
          </CardContent>
        </Card>
      </div>
      
      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        requirement={contextMenu.requirement}
        onClose={() => setContextMenu({ isOpen: false, x: 0, y: 0, requirement: null })}
        onStartLink={handleStartLink}
        onLinkFromStart={handleLinkFromStart}
      />
      
      <LinkConfirmationModal
        isOpen={linkModal.isOpen}
        sourceRequirements={linkModal.sourceRequirements}
        targetRequirements={linkModal.targetRequirements}
        onConfirm={handleCreateLink}
        onCancel={handleCancelLink}
      />
    </div>
  );
}
