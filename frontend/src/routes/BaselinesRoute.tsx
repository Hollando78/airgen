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
import { GitBranch, GitCompare } from "lucide-react";

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
                      <TableRow key={buildBaselineKey(item, index)}>
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
          </CardContent>
        </Card>

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
                          <TableRow>
                            <TableCell className="font-semibold">Requirements</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.requirements?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.requirements?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.requirements?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.requirements?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.requirements?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.requirements?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.requirements?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Documents</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.documents?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.documents?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.documents?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.documents?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.documents?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.documents?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.documents?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Sections</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.documentSections?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.documentSections?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.documentSections?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.documentSections?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.documentSections?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.documentSections?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.documentSections?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Infos</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.infos?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.infos?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.infos?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.infos?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.infos?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.infos?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.infos?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Surrogates</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.surrogateReferences?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.surrogateReferences?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.surrogateReferences?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.surrogateReferences?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.surrogateReferences?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.surrogateReferences?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.surrogateReferences?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Trace Links</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.traceLinks?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.traceLinks?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.traceLinks?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.traceLinks?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.traceLinks?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.traceLinks?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.traceLinks?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Linksets</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.linksets?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.linksets?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.linksets?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.linksets?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.linksets?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.linksets?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.linksets?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Diagrams</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.diagrams?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.diagrams?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.diagrams?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.diagrams?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.diagrams?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.diagrams?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.diagrams?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Blocks</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.blocks?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.blocks?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.blocks?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.blocks?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.blocks?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.blocks?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.blocks?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Connectors</TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.connectors?.added?.length ?? 0) > 0 ? 'text-success font-medium' : ''}`}>
                              {comparisonQuery.data.connectors?.added?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.connectors?.modified?.length ?? 0) > 0 ? 'text-warning font-medium' : ''}`}>
                              {comparisonQuery.data.connectors?.modified?.length ?? 0}
                            </TableCell>
                            <TableCell className={`text-center ${(comparisonQuery.data.connectors?.removed?.length ?? 0) > 0 ? 'text-error font-medium' : ''}`}>
                              {comparisonQuery.data.connectors?.removed?.length ?? 0}
                            </TableCell>
                            <TableCell className="text-center">{comparisonQuery.data.connectors?.unchanged?.length ?? 0}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
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
