import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenantProject } from "../hooks/useTenantProject";
import { useDocumentState } from "../hooks/useDocumentState";
import { useApiClient } from "../lib/client";
import { DocumentSelector } from "./DocumentSelector";
import { CreateDocumentModal } from "./CreateDocumentModal";

export function TenantProjectDocumentSelector(): JSX.Element {
  const api = useApiClient();
  const { state: tpState, setTenant, setProject, reset: resetTenantProject } = useTenantProject();
  const { state: docState, setDocument, reset: resetDocument } = useDocumentState();
  const [showCreateDocModal, setShowCreateDocModal] = useState(false);

  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: api.listTenants
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", tpState.tenant],
    queryFn: () => api.listProjects(tpState.tenant ?? ""),
    enabled: Boolean(tpState.tenant)
  });

  useEffect(() => {
    if (!tpState.tenant) {
      if (tpState.project) {
        setProject(null);
      }
      if (docState.documentSlug) {
        setDocument(null);
      }
      return;
    }
    if (!projectsQuery.data || !projectsQuery.data.projects.length) return;
    if (!tpState.project) {
      setProject(projectsQuery.data.projects[0]?.slug ?? null);
    }
  }, [tpState.tenant, tpState.project, projectsQuery.data, setProject, docState.documentSlug, setDocument]);

  useEffect(() => {
    if (!tpState.project && docState.documentSlug) {
      setDocument(null);
    }
  }, [tpState.project, docState.documentSlug, setDocument]);

  const handleReset = () => {
    resetTenantProject();
    resetDocument();
  };

  const handleCreateDocument = () => {
    setShowCreateDocModal(true);
  };

  const handleDocumentCreated = (documentSlug: string) => {
    setDocument(documentSlug);
  };

  return (
    <>
      <div className="selector">
        <div className="selector-field">
          <label htmlFor="tenant-input">Tenant</label>
          <input
            id="tenant-input"
            list="tenant-options"
            value={tpState.tenant ?? ""}
            onChange={event => setTenant(event.target.value.trim() || null)}
            placeholder="tenant slug"
          />
          <datalist id="tenant-options">
            {(tenantsQuery.data?.tenants ?? []).map(tenant => (
              <option key={tenant.slug} value={tenant.slug}>
                {tenant.name ? `${tenant.name} (${tenant.slug})` : tenant.slug}
              </option>
            ))}
          </datalist>
        </div>
        
        <div className="selector-field">
          <label htmlFor="project-input">Project</label>
          <input
            id="project-input"
            list="project-options"
            value={tpState.project ?? ""}
            onChange={event => setProject(event.target.value.trim() || null)}
            placeholder="project key"
            disabled={!tpState.tenant}
          />
          <datalist id="project-options">
            {(projectsQuery.data?.projects ?? []).map(project => (
              <option key={project.slug} value={project.slug}>
                {project.key ? `${project.key} (${project.slug})` : project.slug}
              </option>
            ))}
          </datalist>
        </div>

        {tpState.tenant && tpState.project && (
          <DocumentSelector
            tenant={tpState.tenant}
            project={tpState.project}
            selectedDocument={docState.documentSlug}
            onDocumentChange={setDocument}
            onCreateDocument={handleCreateDocument}
          />
        )}
        
        <div className="selector-field selector-field--compact">
          <button type="button" onClick={handleReset} className="ghost-button">
            Clear
          </button>
        </div>
        
        {tenantsQuery.isError && <span className="hint">Failed to load tenants.</span>}
        {projectsQuery.isError && <span className="hint">Failed to load projects.</span>}
      </div>

      {showCreateDocModal && tpState.tenant && tpState.project && (
        <CreateDocumentModal
          tenant={tpState.tenant}
          project={tpState.project}
          onClose={() => setShowCreateDocModal(false)}
          onCreated={handleDocumentCreated}
        />
      )}
    </>
  );
}

export function useTenantProjectDocument() {
  const tenantProject = useTenantProject();
  const document = useDocumentState();
  
  return {
    tenant: tenantProject.state.tenant,
    project: tenantProject.state.project,
    documentSlug: document.state.documentSlug,
    setDocument: document.setDocument,
    reset: () => {
      tenantProject.reset();
      document.reset();
    }
  };
}