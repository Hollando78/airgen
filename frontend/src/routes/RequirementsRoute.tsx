import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { PageLayout } from "../components/layout/PageLayout";
import { EmptyState } from "../components/ui/empty-state";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { FileText, RefreshCw, Copy, ChevronRight } from "lucide-react";

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

  const qaScore = detailQuery.data?.record.qaScore;
  const qaScoreColor = typeof qaScore === "number"
    ? (qaScore >= 90 ? '#22c55e' : qaScore >= 70 ? '#eab308' : '#ef4444')
    : '#64748b';
  const qaScoreDisplay = typeof qaScore === "number" ? qaScore : "—";

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
      {graphDataQuery.isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : graphDataQuery.isError ? (
        <ErrorState message={(graphDataQuery.error as Error).message} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ height: 'calc(100vh - 16rem)' }}>
          {/* Left Panel - Requirements List */}
          <div className="flex flex-col gap-4 overflow-hidden h-full">
            <div className="flex flex-col gap-3">
              <Input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search by ref, title, or text..."
              />
              <div className="text-sm text-muted-foreground">
                {search ? (
                  <span>Showing {filtered.length} of {items.length} requirements</span>
                ) : (
                  <span>{items.length} requirement{items.length !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={FileText}
                title={search ? "No Matches Found" : "No Requirements"}
                description={search ? `No requirements match "${search}".` : "No requirements found in this project."}
              />
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto border rounded-lg">
                <div className="divide-y">
                  {filtered.map(item => (
                    <div
                      key={item.ref}
                      onClick={() => handleRowClick(item.ref)}
                      className={`p-4 cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                        item.ref === selectedRef ? 'bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{item.ref}</span>
                            {item.qaScore !== undefined && (
                              <span
                                className="text-xs font-semibold px-2 py-0.5 rounded"
                                style={{
                                  backgroundColor: item.qaScore >= 90 ? '#dcfce7' : item.qaScore >= 70 ? '#fef3c7' : '#fee2e2',
                                  color: item.qaScore >= 90 ? '#166534' : item.qaScore >= 70 ? '#92400e' : '#991b1b'
                                }}
                              >
                                {item.qaScore}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {item.title}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Requirement Details */}
          <div className="flex flex-col overflow-hidden h-full">
            {!selectedRef ? (
              <div className="h-full flex items-center justify-center border rounded-lg bg-neutral-50 dark:bg-neutral-900">
                <EmptyState
                  icon={FileText}
                  title="No Requirement Selected"
                  description="Select a requirement from the list to view its details."
                />
              </div>
            ) : detailQuery.isLoading ? (
              <div className="h-full flex items-center justify-center border rounded-lg">
                <Spinner />
              </div>
            ) : detailQuery.isError ? (
              <div className="h-full border rounded-lg p-4">
                <ErrorState message={(detailQuery.error as Error).message} />
              </div>
            ) : detailQuery.data ? (
              <div className="h-full overflow-y-auto border rounded-lg">
                <div className="p-6 space-y-6">
                  {/* Header */}
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-semibold mb-1">{detailQuery.data.record.ref}</h3>
                        <p className="text-sm text-muted-foreground">{detailQuery.data.record.title}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(detailQuery.data.record.text)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Text
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(detailQuery.data.markdown)}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Markdown
                      </Button>
                    </div>
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">PATTERN</div>
                      <div className="text-sm">{detailQuery.data.record.pattern ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">VERIFICATION</div>
                      <div className="text-sm">{detailQuery.data.record.verification ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">QA SCORE</div>
                      <div className="text-xl font-semibold" style={{ color: qaScoreColor }}>
                        {qaScoreDisplay}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">VERDICT</div>
                      <div className="text-sm">{detailQuery.data.record.qaVerdict ?? "—"}</div>
                    </div>
                  </div>

                  {/* Requirement Text */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">REQUIREMENT TEXT</h4>
                    <p className="m-0 p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg leading-relaxed text-sm">
                      {detailQuery.data.record.text}
                    </p>
                  </div>

                  {/* Suggestions */}
                  {detailQuery.data.record.suggestions && detailQuery.data.record.suggestions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2">SUGGESTIONS</h4>
                      <ul className="m-0 p-4 pl-8 bg-neutral-50 dark:bg-neutral-900 rounded-lg space-y-2 text-sm">
                        {detailQuery.data.record.suggestions.map((suggestion, index) => (
                          <li key={index}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Tags */}
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

                  {/* Timestamps */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t text-sm text-muted-foreground">
                    <div>
                      <strong>Created:</strong> {formatDate(detailQuery.data.record.createdAt)}
                    </div>
                    <div>
                      <strong>Updated:</strong> {formatDate(detailQuery.data.record.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </PageLayout>
  );
}
