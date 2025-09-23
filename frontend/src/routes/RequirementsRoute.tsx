import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
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

  const items = requirementsQuery.data?.items ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
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
        <h1>Requirements</h1>
        <p>Select a tenant and project to view requirements.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h1>Requirements</h1>
          <p>
            {state.tenant} / {state.project}
          </p>
        </div>
      </div>

      <div className="requirements-layout">
        <div className="requirements-list">
          <div className="list-toolbar">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search by ref, title, or text"
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
            <p className="hint">No requirements match the current filter.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Title</th>
                  <th>QA</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr
                    key={item.ref}
                    onClick={() => handleRowClick(item.ref)}
                    className={item.ref === selectedRef ? "row-active" : undefined}
                  >
                    <td>{item.ref}</td>
                    <td>{item.title}</td>
                    <td>{item.qaScore ?? "—"}</td>
                    <td>{formatDate(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="requirements-detail">
          {!selectedRef && <p>Select a requirement to inspect details.</p>}
          {detailQuery.isLoading && <Spinner />}
          {detailQuery.isError && <ErrorState message={(detailQuery.error as Error).message} />}
          {detailQuery.data && (
            <div className="detail-card">
              <header>
                <h2>{detailQuery.data.record.ref}</h2>
                <p>{detailQuery.data.record.title}</p>
              </header>
              <div className="detail-meta">
                <p>
                  <strong>Pattern:</strong> {detailQuery.data.record.pattern ?? "—"}
                </p>
                <p>
                  <strong>Verification:</strong> {detailQuery.data.record.verification ?? "—"}
                </p>
                <p>
                  <strong>QA Score:</strong> {detailQuery.data.record.qaScore ?? "—"}
                </p>
                <p>
                  <strong>QA Verdict:</strong> {detailQuery.data.record.qaVerdict ?? "—"}
                </p>
                <p>
                  <strong>Created:</strong> {formatDate(detailQuery.data.record.createdAt)}
                </p>
                <p>
                  <strong>Updated:</strong> {formatDate(detailQuery.data.record.updatedAt)}
                </p>
                {detailQuery.data.record.tags && detailQuery.data.record.tags.length > 0 && (
                  <p>
                    <strong>Tags:</strong> {detailQuery.data.record.tags.join(", ")}
                  </p>
                )}
              </div>
              <div className="detail-actions">
                <button type="button" onClick={() => handleCopy(detailQuery.data.record.text)}>
                  Copy text
                </button>
                <button type="button" onClick={() => handleCopy(detailQuery.data.markdown)}>
                  Copy Markdown
                </button>
              </div>
              <section className="detail-section">
                <h3>Requirement text</h3>
                <p className="detail-text">{detailQuery.data.record.text}</p>
              </section>
              <section className="detail-section">
                <h3>Markdown</h3>
                <pre className="markdown-view">{detailQuery.data.markdown}</pre>
              </section>
              {detailQuery.data.record.suggestions && detailQuery.data.record.suggestions.length > 0 && (
                <section className="detail-section">
                  <h3>Suggestions</h3>
                  <ul>
                    {detailQuery.data.record.suggestions.map((suggestion, index) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
