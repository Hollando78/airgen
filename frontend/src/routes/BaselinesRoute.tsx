import type { FormEvent} from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";

import type { BaselineRecord } from "../types";

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

function buildBaselineKey(item: BaselineRecord, index: number): string {
  return [item.id, item.ref, item.createdAt, index].filter(Boolean).join(":");
}

export function BaselinesRoute(): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState("");
  const [author, setAuthor] = useState("");
  const [fromBaseline, setFromBaseline] = useState("");
  const [toBaseline, setToBaseline] = useState("");
  const [showComparison, setShowComparison] = useState(false);

  const baselinesQuery = useQuery({
    queryKey: ["baselines", state.tenant, state.project],
    queryFn: () => api.listBaselines(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const createBaselineMutation = useMutation({
    mutationFn: async (payload: { label?: string; author?: string }) => {
      if (!state.tenant || !state.project) {
        throw new Error("Select a tenant and project first.");
      }
      const result = await api.createBaseline({
        tenant: state.tenant,
        projectKey: state.project,
        label: payload.label,
        author: payload.author
      });
      await queryClient.invalidateQueries({ queryKey: ["baselines", state.tenant, state.project] });
      return result.baseline;
    }
  });

  const comparisonQuery = useQuery({
    queryKey: ["baseline-comparison", state.tenant, state.project, fromBaseline, toBaseline],
    queryFn: () => api.compareBaselines(state.tenant ?? "", state.project ?? "", fromBaseline, toBaseline),
    enabled: Boolean(state.tenant && state.project && fromBaseline && toBaseline && showComparison)
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createBaselineMutation.mutate({
      label: label || undefined,
      author: author || undefined
    });
  };

  if (!state.tenant || !state.project) {
    return (
      <div className="panel">
        <h1>Baselines</h1>
        <p>Select a tenant and project to manage baselines.</p>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Baselines</h1>
            <p>
              {state.tenant} / {state.project}
            </p>
          </div>
        </div>

        <form className="baseline-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Label</span>
            <input value={label} onChange={event => setLabel(event.target.value)} placeholder="Release 1.0" />
          </label>
          <label className="field">
            <span>Author</span>
            <input value={author} onChange={event => setAuthor(event.target.value)} placeholder="Jane Doe" />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={createBaselineMutation.isPending}>
              {createBaselineMutation.isPending ? "Creating..." : "Create baseline"}
            </button>
          </div>
        </form>
        {createBaselineMutation.isError && <ErrorState message={(createBaselineMutation.error as Error).message} />}
        {createBaselineMutation.isSuccess && (
          <div className="alert alert-success">Baseline {createBaselineMutation.data.ref} created.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>History</h2>
        </div>
        {baselinesQuery.isLoading ? (
          <Spinner />
        ) : baselinesQuery.isError ? (
          <ErrorState message={(baselinesQuery.error as Error).message} />
        ) : baselinesQuery.data?.items.length ? (
          <div className="baseline-table-container">
            <table className="data-table baseline-table">
              <thead>
                <tr>
                  <th rowSpan={2}>Ref</th>
                  <th rowSpan={2}>Created</th>
                  <th rowSpan={2}>Author</th>
                  <th rowSpan={2}>Label</th>
                  <th colSpan={10} style={{ textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>Version Snapshot Counts</th>
                </tr>
                <tr>
                  <th>Req</th>
                  <th>Doc</th>
                  <th>Sec</th>
                  <th>Info</th>
                  <th>Sur</th>
                  <th>Link</th>
                  <th>LSet</th>
                  <th>Diag</th>
                  <th>Blk</th>
                  <th>Conn</th>
                </tr>
              </thead>
              <tbody>
                {baselinesQuery.data.items.map((item, index) => (
                  <tr key={buildBaselineKey(item, index)}>
                    <td><strong>{item.ref}</strong></td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>{item.author ?? "—"}</td>
                    <td>{item.label ?? "—"}</td>
                    <td>{item.requirementVersionCount ?? 0}</td>
                    <td>{item.documentVersionCount ?? 0}</td>
                    <td>{item.documentSectionVersionCount ?? 0}</td>
                    <td>{item.infoVersionCount ?? 0}</td>
                    <td>{item.surrogateVersionCount ?? 0}</td>
                    <td>{item.traceLinkVersionCount ?? 0}</td>
                    <td>{item.linksetVersionCount ?? 0}</td>
                    <td>{item.diagramVersionCount ?? 0}</td>
                    <td>{item.blockVersionCount ?? 0}</td>
                    <td>{item.connectorVersionCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No baselines created yet.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Compare Baselines</h2>
        </div>
        {baselinesQuery.data?.items.length && baselinesQuery.data.items.length >= 2 ? (
          <div>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", alignItems: "end" }}>
              <label className="field" style={{ flex: 1 }}>
                <span>From Baseline</span>
                <select value={fromBaseline} onChange={e => setFromBaseline(e.target.value)}>
                  <option value="">Select baseline...</option>
                  {baselinesQuery.data.items.map((item, index) => (
                    <option key={buildBaselineKey(item, index)} value={item.ref}>
                      {item.ref} - {item.label || formatDate(item.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>To Baseline</span>
                <select value={toBaseline} onChange={e => setToBaseline(e.target.value)}>
                  <option value="">Select baseline...</option>
                  {baselinesQuery.data.items.map((item, index) => (
                    <option key={buildBaselineKey(item, index)} value={item.ref}>
                      {item.ref} - {item.label || formatDate(item.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => setShowComparison(true)}
                disabled={!fromBaseline || !toBaseline || fromBaseline === toBaseline}
              >
                Compare
              </button>
            </div>

            {showComparison && comparisonQuery.isLoading && <Spinner />}
            {showComparison && comparisonQuery.isError && <ErrorState message={(comparisonQuery.error as Error).message} />}
            {showComparison && comparisonQuery.data && (
              <div className="comparison-results">
                <h3>Comparison: {comparisonQuery.data.fromBaseline.ref} → {comparisonQuery.data.toBaseline.ref}</h3>

                <table className="data-table" style={{ marginTop: "1rem" }}>
                  <thead>
                    <tr>
                      <th>Entity Type</th>
                      <th>Added</th>
                      <th>Modified</th>
                      <th>Removed</th>
                      <th>Unchanged</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Requirements</strong></td>
                      <td style={{ color: (comparisonQuery.data.requirements?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.requirements?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.requirements?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.requirements?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.requirements?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.requirements?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.requirements?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Documents</td>
                      <td style={{ color: (comparisonQuery.data.documents?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.documents?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.documents?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.documents?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.documents?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.documents?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.documents?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Sections</td>
                      <td style={{ color: (comparisonQuery.data.documentSections?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.documentSections?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.documentSections?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.documentSections?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.documentSections?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.documentSections?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.documentSections?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Infos</td>
                      <td style={{ color: (comparisonQuery.data.infos?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.infos?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.infos?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.infos?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.infos?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.infos?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.infos?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Surrogates</td>
                      <td style={{ color: (comparisonQuery.data.surrogateReferences?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.surrogateReferences?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.surrogateReferences?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.surrogateReferences?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.surrogateReferences?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.surrogateReferences?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.surrogateReferences?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Trace Links</td>
                      <td style={{ color: (comparisonQuery.data.traceLinks?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.traceLinks?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.traceLinks?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.traceLinks?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.traceLinks?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.traceLinks?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.traceLinks?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Linksets</td>
                      <td style={{ color: (comparisonQuery.data.linksets?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.linksets?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.linksets?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.linksets?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.linksets?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.linksets?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.linksets?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Diagrams</td>
                      <td style={{ color: (comparisonQuery.data.diagrams?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.diagrams?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.diagrams?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.diagrams?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.diagrams?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.diagrams?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.diagrams?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Blocks</td>
                      <td style={{ color: (comparisonQuery.data.blocks?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.blocks?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.blocks?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.blocks?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.blocks?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.blocks?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.blocks?.unchanged?.length ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Connectors</td>
                      <td style={{ color: (comparisonQuery.data.connectors?.added?.length ?? 0) > 0 ? 'green' : 'inherit' }}>
                        {comparisonQuery.data.connectors?.added?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.connectors?.modified?.length ?? 0) > 0 ? 'orange' : 'inherit' }}>
                        {comparisonQuery.data.connectors?.modified?.length ?? 0}
                      </td>
                      <td style={{ color: (comparisonQuery.data.connectors?.removed?.length ?? 0) > 0 ? 'red' : 'inherit' }}>
                        {comparisonQuery.data.connectors?.removed?.length ?? 0}
                      </td>
                      <td>{comparisonQuery.data.connectors?.unchanged?.length ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p>At least two baselines are required for comparison.</p>
        )}
      </section>
    </div>
  );
}
