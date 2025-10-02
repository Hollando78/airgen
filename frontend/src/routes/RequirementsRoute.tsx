import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";

function formatDate(value: string | null | undefined): string {
  if (!value) {return "—";}
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

export function RequirementsRoute(): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();

  const [search, setSearch] = useState("");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);

  const requirementsQuery = useQuery({
    queryKey: ["requirements", state.tenant, state.project],
    queryFn: () => api.listRequirements(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const detailQuery = useQuery({
    queryKey: ["requirement", state.tenant, state.project, selectedRef],
    queryFn: () => api.getRequirement(state.tenant ?? "", state.project ?? "", selectedRef ?? ""),
    enabled: Boolean(state.tenant && state.project && selectedRef)
  });

  const items = requirementsQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) {return items;}
    const needle = search.toLowerCase();
    return items.filter(item =>
      item.ref.toLowerCase().includes(needle) ||
      item.title.toLowerCase().includes(needle) ||
      item.text.toLowerCase().includes(needle)
    );
  }, [items, search]);

  const handleRowClick = (ref: string) => {
    setSelectedRef(ref);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      // ignore copy failure
    }
  };

  if (!state.tenant || !state.project) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h1>Requirements</h1>
          <p>Select a tenant and project to view requirements.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Requirements</h1>
            <p>{state.tenant} / {state.project}</p>
          </div>
        </div>

        <div style={{
          padding: '1rem',
          margin: '0 1rem 1rem',
          display: 'flex',
          gap: '0.5rem',
          border: '1px solid var(--border-color)',
          borderRadius: '0.5rem',
          backgroundColor: 'var(--bg-secondary)'
        }}>
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search by ref, title, or text..."
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              backgroundColor: '#ffffff',
              color: '#1f2937'
            }}
          />
          <button type="button" onClick={() => requirementsQuery.refetch()}>
            Refresh
          </button>
        </div>

        {requirementsQuery.isLoading ? (
          <Spinner />
        ) : requirementsQuery.isError ? (
          <ErrorState message={(requirementsQuery.error as Error).message} />
        ) : filtered.length === 0 ? (
          <p className="hint">
            {search ? `No requirements match "${search}".` : "No requirements found."}
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Title</th>
                <th>QA Score</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.ref}
                  onClick={() => handleRowClick(item.ref)}
                  className={item.ref === selectedRef ? "row-active" : undefined}
                  style={{ cursor: 'pointer' }}
                >
                  <td><strong>{item.ref}</strong></td>
                  <td>{item.title}</td>
                  <td>
                    <span style={{
                      color: item.qaScore >= 90 ? '#22c55e' : item.qaScore >= 70 ? '#eab308' : '#ef4444',
                      fontWeight: 600
                    }}>
                      {item.qaScore ?? "—"}
                    </span>
                  </td>
                  <td>{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {requirementsQuery.data?.meta && (
          <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Showing {filtered.length} of {requirementsQuery.data.meta.totalItems} requirements
            {requirementsQuery.data.meta.totalPages > 1 && (
              <span> (Page {requirementsQuery.data.meta.currentPage} of {requirementsQuery.data.meta.totalPages})</span>
            )}
          </div>
        )}
      </section>

      {selectedRef && (
        <section className="panel">
          <div className="panel-header">
            <h2>Requirement Details</h2>
            <button type="button" onClick={() => setSelectedRef(null)} className="ghost-button">
              Close
            </button>
          </div>

          {detailQuery.isLoading && <Spinner />}
          {detailQuery.isError && <ErrorState message={(detailQuery.error as Error).message} />}
          {detailQuery.data && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{detailQuery.data.record.ref}</h3>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)' }}>{detailQuery.data.record.title}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" onClick={() => handleCopy(detailQuery.data.record.text)}>
                      Copy Text
                    </button>
                    <button type="button" onClick={() => handleCopy(detailQuery.data.markdown)}>
                      Copy Markdown
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>PATTERN</div>
                  <div>{detailQuery.data.record.pattern ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>VERIFICATION</div>
                  <div>{detailQuery.data.record.verification ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>QA SCORE</div>
                  <div style={{
                    color: detailQuery.data.record.qaScore >= 90 ? '#22c55e' : detailQuery.data.record.qaScore >= 70 ? '#eab308' : '#ef4444',
                    fontWeight: 600,
                    fontSize: '1.25rem'
                  }}>
                    {detailQuery.data.record.qaScore ?? "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>VERDICT</div>
                  <div style={{ fontSize: '0.875rem' }}>{detailQuery.data.record.qaVerdict ?? "—"}</div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>REQUIREMENT TEXT</h4>
                <p style={{
                  margin: 0,
                  padding: '1rem',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '0.5rem',
                  lineHeight: 1.6
                }}>
                  {detailQuery.data.record.text}
                </p>
              </div>

              {detailQuery.data.record.suggestions && detailQuery.data.record.suggestions.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>SUGGESTIONS</h4>
                  <ul style={{
                    margin: 0,
                    padding: '1rem 1rem 1rem 2rem',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '0.5rem'
                  }}>
                    {detailQuery.data.record.suggestions.map((suggestion, index) => (
                      <li key={index} style={{ marginBottom: '0.5rem' }}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {detailQuery.data.record.tags && detailQuery.data.record.tags.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>TAGS</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {detailQuery.data.record.tags.map((tag, index) => (
                      <span
                        key={index}
                        style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: 'var(--bg-tertiary)',
                          borderRadius: '1rem',
                          fontSize: '0.875rem'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                <div>
                  <strong>Created:</strong> {formatDate(detailQuery.data.record.createdAt)}
                </div>
                <div>
                  <strong>Updated:</strong> {formatDate(detailQuery.data.record.updatedAt)}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
