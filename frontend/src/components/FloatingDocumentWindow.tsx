import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { Spinner } from "./Spinner";
import { LinkIndicators } from "./DocumentView/LinkIndicators";
import type { RequirementRecord } from "../types";

interface FloatingDocumentWindowProps {
  tenant: string;
  project: string;
  documentSlug: string;
  documentName: string;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  focusRequirementId?: string;
}

interface Section {
  id: string;
  name: string;
  shortCode?: string | null;
  order: number;
  requirements: RequirementRecord[];
}

export function FloatingDocumentWindow({
  tenant,
  project,
  documentSlug,
  documentName,
  onClose,
  initialPosition = { x: 100, y: 100 },
  focusRequirementId
}: FloatingDocumentWindowProps) {
  const api = useApiClient();
  const windowRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [isMinimized, setIsMinimized] = useState(false);

  // Fetch document sections
  const sectionsQuery = useQuery({
    queryKey: ["document-sections", tenant, project, documentSlug],
    queryFn: () => api.listDocumentSections(tenant, project, documentSlug),
    enabled: Boolean(tenant && project && documentSlug)
  });

  // Fetch requirements for each section
  const requirementsQueries = useQuery({
    queryKey: ["document-requirements", tenant, project, documentSlug],
    queryFn: async () => {
      if (!sectionsQuery.data?.sections) return [];
      
      const sectionRequirements = await Promise.all(
        sectionsQuery.data.sections.map(async (section) => {
          const response = await api.listSectionRequirements(section.id);
          return {
            sectionId: section.id,
            requirements: response.requirements
          };
        })
      );
      
      return sectionRequirements;
    },
    enabled: Boolean(sectionsQuery.data?.sections)
  });

  // Fetch trace links for this project
  const traceLinksQuery = useQuery({
    queryKey: ["traceLinks", tenant, project],
    queryFn: () => api.listTraceLinks(tenant, project),
    enabled: Boolean(tenant && project)
  });

  // Combine sections with their requirements
  const sectionsWithRequirements: Section[] = useMemo(() => {
    if (!sectionsQuery.data?.sections) return [];
    
    return sectionsQuery.data.sections.map(section => ({
      id: section.id,
      name: section.name,
      shortCode: section.shortCode,
      order: section.order,
      requirements: requirementsQueries.data?.find(
        r => r.sectionId === section.id
      )?.requirements || []
    })).sort((a, b) => a.order - b.order);
  }, [sectionsQuery.data, requirementsQueries.data]);

  // Handle focusing on a specific requirement
  useEffect(() => {
    if (!focusRequirementId || !sectionsWithRequirements.length) return;

    // Find the section containing the requirement and expand it
    const sectionWithRequirement = sectionsWithRequirements.find(section =>
      section.requirements.some(req => req.id === focusRequirementId)
    );

    if (sectionWithRequirement) {
      // Expand the section if it's collapsed
      setCollapsedSections(prev => {
        const newSet = new Set(prev);
        newSet.delete(sectionWithRequirement.id);
        return newSet;
      });

      // Wait for the section to expand, then scroll to the requirement
      setTimeout(() => {
        const requirementElement = document.getElementById(`req-${focusRequirementId}`);
        if (requirementElement) {
          requirementElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          // Add a temporary highlight effect
          requirementElement.style.backgroundColor = '#fef3c7';
          requirementElement.style.border = '2px solid #f59e0b';
          setTimeout(() => {
            requirementElement.style.backgroundColor = '';
            requirementElement.style.border = '';
          }, 3000);
        }
      }, 300);
    }
  }, [focusRequirementId, sectionsWithRequirements]);

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [isDragging, dragStart]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".window-controls")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const toggleMinimize = () => {
    setIsMinimized(prev => !prev);
  };

  const isLoading = sectionsQuery.isLoading || requirementsQueries.isLoading;
  const hasError = sectionsQuery.isError || requirementsQueries.isError;

  return (
    <div
      ref={windowRef}
      className="floating-document-window"
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: isMinimized ? "350px" : "600px",
        maxHeight: isMinimized ? "44px" : "70vh",
        background: "#ffffff",
        border: "1px solid #cbd5e1",
        borderRadius: "8px",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 1000,
        transition: isMinimized ? "all 0.3s ease" : undefined
      }}
    >
      <div
        ref={headerRef}
        className="window-header"
        onMouseDown={handleMouseDown}
        style={{
          padding: isMinimized ? "8px 12px" : "12px 16px",
          background: "linear-gradient(to right, #3b82f6, #2563eb)",
          color: "#ffffff",
          cursor: isDragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          userSelect: "none",
          borderBottom: isMinimized ? "none" : "1px solid #2563eb",
          minHeight: isMinimized ? "28px" : "auto"
        }}
      >
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: isMinimized ? "6px" : "8px",
          flex: 1,
          overflow: "hidden"
        }}>
          <svg 
            width={isMinimized ? "14" : "16"} 
            height={isMinimized ? "14" : "16"} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          <span style={{ 
            fontWeight: 600, 
            fontSize: isMinimized ? "13px" : "14px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}>
            {documentName}
          </span>
        </div>
        <div className="window-controls" style={{ 
          display: "flex", 
          gap: isMinimized ? "4px" : "8px",
          flexShrink: 0
        }}>
          <button
            onClick={toggleMinimize}
            style={{
              background: "rgba(255, 255, 255, 0.2)",
              border: "none",
              borderRadius: "3px",
              color: "#ffffff",
              width: isMinimized ? "20px" : "24px",
              height: isMinimized ? "20px" : "24px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s",
              fontSize: isMinimized ? "11px" : "12px"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.3)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
            title={isMinimized ? "Restore" : "Minimize"}
          >
            {isMinimized ? "▢" : "−"}
          </button>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.2)",
              border: "none",
              borderRadius: "3px",
              color: "#ffffff",
              width: isMinimized ? "20px" : "24px",
              height: isMinimized ? "20px" : "24px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s",
              fontSize: isMinimized ? "12px" : "14px"
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.5)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div
          className="window-content"
          style={{
            flex: 1,
            overflow: "auto",
            padding: "16px",
            background: "#f8fafc"
          }}
        >
          {isLoading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
              <Spinner />
            </div>
          )}

          {hasError && (
            <div style={{ padding: "16px", color: "#ef4444" }}>
              Error loading document content
            </div>
          )}

          {!isLoading && !hasError && sectionsWithRequirements.length === 0 && (
            <div style={{ padding: "16px", color: "#64748b", textAlign: "center" }}>
              No sections found in this document
            </div>
          )}

          {!isLoading && !hasError && sectionsWithRequirements.map(section => (
            <div
              key={section.id}
              className="document-section"
              style={{
                marginBottom: "16px",
                background: "#ffffff",
                borderRadius: "6px",
                border: "1px solid #e2e8f0",
                overflow: "hidden"
              }}
            >
              <button
                onClick={() => toggleSection(section.id)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  background: "#f1f5f9",
                  border: "none",
                  borderBottom: collapsedSections.has(section.id) ? "none" : "1px solid #e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textAlign: "left",
                  transition: "background 0.2s"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#e2e8f0"}
                onMouseLeave={e => e.currentTarget.style.background = "#f1f5f9"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", transform: collapsedSections.has(section.id) ? "rotate(-90deg)" : "none", transition: "transform 0.2s" }}>
                    ▼
                  </span>
                  <span style={{ fontWeight: 600, fontSize: "14px", color: "#1e293b" }}>
                    {section.shortCode ? `${section.shortCode}. ${section.name}` : section.name}
                  </span>
                  <span style={{ fontSize: "12px", color: "#64748b", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>
                    {section.requirements.length}
                  </span>
                </div>
              </button>

              {!collapsedSections.has(section.id) && (
                <div style={{ padding: "8px" }}>
                  {section.requirements.length === 0 ? (
                    <div style={{ padding: "8px 12px", color: "#94a3b8", fontSize: "13px", fontStyle: "italic" }}>
                      No requirements in this section
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "6px" }}>
                      {section.requirements.map(req => (
                        <div
                          key={req.id}
                          id={`req-${req.id}`}
                          style={{
                            padding: "8px 12px",
                            background: "#f8fafc",
                            borderRadius: "4px",
                            border: "1px solid #e2e8f0",
                            fontSize: "13px",
                            lineHeight: "1.5",
                            transition: "background-color 0.3s, border 0.3s"
                          }}
                        >
                          <div style={{ display: "flex", gap: "8px", marginBottom: "4px" }}>
                            <span style={{ fontWeight: 600, color: "#3b82f6" }}>{req.ref}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                            <span style={{ flex: 1, marginRight: "8px", color: "#334155" }}>{req.text}</span>
                            <LinkIndicators 
                              requirementId={req.id}
                              traceLinks={traceLinksQuery.data?.traceLinks || []}
                              tenant={tenant}
                              project={project}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isMinimized && (
        <div
          className="window-resize-handle"
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: "16px",
            height: "16px",
            cursor: "nwse-resize",
            background: "linear-gradient(135deg, transparent 50%, #cbd5e1 50%)",
            borderBottomRightRadius: "8px"
          }}
        />
      )}
    </div>
  );
}