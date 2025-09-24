import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { ErrorState } from "../components/ErrorState";
import { Spinner } from "../components/Spinner";
import type { 
  DocumentRecord, 
  RequirementRecord, 
  TraceLinkType,
  CreateTraceLinkRequest,
  TraceLink
} from "../types";

interface DocumentTreeProps {
  document: DocumentRecord | null;
  selectedRequirements: Set<string>;
  onRequirementSelect: (requirement: RequirementRecord, isMultiSelect: boolean) => void;
  onContextMenu: (requirement: RequirementRecord, event: React.MouseEvent) => void;
  onDragStart: (requirement: RequirementRecord) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent, requirement: RequirementRecord) => void;
}

function DocumentTree({ document, selectedRequirements, onRequirementSelect, onContextMenu, onDragStart, onDragOver, onDragLeave, onDrop }: DocumentTreeProps): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();
  
  const sectionsQuery = useQuery({
    queryKey: ["sections", state.tenant, state.project, document?.slug],
    queryFn: () => document ? api.listDocumentSections(state.tenant!, state.project!, document.slug) : null,
    enabled: Boolean(state.tenant && state.project && document)
  });

  const [sectionRequirements, setSectionRequirements] = useState<Record<string, RequirementRecord[]>>({});

  // Load requirements for each section
  useEffect(() => {
    const loadRequirements = async () => {
      if (sectionsQuery.data?.sections) {
        const requirements: Record<string, RequirementRecord[]> = {};
        for (const section of sectionsQuery.data.sections) {
          try {
            const response = await api.listSectionRequirements(section.id);
            requirements[section.id] = response.requirements;
          } catch (error) {
            console.error(`Failed to load requirements for section ${section.id}:`, error);
            requirements[section.id] = [];
          }
        }
        setSectionRequirements(requirements);
      }
    };

    loadRequirements();
  }, [sectionsQuery.data, api]);

  const handleRequirementClick = (requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    const isMultiSelect = event.ctrlKey || event.metaKey;
    onRequirementSelect(requirement, isMultiSelect);
  };

  const handleContextMenu = (requirement: RequirementRecord, event: React.MouseEvent) => {
    event.preventDefault();
    onContextMenu(requirement, event);
  };

  const handleDragStart = (requirement: RequirementRecord) => {
    onDragStart(requirement);
  };

  if (!document) {
    return <div className="document-tree-empty">Select a document to view its requirements</div>;
  }

  if (sectionsQuery.isLoading) {
    return <div className="document-tree-loading"><Spinner /></div>;
  }

  if (sectionsQuery.isError) {
    return <ErrorState message="Failed to load document sections" />;
  }

  const sections = sectionsQuery.data?.sections || [];

  return (
    <div className="document-tree">
      <div className="document-header">
        <h3>{document.name}</h3>
        <span className="document-slug">{document.slug}</span>
      </div>
      
      {sections.length === 0 ? (
        <div className="no-sections">No sections in this document</div>
      ) : (
        <div className="sections-list">
          {sections.map(section => {
            const requirements = sectionRequirements[section.id] || [];
            return (
              <div key={section.id} className="section-node">
                <div className="section-header">
                  <span className="section-name">{section.name}</span>
                  <span className="section-count">({requirements.length})</span>
                </div>
                
                {requirements.length > 0 && (
                  <div className="requirements-list">
                    {requirements.map(requirement => (
                      <div 
                        key={requirement.id}
                        data-requirement-id={requirement.id}
                        className={`requirement-node ${
                          selectedRequirements.has(requirement.id) ? 'selected' : ''
                        }`}
                        draggable
                        onClick={(e) => handleRequirementClick(requirement, e)}
                        onContextMenu={(e) => handleContextMenu(requirement, e)}
                        onDragStart={() => handleDragStart(requirement)}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={(e) => onDrop(e, requirement)}
                        title={requirement.text}
                      >
                        <div className="requirement-content">
                          <span className="requirement-ref">{requirement.ref}</span>
                          <span className="requirement-title">{requirement.title}</span>
                          <span className="requirement-text">{requirement.text}</span>
                        </div>
                        {selectedRequirements.has(requirement.id) && (
                          <div className="selection-indicator">✓</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface VisualLinksAreaProps {
  traceLinks: TraceLink[];
  leftDocument: DocumentRecord | null;
  rightDocument: DocumentRecord | null;
  onDeleteLink?: (linkId: string) => void;
}

function VisualLinksArea({ traceLinks, leftDocument, rightDocument, onDeleteLink }: VisualLinksAreaProps): JSX.Element {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });
  const [forceUpdate, setForceUpdate] = useState(0);

  const linkTypeColors = {
    satisfies: '#22c55e',
    derives: '#3b82f6', 
    verifies: '#f59e0b',
    implements: '#8b5cf6',
    refines: '#06b6d4',
    conflicts: '#ef4444'
  };

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setSvgDimensions({ width: rect.width, height: rect.height });
      }
    };

    // Initial update with a delay to allow DOM elements to render
    const timeoutId = setTimeout(updateDimensions, 100);
    
    window.addEventListener('resize', updateDimensions);
    window.addEventListener('scroll', updateDimensions, true);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDimensions);
      window.removeEventListener('scroll', updateDimensions, true);
    };
  }, [traceLinks]);

  // Force re-render when trace links change to update positions
  useEffect(() => {
    if (traceLinks.length > 0) {
      const timeoutId = setTimeout(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setSvgDimensions({ width: rect.width, height: rect.height });
          setForceUpdate(prev => prev + 1);
        }
      }, 200);
      
      return () => clearTimeout(timeoutId);
    }
  }, [traceLinks.length]);

  // Update positions when documents change or when requirements are loaded
  useEffect(() => {
    if ((leftDocument || rightDocument) && traceLinks.length > 0) {
      const timeoutId = setTimeout(() => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setSvgDimensions({ width: rect.width, height: rect.height });
          setForceUpdate(prev => prev + 1);
        }
      }, 300);
      
      return () => clearTimeout(timeoutId);
    }
  }, [leftDocument, rightDocument, traceLinks]);

  // Observe requirement elements to update positions when they become visible
  useEffect(() => {
    if (traceLinks.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      const visibleRequirements = entries.filter(entry => entry.isIntersecting);
      if (visibleRequirements.length > 0) {
        setTimeout(() => {
          setForceUpdate(prev => prev + 1);
        }, 50);
      }
    });

    // Observe all requirement elements
    traceLinks.forEach(link => {
      const sourceElement = document.querySelector(`[data-requirement-id="${link.sourceRequirementId}"]`);
      const targetElement = document.querySelector(`[data-requirement-id="${link.targetRequirementId}"]`);
      if (sourceElement) observer.observe(sourceElement);
      if (targetElement) observer.observe(targetElement);
    });

    return () => observer.disconnect();
  }, [traceLinks]);

  const getRequirementPosition = (requirementId: string) => {
    const element = document.querySelector(`[data-requirement-id="${requirementId}"]`) as HTMLElement;
    if (!element || !containerRef.current) return null;

    const containerRect = containerRef.current.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    return {
      x: elementRect.left + elementRect.width / 2 - containerRect.left,
      y: elementRect.top + elementRect.height / 2 - containerRect.top
    };
  };

  return (
    <div className="visual-links-area" ref={containerRef}>
      <svg
        ref={svgRef}
        className="links-overlay"
        width={svgDimensions.width}
        height={svgDimensions.height}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 10 }}
        key={`svg-${forceUpdate}-${traceLinks.length}`}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="currentColor"
            />
          </marker>
        </defs>
        
        {traceLinks.map((link) => {
          const sourcePos = getRequirementPosition(link.sourceRequirementId);
          const targetPos = getRequirementPosition(link.targetRequirementId);
          
          if (!sourcePos || !targetPos) return null;

          const color = linkTypeColors[link.linkType];
          
          return (
            <g key={link.id}>
              <line
                x1={sourcePos.x}
                y1={sourcePos.y}
                x2={targetPos.x}
                y2={targetPos.y}
                stroke={color}
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
                style={{ color }}
                className="trace-link-line"
              />
              {onDeleteLink && (
                <circle
                  cx={(sourcePos.x + targetPos.x) / 2}
                  cy={(sourcePos.y + targetPos.y) / 2}
                  r="8"
                  fill="rgba(239, 68, 68, 0.9)"
                  className="delete-link-circle"
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={() => onDeleteLink(link.id)}
                />
              )}
              {onDeleteLink && (
                <text
                  x={(sourcePos.x + targetPos.x) / 2}
                  y={(sourcePos.y + targetPos.y) / 2 + 2}
                  textAnchor="middle"
                  fill="white"
                  fontSize="10"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none' }}
                >
                  ×
                </text>
              )}
            </g>
          );
        })}
      </svg>
      
      {traceLinks.length === 0 && (
        <div className="no-links-overlay">
          <div className="no-links-icon">🔗</div>
          <p>No trace links created yet</p>
          <p className="hint">Use the context menu or drag & drop to create links</p>
        </div>
      )}
    </div>
  );
}

// Context Menu Component
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

  const leftDocumentData = documentsQuery.data?.documents.find(d => d.slug === leftDocument);
  const rightDocumentData = documentsQuery.data?.documents.find(d => d.slug === rightDocument);

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