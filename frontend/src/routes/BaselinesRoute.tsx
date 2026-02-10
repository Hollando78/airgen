import type { FormEvent} from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { PageLayout } from "../components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { EmptyState } from "../components/ui/empty-state";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { GitBranch, GitCompare, ChevronDown, ChevronRight, Trash2, Eye, X } from "lucide-react";

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

/** Extract a display name from a version record */
function getEntityDisplayName(entity: Record<string, any>): string {
  return entity.text || entity.name || entity.label || entity.title || entity.ref || entity.requirementId || entity.documentId || entity.sectionId || entity.blockId || entity.diagramId || entity.connectorId || entity.versionId || "—";
}

/** Truncate text for table display */
function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

type ComparisonCategory = "added" | "modified" | "removed" | "unchanged";

/** Expandable section for comparison entity lists */
function ComparisonEntitySection({ label, category, entities }: {
  label: string;
  category: ComparisonCategory;
  entities: Record<string, any>[];
}) {
  const [expanded, setExpanded] = useState(false);
  const count = entities.length;
  if (count === 0) return null;

  const colorClass = category === "added" ? "text-green-600 dark:text-green-400"
    : category === "removed" ? "text-red-600 dark:text-red-400"
    : category === "modified" ? "text-amber-600 dark:text-amber-400"
    : "text-muted-foreground";

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className={colorClass}>{label} ({count})</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name / Text</TableHead>
                <TableHead>Content Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entities.map((entity, i) => (
                <TableRow key={entity.versionId || i}>
                  <TableCell className="text-sm">{truncate(getEntityDisplayName(entity))}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{entity.contentHash ? entity.contentHash.slice(0, 12) + "..." : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Comparison detail for a single entity type */
function ComparisonTypeDetail({ typeName, data }: {
  typeName: string;
  data: { added?: any[]; modified?: any[]; removed?: any[]; unchanged?: any[] } | undefined;
}) {
  if (!data) return null;
  const added = data.added ?? [];
  const modified = data.modified ?? [];
  const removed = data.removed ?? [];
  const unchanged = data.unchanged ?? [];
  const total = added.length + modified.length + removed.length + unchanged.length;
  if (total === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className="text-sm font-semibold">{typeName}</h4>
      <ComparisonEntitySection label="Added" category="added" entities={added} />
      <ComparisonEntitySection label="Modified" category="modified" entities={modified} />
      <ComparisonEntitySection label="Removed" category="removed" entities={removed} />
      <ComparisonEntitySection label="Unchanged" category="unchanged" entities={unchanged} />
    </div>
  );
}

/** Baseline detail drawer */
function BaselineDetailPanel({ tenant, project, baselineRef, baseline, onClose }: {
  tenant: string;
  project: string;
  baselineRef: string;
  baseline: BaselineRecord;
  onClose: () => void;
}) {
  const api = useApiClient();
  const detailQuery = useQuery({
    queryKey: ["baseline-detail", tenant, project, baselineRef],
    queryFn: () => api.getBaselineDetails(tenant, project, baselineRef),
  });

  const versionTypes = [
    { key: "requirementVersions", label: "Requirements" },
    { key: "documentVersions", label: "Documents" },
    { key: "documentSectionVersions", label: "Sections" },
    { key: "infoVersions", label: "Infos" },
    { key: "surrogateReferenceVersions", label: "Surrogates" },
    { key: "traceLinkVersions", label: "Trace Links" },
    { key: "linksetVersions", label: "Linksets" },
    { key: "diagramVersions", label: "Diagrams" },
    { key: "blockVersions", label: "Blocks" },
    { key: "connectorVersions", label: "Connectors" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Baseline: {baseline.ref}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {baseline.label ? `${baseline.label} — ` : ""}{formatDate(baseline.createdAt)}{baseline.author ? ` by ${baseline.author}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {detailQuery.isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : detailQuery.isError ? (
          <ErrorState message={(detailQuery.error as Error).message} />
        ) : detailQuery.data ? (
          <div className="space-y-4">
            {versionTypes.map(({ key, label }) => {
              const versions = (detailQuery.data as Record<string, any>)[key] as any[] | undefined;
              if (!versions || versions.length === 0) return null;
              return (
                <VersionTypeSection key={key} label={label} versions={versions} />
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Expandable section for a version type in the detail view */
function VersionTypeSection({ label, versions }: { label: string; versions: any[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span>{label} ({versions.length})</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name / Text</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v, i) => (
                <TableRow key={v.versionId || i}>
                  <TableCell className="text-sm">{truncate(getEntityDisplayName(v))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">v{v.versionNumber ?? "?"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{v.contentHash ? v.contentHash.slice(0, 12) + "..." : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
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
  const [selectedBaseline, setSelectedBaseline] = useState<BaselineRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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

  const deleteBaselineMutation = useMutation({
    mutationFn: async (baselineRef: string) => {
      if (!state.tenant || !state.project) {
        throw new Error("Select a tenant and project first.");
      }
      return api.deleteBaseline(state.tenant, state.project, baselineRef);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["baselines", state.tenant, state.project] });
      setDeleteConfirm(null);
      if (selectedBaseline?.ref === deleteConfirm) setSelectedBaseline(null);
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
      <PageLayout
        title="Baselines"
        description="Select a tenant and project to manage baselines."
      >
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={GitBranch}
              title="No Project Selected"
              description="Select a tenant and project to manage baselines."
            />
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Baselines"
      description={`${state.tenant} / ${state.project}`}
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Baseline</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Label"
                  htmlFor="label"
                  hint="Optional: e.g., Release 1.0"
                >
                  <Input
                    id="label"
                    value={label}
                    onChange={event => setLabel(event.target.value)}
                    placeholder="Release 1.0"
                  />
                </FormField>
                <FormField
                  label="Author"
                  htmlFor="author"
                  hint="Optional"
                >
                  <Input
                    id="author"
                    value={author}
                    onChange={event => setAuthor(event.target.value)}
                    placeholder="Jane Doe"
                  />
                </FormField>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="submit" disabled={createBaselineMutation.isPending}>
                  {createBaselineMutation.isPending ? "Creating..." : "Create Baseline"}
                </Button>
              </div>
            </form>
            {createBaselineMutation.isError && (
              <div className="mt-4">
                <ErrorState message={(createBaselineMutation.error as Error).message} />
              </div>
            )}
            {createBaselineMutation.isSuccess && (
              <div className="mt-4 p-3 bg-success/10 border border-success/20 rounded-md text-sm text-success">
                Baseline {createBaselineMutation.data.ref} created successfully.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Baseline History</CardTitle>
          </CardHeader>
          <CardContent>
            {baselinesQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : baselinesQuery.isError ? (
              <ErrorState message={(baselinesQuery.error as Error).message} />
            ) : baselinesQuery.data?.items.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2}>Ref</TableHead>
                      <TableHead rowSpan={2}>Created</TableHead>
                      <TableHead rowSpan={2}>Author</TableHead>
                      <TableHead rowSpan={2}>Label</TableHead>
                      <TableHead colSpan={10} className="text-center border-b">Version Snapshot Counts</TableHead>
                      <TableHead rowSpan={2}>Actions</TableHead>
                    </TableRow>
                    <TableRow>
                      <TableHead>Req</TableHead>
                      <TableHead>Doc</TableHead>
                      <TableHead>Sec</TableHead>
                      <TableHead>Info</TableHead>
                      <TableHead>Sur</TableHead>
                      <TableHead>Link</TableHead>
                      <TableHead>LSet</TableHead>
                      <TableHead>Diag</TableHead>
                      <TableHead>Blk</TableHead>
                      <TableHead>Conn</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {baselinesQuery.data.items.map((item, index) => (
                      <TableRow
                        key={buildBaselineKey(item, index)}
                        className={selectedBaseline?.ref === item.ref ? "bg-muted/50" : "cursor-pointer hover:bg-muted/30"}
                        onClick={() => setSelectedBaseline(selectedBaseline?.ref === item.ref ? null : item)}
                      >
                        <TableCell className="font-semibold">{item.ref}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                        <TableCell>{item.author ?? "—"}</TableCell>
                        <TableCell>{item.label ?? "—"}</TableCell>
                        <TableCell className="text-center">{item.requirementVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.documentVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.documentSectionVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.infoVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.surrogateVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.traceLinkVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.linksetVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.diagramVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.blockVersionCount ?? 0}</TableCell>
                        <TableCell className="text-center">{item.connectorVersionCount ?? 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View details"
                              onClick={() => setSelectedBaseline(selectedBaseline?.ref === item.ref ? null : item)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {deleteConfirm === item.ref ? (
                              <div className="flex gap-1 items-center">
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={deleteBaselineMutation.isPending}
                                  onClick={() => deleteBaselineMutation.mutate(item.ref)}
                                >
                                  {deleteBaselineMutation.isPending ? "..." : "Confirm"}
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Delete baseline"
                                onClick={() => setDeleteConfirm(item.ref)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                icon={GitBranch}
                title="No baselines yet"
                description="Create your first baseline using the form above."
              />
            )}
            {deleteBaselineMutation.isError && (
              <div className="mt-4">
                <ErrorState message={(deleteBaselineMutation.error as Error).message} />
              </div>
            )}
          </CardContent>
        </Card>

        {selectedBaseline && state.tenant && state.project && (
          <BaselineDetailPanel
            tenant={state.tenant}
            project={state.project}
            baselineRef={selectedBaseline.ref}
            baseline={selectedBaseline}
            onClose={() => setSelectedBaseline(null)}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Compare Baselines</CardTitle>
          </CardHeader>
          <CardContent>
            {baselinesQuery.data?.items.length && baselinesQuery.data.items.length >= 2 ? (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <FormField label="From Baseline" htmlFor="from-baseline" className="flex-1">
                    <select
                      id="from-baseline"
                      value={fromBaseline}
                      onChange={e => setFromBaseline(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select baseline...</option>
                      {baselinesQuery.data.items.map((item, index) => (
                        <option key={buildBaselineKey(item, index)} value={item.ref}>
                          {item.ref} - {item.label || formatDate(item.createdAt)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="To Baseline" htmlFor="to-baseline" className="flex-1">
                    <select
                      id="to-baseline"
                      value={toBaseline}
                      onChange={e => setToBaseline(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select baseline...</option>
                      {baselinesQuery.data.items.map((item, index) => (
                        <option key={buildBaselineKey(item, index)} value={item.ref}>
                          {item.ref} - {item.label || formatDate(item.createdAt)}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      onClick={() => setShowComparison(true)}
                      disabled={!fromBaseline || !toBaseline || fromBaseline === toBaseline}
                    >
                      <GitCompare className="h-4 w-4 mr-2" />
                      Compare
                    </Button>
                  </div>
                </div>

                {showComparison && comparisonQuery.isLoading && (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                )}
                {showComparison && comparisonQuery.isError && (
                  <ErrorState message={(comparisonQuery.error as Error).message} />
                )}
                {showComparison && comparisonQuery.data && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Comparison: {comparisonQuery.data.fromBaseline.ref} → {comparisonQuery.data.toBaseline.ref}
                    </h3>

                    {/* Summary table */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Entity Type</TableHead>
                            <TableHead className="text-center">Added</TableHead>
                            <TableHead className="text-center">Modified</TableHead>
                            <TableHead className="text-center">Removed</TableHead>
                            <TableHead className="text-center">Unchanged</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[
                            { label: "Requirements", key: "requirements" },
                            { label: "Documents", key: "documents" },
                            { label: "Sections", key: "documentSections" },
                            { label: "Infos", key: "infos" },
                            { label: "Surrogates", key: "surrogateReferences" },
                            { label: "Trace Links", key: "traceLinks" },
                            { label: "Linksets", key: "linksets" },
                            { label: "Diagrams", key: "diagrams" },
                            { label: "Blocks", key: "blocks" },
                            { label: "Connectors", key: "connectors" },
                          ].map(({ label: rowLabel, key }) => {
                            const d = (comparisonQuery.data as Record<string, any>)[key] as { added?: any[]; modified?: any[]; removed?: any[]; unchanged?: any[] } | undefined;
                            if (!d) return null;
                            return (
                              <TableRow key={key}>
                                <TableCell className="font-semibold">{rowLabel}</TableCell>
                                <TableCell className={`text-center ${(d.added?.length ?? 0) > 0 ? 'text-green-600 dark:text-green-400 font-medium' : ''}`}>
                                  {d.added?.length ?? 0}
                                </TableCell>
                                <TableCell className={`text-center ${(d.modified?.length ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}>
                                  {d.modified?.length ?? 0}
                                </TableCell>
                                <TableCell className={`text-center ${(d.removed?.length ?? 0) > 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}`}>
                                  {d.removed?.length ?? 0}
                                </TableCell>
                                <TableCell className="text-center">{d.unchanged?.length ?? 0}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Detailed expandable sections */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Details</h4>
                      {[
                        { label: "Requirements", key: "requirements" },
                        { label: "Documents", key: "documents" },
                        { label: "Sections", key: "documentSections" },
                        { label: "Infos", key: "infos" },
                        { label: "Surrogates", key: "surrogateReferences" },
                        { label: "Trace Links", key: "traceLinks" },
                        { label: "Linksets", key: "linksets" },
                        { label: "Diagrams", key: "diagrams" },
                        { label: "Blocks", key: "blocks" },
                        { label: "Connectors", key: "connectors" },
                      ].map(({ label: typeLabel, key }) => (
                        <ComparisonTypeDetail
                          key={key}
                          typeName={typeLabel}
                          data={(comparisonQuery.data as Record<string, any>)[key]}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={GitCompare}
                title="Not enough baselines"
                description="At least two baselines are required for comparison."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
