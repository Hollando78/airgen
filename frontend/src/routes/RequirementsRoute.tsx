import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { PageLayout } from "../components/layout/PageLayout";
import { PageHeader } from "../components/layout/PageHeader";
import { EmptyState } from "../components/ui/empty-state";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { FileText, RefreshCw, Copy, X } from "lucide-react";

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

  const graphDataQuery = useQuery({
    queryKey: ["graph-data", state.tenant, state.project],
    queryFn: () => api.getGraphData(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const detailQuery = useQuery({
    queryKey: ["requirement", state.tenant, state.project, selectedRef],
    queryFn: () => api.getRequirement(state.tenant ?? "", state.project ?? "", selectedRef ?? ""),
    enabled: Boolean(state.tenant && state.project && selectedRef)
  });

  // Extract only Requirement nodes (not Info or SurrogateReference)
  const items = useMemo(() => {
    const nodes = graphDataQuery.data?.nodes ?? [];
    return nodes
      .filter(n => n.type === 'Requirement')
      .map(n => ({
        ref: n.properties?.ref || n.label,
        title: n.properties?.text || '', // Use text as the title/description
        text: n.properties?.text || '',
        qaScore: n.properties?.qaScore,
        updatedAt: n.properties?.updatedAt,
        pattern: n.properties?.pattern,
        verification: n.properties?.verification,
        archived: n.properties?.archived
      }))
      .filter(r => !r.archived); // Exclude archived requirements
  }, [graphDataQuery.data]);

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
      <PageLayout
        title="Requirements"
        description="View and manage project requirements"
      >
        <EmptyState
          icon={FileText}
          title="No Project Selected"
          description="Select a tenant and project to view requirements."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Requirements"
      description={`${state.tenant} / ${state.project}`}
      breadcrumbs={[
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Requirements' }
      ]}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => graphDataQuery.refetch()}
          disabled={graphDataQuery.isFetching}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      }
    >
      <div className="mb-6 flex gap-3">
        <Input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search by ref, title, or text..."
          className="flex-1"
        />
      </div>

      {graphDataQuery.isLoading ? (
        <Spinner />
      ) : graphDataQuery.isError ? (
        <ErrorState message={(graphDataQuery.error as Error).message} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={search ? "No Matches Found" : "No Requirements"}
          description={search ? `No requirements match "${search}".` : "No requirements found in this project."}
        />
      ) : (
        <>
          <div className="mb-6">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Description</th>
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
          </div>

          {items.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              {search ? (
                <span>Showing {filtered.length} of {items.length} requirements</span>
              ) : (
                <span>Showing {items.length} requirement{items.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </>
      )}

      {selectedRef && (
        <div className="mt-8">
          <PageHeader
            title="Requirement Details"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRef(null)}
              >
                <X className="h-4 w-4" />
                Close
              </Button>
            }
          />

          {detailQuery.isLoading && <Spinner />}
          {detailQuery.isError && <ErrorState message={(detailQuery.error as Error).message} />}
          {detailQuery.data && (
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-1">{detailQuery.data.record.ref}</h3>
                    <p className="text-sm text-muted-foreground">{detailQuery.data.record.title}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(detailQuery.data.record.text)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Text
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(detailQuery.data.markdown)}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Markdown
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">PATTERN</div>
                  <div>{detailQuery.data.record.pattern ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">VERIFICATION</div>
                  <div>{detailQuery.data.record.verification ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">QA SCORE</div>
                  <div className="text-xl font-semibold" style={{
                    color: detailQuery.data.record.qaScore >= 90 ? '#22c55e' : detailQuery.data.record.qaScore >= 70 ? '#eab308' : '#ef4444'
                  }}>
                    {detailQuery.data.record.qaScore ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">VERDICT</div>
                  <div className="text-sm">{detailQuery.data.record.qaVerdict ?? "—"}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">REQUIREMENT TEXT</h4>
                <p className="m-0 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg leading-relaxed">
                  {detailQuery.data.record.text}
                </p>
              </div>

              {detailQuery.data.record.suggestions && detailQuery.data.record.suggestions.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">SUGGESTIONS</h4>
                  <ul className="m-0 p-4 pl-8 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                    {detailQuery.data.record.suggestions.map((suggestion, index) => (
                      <li key={index} className="mb-2">{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}

              {detailQuery.data.record.tags && detailQuery.data.record.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">TAGS</h4>
                  <div className="flex gap-2 flex-wrap">
                    {detailQuery.data.record.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <strong>Created:</strong> {formatDate(detailQuery.data.record.createdAt)}
                </div>
                <div>
                  <strong>Updated:</strong> {formatDate(detailQuery.data.record.updatedAt)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
