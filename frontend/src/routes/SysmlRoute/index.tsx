import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../../lib/client";
import { useTenantProjectDocument } from "../../components/TenantProjectDocumentSelector";
import type {
  SysmlPackageRecord,
  SysmlElementRecord,
  SysmlDiagramRecord,
  SysmlRelationshipRecord,
  SysmlElementDetailResponse,
  CreateSysmlPackageRequest,
  CreateSysmlElementRequest,
  UpdateSysmlElementRequest,
  CreateSysmlRelationshipRequest,
  CreateSysmlDiagramRequest,
  UpdateSysmlDiagramRequest
} from "../../types";
import "./styles.css";

export function SysmlRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();

  if (!tenant || !project) {
    return (
      <div className="sysml-empty-state">
        <h1>SysML Models</h1>
        <p>Select a tenant and project to explore SysML v2 models.</p>
      </div>
    );
  }

  return <SysmlWorkspace tenant={tenant} project={project} />;
}

interface SysmlWorkspaceProps {
  tenant: string;
  project: string;
}

function SysmlWorkspace({ tenant, project }: SysmlWorkspaceProps): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const packagesKey = useMemo(() => ["sysml-packages", tenant, project], [tenant, project]);
  const packagesQuery = useQuery(packagesKey, () => api.listSysmlPackages(tenant, project));
  const packages = packagesQuery.data?.packages ?? [];

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  useEffect(() => {
    if (packages.length === 0) {
      setSelectedPackageId(null);
      return;
    }
    if (!selectedPackageId || !packages.some(pkg => pkg.id === selectedPackageId)) {
      setSelectedPackageId(packages[0].id);
    }
  }, [packages, selectedPackageId]);

  const elementsKey = useMemo(() => ["sysml-elements", tenant, project, selectedPackageId ?? "all"], [tenant, project, selectedPackageId]);
  const elementsQuery = useQuery(elementsKey, () => api.listSysmlElements(tenant, project, { packageId: selectedPackageId ?? undefined }), {
    enabled: Boolean(selectedPackageId)
  });
  const elements = elementsQuery.data?.elements ?? [];

  const diagramsKey = useMemo(() => ["sysml-diagrams", tenant, project, selectedPackageId ?? "all"], [tenant, project, selectedPackageId]);
  const diagramsQuery = useQuery(diagramsKey, () => api.listSysmlDiagrams(tenant, project, { packageId: selectedPackageId ?? undefined }), {
    enabled: Boolean(selectedPackageId)
  });
  const diagrams = diagramsQuery.data?.diagrams ?? [];

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedDiagramId, setSelectedDiagramId] = useState<string | null>(null);

  useEffect(() => {
    if (elements.length === 0) {
      setSelectedElementId(null);
      return;
    }
    if (!selectedElementId || !elements.some(el => el.id === selectedElementId)) {
      setSelectedElementId(elements[0].id);
    }
  }, [elements, selectedElementId]);

  useEffect(() => {
    if (diagrams.length === 0) {
      setSelectedDiagramId(null);
      return;
    }
    if (!selectedDiagramId || !diagrams.some(diagram => diagram.id === selectedDiagramId)) {
      setSelectedDiagramId(diagrams[0].id);
    }
  }, [diagrams, selectedDiagramId]);

  const elementDetailKey = useMemo(() => ["sysml-element-detail", tenant, project, selectedElementId], [tenant, project, selectedElementId]);
  const elementDetailQuery = useQuery(elementDetailKey, () => api.getSysmlElement(tenant, project, selectedElementId!), {
    enabled: Boolean(selectedElementId)
  });

  const diagramDetailKey = useMemo(() => ["sysml-diagram-detail", tenant, project, selectedDiagramId], [tenant, project, selectedDiagramId]);
  const diagramDetailQuery = useQuery(diagramDetailKey, () => api.getSysmlDiagram(tenant, project, selectedDiagramId!), {
    enabled: Boolean(selectedDiagramId)
  });

  const [newPackageName, setNewPackageName] = useState("");
  const [newPackageKind, setNewPackageKind] = useState<SysmlPackageRecord["packageKind"]>("model");
  const [newElementName, setNewElementName] = useState("");
  const [newElementType, setNewElementType] = useState<"block" | "interface" | "port">("block");
  const [newBlockKind, setNewBlockKind] = useState("component");
  const [newInterfaceProtocol, setNewInterfaceProtocol] = useState("CAN");
  const [newInterfaceDirection, setNewInterfaceDirection] = useState<"in" | "out" | "inout" | "none">("inout");
  const [newInterfaceRate, setNewInterfaceRate] = useState<number | "">(10);
  const [newPortDirection, setNewPortDirection] = useState<"in" | "out" | "inout" | "none">("out");
  const [newPortType, setNewPortType] = useState("flow");
  const [newPortTypeRef, setNewPortTypeRef] = useState("Signal");
  const [newDiagramName, setNewDiagramName] = useState("");
  const [newDiagramType, setNewDiagramType] = useState<CreateSysmlDiagramRequest["diagramType"]>("bdd");

  const createPackageMutation = useMutation(
    (payload: CreateSysmlPackageRequest) => api.createSysmlPackage(tenant, project, payload),
    {
      onSuccess: ({ package: pkg }) => {
        toast.success("Package created");
        queryClient.invalidateQueries(packagesKey);
        setSelectedPackageId(pkg.id);
        setNewPackageName("");
      },
      onError: (error: unknown) => {
        toast.error((error as Error).message);
      }
    }
  );

  const updatePackageMutation = useMutation(
    ({ packageId, updates }: { packageId: string; updates: Partial<CreateSysmlPackageRequest> }) =>
      api.updateSysmlPackage(tenant, project, packageId, updates),
    {
      onSuccess: () => {
        toast.success("Package updated");
        queryClient.invalidateQueries(packagesKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const deletePackageMutation = useMutation(
    (packageId: string) => api.deleteSysmlPackage(tenant, project, packageId),
    {
      onSuccess: () => {
        toast.success("Package deleted");
        queryClient.invalidateQueries(packagesKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const createElementMutation = useMutation(
    (payload: CreateSysmlElementRequest) => api.createSysmlElement(tenant, project, payload),
    {
      onSuccess: ({ element }) => {
        toast.success("Element created");
        queryClient.invalidateQueries(elementsKey);
        queryClient.invalidateQueries(elementDetailKey);
        setSelectedElementId(element.id);
        setNewElementName("");
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const updateElementMutation = useMutation(
    ({ elementId, updates }: { elementId: string; updates: UpdateSysmlElementRequest }) =>
      api.updateSysmlElement(tenant, project, elementId, updates),
    {
      onSuccess: () => {
        toast.success("Element updated");
        queryClient.invalidateQueries(elementsKey);
        queryClient.invalidateQueries(elementDetailKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const deleteElementMutation = useMutation(
    (elementId: string) => api.deleteSysmlElement(tenant, project, elementId),
    {
      onSuccess: () => {
        toast.success("Element deleted");
        queryClient.invalidateQueries(elementsKey);
        queryClient.invalidateQueries(elementDetailKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const createRelationshipMutation = useMutation(
    ({ elementId, body }: { elementId: string; body: CreateSysmlRelationshipRequest }) =>
      api.createSysmlElementRelationship(tenant, project, elementId, body),
    {
      onSuccess: () => {
        toast.success("Relationship created");
        queryClient.invalidateQueries(elementDetailKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const deleteRelationshipMutation = useMutation(
    ({ elementId, relationshipId }: { elementId: string; relationshipId: string }) =>
      api.deleteSysmlElementRelationship(tenant, project, elementId, relationshipId),
    {
      onSuccess: () => {
        toast.success("Relationship deleted");
        queryClient.invalidateQueries(elementDetailKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const createDiagramMutation = useMutation(
    (payload: CreateSysmlDiagramRequest) => api.createSysmlDiagram(tenant, project, payload),
    {
      onSuccess: ({ diagram }) => {
        toast.success("Diagram created");
        queryClient.invalidateQueries(diagramsKey);
        queryClient.invalidateQueries(diagramDetailKey);
        setSelectedDiagramId(diagram.id);
        setNewDiagramName("");
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const updateDiagramMutation = useMutation(
    ({ diagramId, updates }: { diagramId: string; updates: UpdateSysmlDiagramRequest }) =>
      api.updateSysmlDiagram(tenant, project, diagramId, updates),
    {
      onSuccess: () => {
        toast.success("Diagram updated");
        queryClient.invalidateQueries(diagramsKey);
        queryClient.invalidateQueries(diagramDetailKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const deleteDiagramMutation = useMutation(
    (diagramId: string) => api.deleteSysmlDiagram(tenant, project, diagramId),
    {
      onSuccess: () => {
        toast.success("Diagram deleted");
        queryClient.invalidateQueries(diagramsKey);
        queryClient.invalidateQueries(diagramDetailKey);
      },
      onError: (error: unknown) => toast.error((error as Error).message)
    }
  );

  const handleCreatePackage = (event: React.FormEvent) => {
    event.preventDefault();
    if (!newPackageName.trim()) return;
    const payload: CreateSysmlPackageRequest = {
      name: newPackageName.trim(),
      packageKind: newPackageKind,
      defaultViewpoints: newPackageKind === "model" ? ["bdd", "ibd"] : undefined
    };
    createPackageMutation.mutate(payload);
  };

  const handleRenamePackage = (pkg: SysmlPackageRecord) => {
    const nextName = window.prompt("Rename package", pkg.name);
    if (!nextName || nextName.trim() === pkg.name) return;
    updatePackageMutation.mutate({ packageId: pkg.id, updates: { name: nextName.trim() } });
  };

  const handleDeletePackage = (pkg: SysmlPackageRecord) => {
    if (!window.confirm(`Delete package "${pkg.name}"?`)) return;
    deletePackageMutation.mutate(pkg.id);
  };

  const handleCreateElement = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPackageId) {
      toast.error("Select a package before creating elements");
      return;
    }
    if (!newElementName.trim()) return;

    let payload: CreateSysmlElementRequest;
    if (newElementType === "block") {
      payload = {
        elementType: "block",
        name: newElementName.trim(),
        packageId: selectedPackageId,
        block: {
          blockKind: newBlockKind,
          defaultSize: { width: 320, height: 180 }
        }
      };
    } else if (newElementType === "interface") {
      payload = {
        elementType: "interface",
        name: newElementName.trim(),
        packageId: selectedPackageId,
        interface: {
          protocol: newInterfaceProtocol || null,
          direction: newInterfaceDirection,
          rate: newInterfaceRate === "" ? null : Number(newInterfaceRate)
        }
      };
    } else {
      payload = {
        elementType: "port",
        name: newElementName.trim(),
        packageId: selectedPackageId,
        port: {
          direction: newPortDirection,
          portType: newPortType || null,
          typeRef: newPortTypeRef || null,
          isConjugated: false
        }
      };
    }

    createElementMutation.mutate(payload);
  };

  const handleRenameElement = (element: SysmlElementRecord) => {
    const nextName = window.prompt("Rename element", element.name);
    if (!nextName || nextName.trim() === element.name) return;
    updateElementMutation.mutate({ elementId: element.id, updates: { name: nextName.trim() } });
  };

  const handleDeleteElement = (element: SysmlElementRecord) => {
    if (!window.confirm(`Delete element "${element.name}"?`)) return;
    deleteElementMutation.mutate(element.id);
  };

  const handleCreateDiagram = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPackageId) {
      toast.error("Select a package before creating diagrams");
      return;
    }
    if (!newDiagramName.trim()) return;
    const payload: CreateSysmlDiagramRequest = {
      name: newDiagramName.trim(),
      diagramType: newDiagramType,
      packageId: selectedPackageId,
      metadata: { seeded: false }
    };
    createDiagramMutation.mutate(payload);
  };

  const handleRenameDiagram = (diagram: SysmlDiagramRecord) => {
    const nextName = window.prompt("Rename diagram", diagram.name);
    if (!nextName || nextName.trim() === diagram.name) return;
    updateDiagramMutation.mutate({ diagramId: diagram.id, updates: { name: nextName.trim() } });
  };

  const handleDeleteDiagram = (diagram: SysmlDiagramRecord) => {
    if (!window.confirm(`Delete diagram "${diagram.name}"?`)) return;
    deleteDiagramMutation.mutate(diagram.id);
  };

  const handleCreateRelationship = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedElementId) return;
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const targetId = formData.get("targetId") as string;
    const type = (formData.get("relationshipType") as string) || "HAS_PART";
    if (!targetId) {
      toast.error("Select a target element");
      return;
    }
    const payload: CreateSysmlRelationshipRequest = {
      targetElementId: targetId,
      type,
      metadata: formData.get("relationshipMultiplicity")
        ? { multiplicity: String(formData.get("relationshipMultiplicity")) }
        : undefined
    };
    createRelationshipMutation.mutate({ elementId: selectedElementId, body: payload });
    form.reset();
  };

  const handleDeleteRelationship = (relationship: SysmlRelationshipRecord) => {
    if (!selectedElementId || !relationship.id) return;
    if (!window.confirm("Remove this relationship?")) return;
    deleteRelationshipMutation.mutate({ elementId: selectedElementId, relationshipId: relationship.id });
  };

  const selectedElementDetail: SysmlElementDetailResponse | undefined = elementDetailQuery.data;
  const relationships = selectedElementDetail?.relationships ?? [];
  const outgoingRelationships = relationships.filter(rel => rel.direction === "outgoing");

  return (
    <div className="sysml-workspace">
      <h1>SysML Models</h1>

      <div className="sysml-columns">
        <div className="sysml-panel">
          <header>
            <h2>Packages</h2>
            <span>{packages.length}</span>
          </header>

          <form className="sysml-form" onSubmit={handleCreatePackage}>
            <div className="sysml-form-row">
              <input
                value={newPackageName}
                onChange={(event) => setNewPackageName(event.target.value)}
                placeholder="New package name"
                required
              />
              <select value={newPackageKind} onChange={(event) => setNewPackageKind(event.target.value as SysmlPackageRecord["packageKind"])}>
                <option value="model">Model</option>
                <option value="view">View</option>
                <option value="library">Library</option>
              </select>
            </div>
            <button type="submit" disabled={createPackageMutation.isLoading}>Add Package</button>
          </form>

          <div className="sysml-list">
            {packages.map(pkg => (
              <div key={pkg.id} className="sysml-item" style={{ borderColor: pkg.id === selectedPackageId ? "#2563eb" : undefined, background: pkg.id === selectedPackageId ? "#eef2ff" : undefined }}>
                <button className={pkg.id === selectedPackageId ? "active" : ""} onClick={() => setSelectedPackageId(pkg.id)}>
                  <span>{pkg.name}</span>
                  <small>{pkg.packageKind}</small>
                </button>
                <div className="sysml-action-bar">
                  <button className="secondary" type="button" onClick={() => handleRenamePackage(pkg)}>Rename</button>
                  <button className="danger" type="button" onClick={() => handleDeletePackage(pkg)} disabled={deletePackageMutation.isLoading}>Delete</button>
                </div>
              </div>
            ))}
            {packages.length === 0 && <div className="sysml-empty-state">No packages yet.</div>}
          </div>
        </div>

        <div className="sysml-panel">
          <header>
            <h2>Elements</h2>
            <span>{elements.length}</span>
          </header>

          {selectedPackageId ? (
            <form className="sysml-form" onSubmit={handleCreateElement}>
              <div className="sysml-form-row">
                <input
                  value={newElementName}
                  onChange={(event) => setNewElementName(event.target.value)}
                  placeholder="Element name"
                  required
                />
                <select value={newElementType} onChange={(event) => setNewElementType(event.target.value as "block" | "interface" | "port") }>
                  <option value="block">Block</option>
                  <option value="interface">Interface</option>
                  <option value="port">Port</option>
                </select>
              </div>

              {newElementType === "block" && (
                <div className="sysml-form-row">
                  <input value={newBlockKind} onChange={(event) => setNewBlockKind(event.target.value)} placeholder="Block kind" />
                </div>
              )}

              {newElementType === "interface" && (
                <div className="sysml-form-row">
                  <input value={newInterfaceProtocol} onChange={(event) => setNewInterfaceProtocol(event.target.value)} placeholder="Protocol" />
                  <select value={newInterfaceDirection} onChange={(event) => setNewInterfaceDirection(event.target.value as "in" | "out" | "inout" | "none") }>
                    <option value="in">In</option>
                    <option value="out">Out</option>
                    <option value="inout">In/Out</option>
                    <option value="none">None</option>
                  </select>
                  <input
                    type="number"
                    value={newInterfaceRate === "" ? "" : newInterfaceRate}
                    min={0}
                    onChange={(event) => setNewInterfaceRate(event.target.value === "" ? "" : Number(event.target.value))}
                    placeholder="Rate"
                  />
                </div>
              )}

              {newElementType === "port" && (
                <div className="sysml-form-row">
                  <select value={newPortDirection} onChange={(event) => setNewPortDirection(event.target.value as "in" | "out" | "inout" | "none") }>
                    <option value="in">In</option>
                    <option value="out">Out</option>
                    <option value="inout">In/Out</option>
                    <option value="none">None</option>
                  </select>
                  <input value={newPortType} onChange={(event) => setNewPortType(event.target.value)} placeholder="Port type" />
                  <input value={newPortTypeRef} onChange={(event) => setNewPortTypeRef(event.target.value)} placeholder="Type reference" />
                </div>
              )}

              <button type="submit" disabled={createElementMutation.isLoading}>Add Element</button>
            </form>
          ) : (
            <div className="sysml-empty-state">Select a package to manage elements.</div>
          )}

          <div className="sysml-list">
            {elements.map(element => (
              <div key={element.id} className="sysml-item" style={{ borderColor: element.id === selectedElementId ? "#2563eb" : undefined, background: element.id === selectedElementId ? "#eef2ff" : undefined }}>
                <button className={element.id === selectedElementId ? "active" : ""} onClick={() => setSelectedElementId(element.id)}>
                  <span>{element.name}</span>
                  <small>{element.elementType}</small>
                </button>
                <div className="sysml-action-bar">
                  <button className="secondary" type="button" onClick={() => handleRenameElement(element)}>Rename</button>
                  <button className="danger" type="button" onClick={() => handleDeleteElement(element)} disabled={deleteElementMutation.isLoading}>Delete</button>
                </div>
              </div>
            ))}
            {elements.length === 0 && selectedPackageId && <div className="sysml-empty-state">No elements yet.</div>}
          </div>

          {selectedElementDetail && (
            <section>
              <h3>Details</h3>
              <div className="sysml-detail-card">
                <strong>{selectedElementDetail.element.name}</strong>
                <span>Type: {selectedElementDetail.element.elementType}</span>
                {selectedElementDetail.element.block?.blockKind && <span>Block kind: {selectedElementDetail.element.block.blockKind}</span>}
                {selectedElementDetail.element.interface?.protocol && <span>Protocol: {selectedElementDetail.element.interface.protocol}</span>}
                {selectedElementDetail.element.port?.portType && <span>Port type: {selectedElementDetail.element.port.portType}</span>}
                {selectedElementDetail.element.documentation && <span>{selectedElementDetail.element.documentation}</span>}
              </div>

              <h4>Relationships</h4>
              <form className="sysml-form" onSubmit={handleCreateRelationship}>
                <div className="sysml-form-row">
                  <select name="targetId" defaultValue="">
                    <option value="" disabled>Select target</option>
                    {elements
                      .filter(el => el.id !== selectedElementDetail.element.id)
                      .map(el => (
                        <option key={el.id} value={el.id}>{el.name}</option>
                      ))}
                  </select>
                  <input name="relationshipType" placeholder="Type (e.g. HAS_PART)" defaultValue="HAS_PART" />
                  <input name="relationshipMultiplicity" placeholder="Multiplicity" />
                </div>
                <button type="submit" disabled={createRelationshipMutation.isLoading}>Add Relationship</button>
              </form>

              <div className="sysml-list">
                {outgoingRelationships.map(rel => (
                  <div key={rel.id ?? `${rel.type}-${rel.targetId}`} className="sysml-item">
                    <span>{rel.type} → {displayElementName(elements, rel.targetId)}</span>
                    <div className="sysml-action-bar">
                      {rel.metadata?.multiplicity && <small>{String(rel.metadata.multiplicity)}</small>}
                      {rel.id && (
                        <button className="danger" type="button" onClick={() => handleDeleteRelationship(rel)} disabled={deleteRelationshipMutation.isLoading}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {outgoingRelationships.length === 0 && <div className="sysml-empty-state">No relationships yet.</div>}
              </div>
            </section>
          )}
        </div>

        <div className="sysml-panel">
          <header>
            <h2>Diagrams</h2>
            <span>{diagrams.length}</span>
          </header>

          {selectedPackageId ? (
            <form className="sysml-form" onSubmit={handleCreateDiagram}>
              <div className="sysml-form-row">
                <input
                  value={newDiagramName}
                  onChange={(event) => setNewDiagramName(event.target.value)}
                  placeholder="Diagram name"
                  required
                />
                <select value={newDiagramType} onChange={(event) => setNewDiagramType(event.target.value as CreateSysmlDiagramRequest["diagramType"])}>
                  <option value="bdd">Block Definition</option>
                  <option value="ibd">Internal Block</option>
                  <option value="deployment">Deployment</option>
                  <option value="requirements">Requirements</option>
                </select>
              </div>
              <button type="submit" disabled={createDiagramMutation.isLoading}>Add Diagram</button>
            </form>
          ) : (
            <div className="sysml-empty-state">Select a package to manage diagrams.</div>
          )}

          <div className="sysml-list">
            {diagrams.map(diagram => (
              <div key={diagram.id} className="sysml-item" style={{ borderColor: diagram.id === selectedDiagramId ? "#2563eb" : undefined, background: diagram.id === selectedDiagramId ? "#eef2ff" : undefined }}>
                <button className={diagram.id === selectedDiagramId ? "active" : ""} onClick={() => setSelectedDiagramId(diagram.id)}>
                  <span>{diagram.name}</span>
                  <small>{diagram.diagramType}</small>
                </button>
                <div className="sysml-action-bar">
                  <button className="secondary" type="button" onClick={() => handleRenameDiagram(diagram)}>Rename</button>
                  <button className="danger" type="button" onClick={() => handleDeleteDiagram(diagram)} disabled={deleteDiagramMutation.isLoading}>Delete</button>
                </div>
              </div>
            ))}
            {diagrams.length === 0 && selectedPackageId && <div className="sysml-empty-state">No diagrams yet.</div>}
          </div>

          {diagramDetailQuery.data && (
            <section>
              <h3>Diagram Detail</h3>
              <div className="sysml-detail-card">
                <strong>{diagramDetailQuery.data.diagram.name}</strong>
                <span>Type: {diagramDetailQuery.data.diagram.diagramType}</span>
                {diagramDetailQuery.data.diagram.description && <span>{diagramDetailQuery.data.diagram.description}</span>}
              </div>
              <div className="sysml-detail-card">
                <strong>Nodes</strong>
                {diagramDetailQuery.data.nodes.length === 0 && <span>No nodes yet.</span>}
                {diagramDetailQuery.data.nodes.map(node => (
                  <span key={`${diagramDetailQuery.data.diagram.id}-${node.elementId}`}>
                    {displayElementName(elements, node.elementId)} @ {formatNodePosition(node)}
                  </span>
                ))}
              </div>
              <div className="sysml-detail-card">
                <strong>Connections</strong>
                {diagramDetailQuery.data.connections.length === 0 && <span>No connections yet.</span>}
                {diagramDetailQuery.data.connections.map(connection => (
                  <span key={connection.connectionId}>
                    {displayElementName(elements, connection.sourceId)} → {displayElementName(elements, connection.targetId)} {formatConnectionStyle(connection)}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function displayElementName(elements: SysmlElementRecord[], id: string): string {
  const match = elements.find(el => el.id === id);
  return match ? match.name : id;
}

function formatNodePosition(node: SysmlDiagramNodeLayout): string {
  const x = node.position?.x ?? "–";
  const y = node.position?.y ?? "–";
  return `(${x}, ${y})`;
}

function formatConnectionStyle(connection: SysmlDiagramEdgeLayout): string {
  const style = connection.style as { lineStyle?: unknown } | undefined;
  const lineStyle = typeof style?.lineStyle === "string" ? style.lineStyle : undefined;
  return lineStyle ? `(${lineStyle})` : "";
}
