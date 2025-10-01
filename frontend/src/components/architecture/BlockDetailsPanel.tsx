import { useState, useEffect } from "react";
import type { SysmlBlock, PortDirection } from "../../hooks/useArchitecture";
import type { DocumentRecord } from "../../types";
import { useDebounce } from "../../hooks/useDebounce";

interface BlockDetailsPanelProps {
  block: SysmlBlock;
  onUpdate: (updates: Partial<Omit<SysmlBlock, "id" | "ports" | "position" | "size">>) => void;
  onUpdatePosition: (position: { x: number; y: number }) => void;
  onUpdateSize: (size: { width: number; height: number }) => void;
  onRemove: () => void;
  onAddPort: (port: { name: string; direction: PortDirection }) => void;
  onUpdatePort: (portId: string, updates: { name?: string; direction?: PortDirection }) => void;
  onRemovePort: (portId: string) => void;
  documents: DocumentRecord[];
  onAddDocument: (documentId: string) => void;
  onRemoveDocument: (documentId: string) => void;
}

const kindOptions = [
  { value: "system", label: "System" },
  { value: "subsystem", label: "Subsystem" },
  { value: "component", label: "Component" },
  { value: "actor", label: "Actor" },
  { value: "external", label: "External" },
  { value: "interface", label: "Interface" }
] as const;

const directionOptions: { value: PortDirection; label: string }[] = [
  { value: "in", label: "Input" },
  { value: "out", label: "Output" },
  { value: "inout", label: "Bidirectional" }
];

