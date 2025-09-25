import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import { DocumentTree } from "../components/Trace/DocumentTree";
import { VisualLinksArea } from "../components/Trace/VisualLinksArea";
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

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !requirement) return <></>;

  return (
    <div 
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      <div className="context-menu-item" onClick={onStartLink}>
        🔗 Start link from here
      </div>
      <div className="context-menu-item" onClick={onLinkFromStart}>
        ➡️ Link to here
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

  if (!isOpen) return <></>;

  return (
    <div className="modal-overlay">
      <div className="link-modal">
        <div className="modal-header">
          <h3>Confirm Trace Link Creation</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        
        <div className="modal-content">
          <div className="link-summary">
            <div className="requirements-section">
              <h4>From ({sourceRequirements.length}):</h4>
              <div className="requirements-list">
                {sourceRequirements.map(req => (
                  <div key={req.id} className="req-item">
                    <span className="req-ref">{req.ref}</span>
                    <span className="req-title">{req.title}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="link-arrow-large">→</div>
            
            <div className="requirements-section">
              <h4>To ({targetRequirements.length}):</h4>
              <div className="requirements-list">
                {targetRequirements.map(req => (
                  <div key={req.id} className="req-item">
                    <span className="req-ref">{req.ref}</span>
                    <span className="req-title">{req.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <div className="link-configuration">
            <div className="form-field">
              <label>Link Type:</label>
              <select value={linkType} onChange={(e) => setLinkType(e.target.value as TraceLinkType)}>
                {linkTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <div className="field-help">
                {linkTypes.find(t => t.value === linkType)?.description}
              </div>
            </div>
            
            <div className="form-field">
              <label>Description (optional):</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional notes about this relationship..."
                rows={3}
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleConfirm}>
            Create {sourceRequirements.length * targetRequirements.length} Link{sourceRequirements.length * targetRequirements.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
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

  const leftDocumentData =
    documentsQuery.data?.documents.find(d => d.slug === leftDocument) ?? null;
  const rightDocumentData =
    documentsQuery.data?.documents.find(d => d.slug === rightDocument) ?? null;

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
      <div className="panel">
        <h1>Trace Links</h1>
        <p>Select a tenant and project first.</p>
      </div>
    );
  }

  return (
    <div className="linking-layout">
      <div className="linking-header">
        <h1>Trace Links</h1>
        <p>Create relationships between requirements across documents</p>
        
        <div className="document-selectors">
          <div className="document-selector">
            <label htmlFor="left-doc">Left Document:</label>
            <select
              id="left-doc"
              value={leftDocument}
              onChange={(e) => setLeftDocument(e.target.value)}
            >
              <option value="">Select a document...</option>
              {documentsQuery.data?.documents.map(doc => (
                <option key={doc.slug} value={doc.slug}>
                  {doc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="document-selector">
            <label htmlFor="right-doc">Right Document:</label>
            <select
              id="right-doc"
              value={rightDocument}
              onChange={(e) => setRightDocument(e.target.value)}
            >
              <option value="">Select a document...</option>
              {documentsQuery.data?.documents.map(doc => (
                <option key={doc.slug} value={doc.slug}>
                  {doc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="linking-content">
        <div className="document-panel left-panel">
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

        <div className="linking-panel">
          <VisualLinksArea
            traceLinks={traceLinksQuery.data?.traceLinks || []}
            leftDocument={leftDocumentData}
            rightDocument={rightDocumentData}
            onDeleteLink={(linkId) => deleteLinkMutation.mutate(linkId)}
          />
        </div>

        <div className="document-panel right-panel">
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