export function BlockDetailsPanel({
  block,
  onUpdate,
  onUpdatePosition,
  onUpdateSize,
  onRemove,
  onAddPort,
  onUpdatePort,
  onRemovePort,
  documents,
  onAddDocument,
  onRemoveDocument
}: BlockDetailsPanelProps) {
  const [portDraft, setPortDraft] = useState({ name: "", direction: "in" as PortDirection });
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  
  // Local state for form fields with debouncing
  const [localName, setLocalName] = useState(block.name);
  const [localStereotype, setLocalStereotype] = useState(block.stereotype ?? "");
  const [localDescription, setLocalDescription] = useState(block.description ?? "");
  const [localPortNames, setLocalPortNames] = useState<Record<string, string>>({});
  
  // Initialize local port names
  useEffect(() => {
    const portNames: Record<string, string> = {};
    block.ports.forEach(port => {
      portNames[port.id] = port.name;
    });
    setLocalPortNames(portNames);
  }, [block.ports]);
  
  // Create debounced update functions
  const [debouncedUpdate] = useDebounce((updates: Partial<Omit<SysmlBlock, "id" | "ports" | "position" | "size">>) => {
    onUpdate(updates);
  }, 500);
  
  const [debouncedPortUpdate] = useDebounce((portId: string, updates: { name?: string; direction?: PortDirection }) => {
    onUpdatePort(portId, updates);
  }, 500);

  // Update local state when block prop changes (when switching blocks)
  useEffect(() => {
    setLocalName(block.name);
    setLocalStereotype(block.stereotype ?? "");
    setLocalDescription(block.description ?? "");
  }, [block.id]); // Only update when switching to a different block

  const linkedDocuments = documents.filter(doc => block.documentIds?.includes(doc.id));
  const availableDocuments = documents.filter(doc => !block.documentIds?.includes(doc.id));

  const handleAddPort = () => {
    if (!portDraft.name.trim()) {return;}
    onAddPort({ name: portDraft.name.trim(), direction: portDraft.direction });
    setPortDraft({ name: "", direction: "in" });
  };

  const handleAddDocument = () => {
    if (!selectedDocumentId) {return;}
    onAddDocument(selectedDocumentId);
    setSelectedDocumentId("");
  };

  return (
    <aside className="panel" style={{ minWidth: "280px" }}>
      <div className="panel-header">
        <div>
          <h2>Block Details</h2>
          <p style={{ fontSize: "12px", color: "#64748b" }}>Edit SysML block properties</p>
        </div>
        <button className="ghost-button" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div className="field">
        <label>Name</label>
        <input
          value={localName}
          onChange={event => {
            const newName = event.target.value;
            setLocalName(newName);
            debouncedUpdate({ name: newName });
          }}
          placeholder="Block name"
        />
      </div>

      <div className="field">
        <label>Stereotype</label>
        <input
          value={localStereotype}
          onChange={event => {
            const newStereotype = event.target.value;
            setLocalStereotype(newStereotype);
            debouncedUpdate({ stereotype: newStereotype });
          }}
          placeholder="e.g. <<system>>, <<subsystem>>, <<component>>, <<actor>>"
        />
      </div>

      <div className="field">
        <label>Kind</label>
        <select
          value={block.kind}
          onChange={event => onUpdate({ kind: event.target.value as SysmlBlock["kind"] })}
        >
          {kindOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Description</label>
        <textarea
          value={localDescription}
          onChange={event => {
            const newDescription = event.target.value;
            setLocalDescription(newDescription);
            debouncedUpdate({ description: newDescription });
          }}
          rows={3}
          placeholder="Optional block description"
        />
      </div>

      <div className="field" style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <label>Position X</label>
          <input
            type="number"
            value={Math.round(block.position.x)}
            onChange={event => onUpdatePosition({ x: Number(event.target.value), y: block.position.y })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>Position Y</label>
          <input
            type="number"
            value={Math.round(block.position.y)}
            onChange={event => onUpdatePosition({ x: block.position.x, y: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="field" style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <label>Width</label>
          <input
            type="number"
            min={120}
            value={Math.round(block.size.width)}
            onChange={event => onUpdateSize({ width: Number(event.target.value), height: block.size.height })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>Height</label>
          <input
            type="number"
            min={120}
            value={Math.round(block.size.height)}
            onChange={event => onUpdateSize({ width: block.size.width, height: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="panel" style={{ background: "#f8fafc", border: "1px solid #dbeafe" }}>
        <h3 style={{ marginTop: 0 }}>Ports</h3>
        {block.ports.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#64748b" }}>No ports defined yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px" }}>
            {block.ports.map(port => (
              <li key={port.id} style={{
                padding: "8px",
                borderRadius: "6px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "6px"
              }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Name</label>
                  <input
                    value={localPortNames[port.id] ?? port.name}
                    onChange={event => {
                      const newName = event.target.value;
                      // Update local state immediately for responsiveness
                      setLocalPortNames(prev => ({ ...prev, [port.id]: newName }));
                      // Trigger debounced update to backend
                      debouncedPortUpdate(port.id, { name: newName });
                    }}
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Direction</label>
                  <select
                    value={port.direction}
                    onChange={event => onUpdatePort(port.id, { direction: event.target.value as PortDirection })}
                  >
                    {directionOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="ghost-button" onClick={() => onRemovePort(port.id)}>
                  Remove port
                </button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>New port name</label>
            <input
              value={portDraft.name}
              onChange={event => setPortDraft(prev => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. HTTP API"
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Direction</label>
            <select
              value={portDraft.direction}
              onChange={event => setPortDraft(prev => ({ ...prev, direction: event.target.value as PortDirection }))}
            >
              {directionOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button className="primary-button" onClick={handleAddPort} disabled={!portDraft.name.trim()}>
            Add port
          </button>
        </div>
      </div>

      <div className="panel" style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}>
        <h3 style={{ marginTop: 0 }}>Associated Documents</h3>
        {linkedDocuments.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#64748b" }}>No documents linked yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "6px" }}>
            {linkedDocuments.map(doc => (
              <li key={doc.id} style={{
                padding: "8px",
                borderRadius: "6px",
                background: "#fff",
                border: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: "14px" }}>{doc.name}</div>
                  {doc.description && (
                    <div style={{ fontSize: "12px", color: "#64748b" }}>{doc.description}</div>
                  )}
                </div>
                <button 
                  className="ghost-button" 
                  onClick={() => onRemoveDocument(doc.id)}
                  style={{ fontSize: "12px", padding: "4px 8px" }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {availableDocuments.length > 0 && (
          <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Link document</label>
              <select
                value={selectedDocumentId}
                onChange={event => setSelectedDocumentId(event.target.value)}
              >
                <option value="">Select a document...</option>
                {availableDocuments.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>
            <button 
              className="primary-button" 
              onClick={handleAddDocument} 
              disabled={!selectedDocumentId}
            >
              Link document
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
