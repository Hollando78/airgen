import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../lib/client";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { useUserRole } from "../hooks/useUserRole";
import { useAuth } from "../contexts/AuthContext";
import type {
  SemanticSearchRequest,
  SimilarRequirement,
  EmbeddingWorkerStatus
} from "../types";

export function AskAirGenRoute(): JSX.Element {
  const { tenant, project } = useTenantProjectDocument();
  const api = useApiClient();
  const { isSuperAdmin, isAdmin } = useUserRole();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [minSimilarity, setMinSimilarity] = useState(0.6);
  const [limit, setLimit] = useState(20);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const [similarRequirementId, setSimilarRequirementId] = useState("");
  const [similarThreshold, setSimilarThreshold] = useState(0.7);
  const [similarLimit, setSimilarLimit] = useState(10);
  const [duplicateRequirementId, setDuplicateRequirementId] = useState("");

  const [similarResults, setSimilarResults] = useState<SimilarRequirement[]>([]);
  const [duplicateResults, setDuplicateResults] = useState<SimilarRequirement[]>([]);

  const searchMutation = useMutation({
    mutationFn: async (input: SemanticSearchRequest) => api.searchRequirementsSemantic(input),
    onError: error => {
      const message = error instanceof Error ? error.message : "Search failed";
      toast.error(message);
    }
  });

  const similarRequirementsMutation = useMutation({
    mutationFn: async (input: { requirementId: string; threshold: number; limit: number }) => {
      if (!tenant || !project) {
        throw new Error("Select a tenant and project to run similarity search.");
      }
      return api.getSimilarRequirements(
        tenant,
        project,
        input.requirementId,
        input.threshold,
        input.limit
      );
    },
    onSuccess: data => {
      setSimilarResults(data.similar);
      if (data.similar.length === 0) {
        toast.info("No similar requirements found at this threshold.");
      } else {
        toast.success(`Found ${data.similar.length} matching requirement${data.similar.length === 1 ? "" : "s"}.`);
      }
    },
    onError: error => {
      const message = error instanceof Error ? error.message : "Failed to find similar requirements";
      toast.error(message);
    }
  });

  const duplicatesMutation = useMutation({
    mutationFn: async (requirementId: string) => {
      if (!tenant || !project) {
        throw new Error("Select a tenant and project to look for duplicates.");
      }
      return api.getPotentialDuplicates(tenant, project, requirementId);
    },
    onSuccess: data => {
      setDuplicateResults(data.duplicates);
      if (data.duplicates.length === 0) {
        toast.info("No potential duplicates detected.");
      } else {
        toast.success(`Found ${data.duplicates.length} potential duplicate${data.duplicates.length === 1 ? "" : "s"}.`);
      }
    },
    onError: error => {
      const message = error instanceof Error ? error.message : "Failed to check for duplicates";
      toast.error(message);
    }
  });

  const canManageEmbeddings = useMemo(() => {
    if (!tenant || !project) {
      return false;
    }

    if (isSuperAdmin()) {
      return true;
    }

    const legacyRoles = user?.roles ?? [];
    if (legacyRoles.includes("super_admin") || legacyRoles.includes("super-admin")) {
      return true;
    }

    return isAdmin(tenant, project);
  }, [tenant, project, isSuperAdmin, isAdmin, user?.roles]);

  const embeddingStatusQuery = useQuery({
    queryKey: ["embedding-worker-status"],
    queryFn: api.getEmbeddingWorkerStatus,
    enabled: canManageEmbeddings,
    refetchInterval: canManageEmbeddings ? 10_000 : false
  });

  const startEmbeddingMutation = useMutation({
    mutationFn: async (operation: "backfill" | "reembed-all") => {
      if (!tenant || !project) {
        throw new Error("Select a tenant and project to manage embeddings.");
      }
      return api.startEmbeddingWorker(tenant, project, operation);
    },
    onSuccess: data => {
      toast.success(data.message ?? "Embedding worker started.");
      embeddingStatusQuery.refetch();
    },
    onError: error => {
      const message = error instanceof Error ? error.message : "Failed to start embedding worker";
      toast.error(message);
    }
  });

  const stopEmbeddingMutation = useMutation({
    mutationFn: async () => api.stopEmbeddingWorker(),
    onSuccess: data => {
      toast.success(data.message ?? "Embedding worker stopped.");
      embeddingStatusQuery.refetch();
    },
    onError: error => {
      const message = error instanceof Error ? error.message : "Failed to stop embedding worker";
      toast.error(message);
    }
  });

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!tenant || !project) {
      toast.error("Select a tenant and project to ask AIRGen.");
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      toast.error("Enter a question, keyword, or requirement fragment.");
      return;
    }

    const boundedSimilarity = Math.min(Math.max(minSimilarity, 0), 1);
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;

    setHasSubmitted(true);

    searchMutation.mutate({
      tenant,
      project,
      query: trimmedQuery,
      minSimilarity: boundedSimilarity,
      limit: safeLimit
    });
  }, [tenant, project, query, minSimilarity, limit, searchMutation]);

  const handleSimilarSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!similarRequirementId.trim()) {
      toast.error("Enter a requirement ID or reference to compare.");
      return;
    }

    const bounded = Math.min(Math.max(similarThreshold, 0), 1);
    const safeLimit = Number.isFinite(similarLimit) && similarLimit > 0 ? Math.min(Math.floor(similarLimit), 100) : 10;

    similarRequirementsMutation.mutate({
      requirementId: similarRequirementId.trim(),
      threshold: bounded,
      limit: safeLimit
    });
  }, [similarRequirementId, similarThreshold, similarLimit, similarRequirementsMutation]);

  const handleDuplicateSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!duplicateRequirementId.trim()) {
      toast.error("Enter a requirement ID to evaluate duplicates.");
      return;
    }

    duplicatesMutation.mutate(duplicateRequirementId.trim());
  }, [duplicateRequirementId, duplicatesMutation]);

  const queryResults = useMemo<SimilarRequirement[]>(() => {
    return searchMutation.data?.results ?? [];
  }, [searchMutation.data?.results]);

  const embeddingStatus: EmbeddingWorkerStatus | undefined = embeddingStatusQuery.data;

  if (!tenant || !project) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Ask AIRGen</h1>
          <p className="text-gray-600">
            Select a tenant and project to explore semantic matches, related requirements, and duplicate candidates.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">Ask AIRGen</h1>
        <p className="text-gray-600">
          Search semantically across requirements, understand related work, and manage the embeddings that power AIRGen’s semantic intelligence.
        </p>
      </header>

      <section className="bg-white border rounded-lg shadow-sm p-6 space-y-5">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">Semantic Question</h2>
          <p className="text-sm text-gray-600">
            Ask in plain language—AIRGen translates your intent into vector search and brings back the closest requirements.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="ask-airgen-query" className="block text-sm font-medium text-gray-700">
              What would you like to find?
            </label>
            <textarea
              id="ask-airgen-query"
              value={query}
              onChange={event => setQuery(event.target.value)}
              rows={4}
              className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="e.g., requirements that describe avionics power management, or duplicates of REQ-145..."
              disabled={searchMutation.isPending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">
                Minimum similarity threshold <span className="text-gray-500">(0.0 – 1.0)</span>
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minSimilarity}
                  onChange={event => setMinSimilarity(Number(event.target.value))}
                  className="flex-1"
                  disabled={searchMutation.isPending}
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={minSimilarity}
                  onChange={event => setMinSimilarity(Number(event.target.value))}
                  className="w-20 border rounded px-2 py-1 text-sm"
                  disabled={searchMutation.isPending}
                />
              </div>
              <p className="text-xs text-gray-500">
                Increase the threshold to focus on higher-confidence matches.
              </p>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Maximum returned requirements</span>
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={event => setLimit(Number(event.target.value))}
                className="border rounded px-3 py-2 text-sm w-full"
                disabled={searchMutation.isPending}
              />
              <p className="text-xs text-gray-500">
                Limit the number of results to review. Capped at 100 per search.
              </p>
            </label>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-gray-500">
              Searching in <span className="font-medium text-gray-700">{tenant}</span> /{" "}
              <span className="font-medium text-gray-700">{project}</span>
            </div>
            <button
              type="submit"
              disabled={searchMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed font-medium"
            >
              {searchMutation.isPending ? "Searching…" : "Ask AIRGen"}
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {queryResults.map(result => (
            <article
              key={`query-${result.id}`}
              className="bg-white border rounded-lg shadow-sm p-5 hover:border-blue-400 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium">
                    {(result.similarity * 100).toFixed(1)}% match
                  </span>
                  {result.ref && <span className="font-medium text-gray-700">{result.ref}</span>}
                  <span className="text-gray-400">#{result.id}</span>
                </div>
              </div>

              <p className="mt-3 text-gray-900 leading-relaxed whitespace-pre-line">
                {result.text}
              </p>

              <dl className="mt-4 grid gap-2 sm:grid-cols-3 text-sm text-gray-600">
                {result.pattern && (
                  <div>
                    <dt className="font-medium text-gray-700">Pattern</dt>
                    <dd>{result.pattern}</dd>
                  </div>
                )}
                {result.verification && (
                  <div>
                    <dt className="font-medium text-gray-700">Verification Method</dt>
                    <dd>{result.verification}</dd>
                  </div>
                )}
                {typeof result.qaScore === "number" && (
                  <div>
                    <dt className="font-medium text-gray-700">QA Score</dt>
                    <dd>{result.qaScore.toFixed(2)}</dd>
                  </div>
                )}
              </dl>
            </article>
          ))}

          {searchMutation.isPending && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
              Analyzing requirements…
            </div>
          )}

          {hasSubmitted && !searchMutation.isPending && queryResults.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              No semantic matches found. Try broadening your question or lowering the similarity threshold.
            </div>
          )}
        </div>
      </section>

      <section className="bg-white border rounded-lg shadow-sm p-6 space-y-5">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">Find Similar Requirements</h2>
          <p className="text-sm text-gray-600">
            Anchor on an existing requirement to surface variants and related work with configurable similarity thresholds.
          </p>
        </header>

        <form onSubmit={handleSimilarSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Requirement ID or reference</span>
              <input
                value={similarRequirementId}
                onChange={event => setSimilarRequirementId(event.target.value)}
                className="border rounded px-3 py-2 text-sm"
                placeholder="e.g., REQ-145 or requirement node ID"
                disabled={similarRequirementsMutation.isPending}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">
                Minimum similarity <span className="text-gray-500">(0.0 – 1.0)</span>
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={similarThreshold}
                  onChange={event => setSimilarThreshold(Number(event.target.value))}
                  className="flex-1"
                  disabled={similarRequirementsMutation.isPending}
                />
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={similarThreshold}
                  onChange={event => setSimilarThreshold(Number(event.target.value))}
                  className="w-20 border rounded px-2 py-1 text-sm"
                  disabled={similarRequirementsMutation.isPending}
                />
              </div>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">Maximum results</span>
              <input
                type="number"
                min={1}
                max={100}
                value={similarLimit}
                onChange={event => setSimilarLimit(Number(event.target.value))}
                className="border rounded px-3 py-2 text-sm"
                disabled={similarRequirementsMutation.isPending}
              />
              <span className="text-xs text-gray-500">AIRGen stops after the specified number of matches.</span>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-gray-500">
              Uses the tenant/project semantic index populated by the embedding worker.
            </span>
            <button
              type="submit"
              disabled={similarRequirementsMutation.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
            >
              {similarRequirementsMutation.isPending ? "Searching…" : "Find Similar Requirements"}
            </button>
          </div>
        </form>

        {similarResults.length > 0 && (
          <div className="space-y-3">
            {similarResults.map(result => (
              <article
                key={`similar-${result.id}`}
                className="border rounded-lg p-4 hover:border-blue-400 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                    {(result.similarity * 100).toFixed(1)}% match
                  </span>
                  {result.ref && <span className="font-medium text-gray-700">{result.ref}</span>}
                  <span className="text-gray-400">#{result.id}</span>
                </div>
                <p className="mt-2 text-gray-900 whitespace-pre-line leading-relaxed">
                  {result.text}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white border rounded-lg shadow-sm p-6 space-y-5">
        <header className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">Detect Potential Duplicates</h2>
          <p className="text-sm text-gray-600">
            Quickly spot requirements that may be redundant or conflicting so you can harmonise the specification.
          </p>
        </header>

        <form onSubmit={handleDuplicateSubmit} className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Requirement ID or reference</span>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                value={duplicateRequirementId}
                onChange={event => setDuplicateRequirementId(event.target.value)}
                className="border rounded px-3 py-2 text-sm flex-1"
                placeholder="e.g., REQ-145"
                disabled={duplicatesMutation.isPending}
              />
              <button
                type="submit"
                disabled={duplicatesMutation.isPending}
                className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium"
              >
                {duplicatesMutation.isPending ? "Searching…" : "Find Duplicates"}
              </button>
            </div>
          </label>
        </form>

        {duplicateResults.length > 0 && (
          <div className="space-y-3">
            {duplicateResults.map(result => (
              <article
                key={`duplicate-${result.id}`}
                className="border rounded-lg p-4 hover:border-amber-400 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                    {(result.similarity * 100).toFixed(1)}% overlap
                  </span>
                  {result.ref && <span className="font-medium text-gray-700">{result.ref}</span>}
                  <span className="text-gray-400">#{result.id}</span>
                </div>
                <p className="mt-2 text-gray-900 whitespace-pre-line leading-relaxed">
                  {result.text}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {canManageEmbeddings && (
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white rounded-xl p-6 shadow-lg space-y-5">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold">Embedding Operations</h2>
            <p className="text-sm text-slate-300">
              Admin tools for maintaining embeddings and the Neo4j vector index used by semantic search.
            </p>
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 bg-white/10 rounded-lg border border-white/10 space-y-3">
              <h3 className="text-base font-semibold">Worker Status</h3>
              {embeddingStatusQuery.isFetching ? (
                <p className="text-sm text-slate-300">Refreshing status…</p>
              ) : embeddingStatus ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-300">Running</dt>
                    <dd className="font-medium">{embeddingStatus.isRunning ? "Yes" : "No"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-300">Operation</dt>
                    <dd className="font-medium">{embeddingStatus.operation ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-300">Processed</dt>
                    <dd className="font-medium">
                      {embeddingStatus.processedCount} / {embeddingStatus.totalCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-300">Current requirement</dt>
                    <dd className="font-medium">
                      {embeddingStatus.currentRequirement ?? "—"}
                    </dd>
                  </div>
                  {embeddingStatus.lastError && (
                    <div>
                      <dt className="text-slate-300">Last error</dt>
                      <dd className="text-red-200 text-sm">{embeddingStatus.lastError}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-slate-300">
                  Status unavailable. Run the worker to generate embeddings.
                </p>
              )}
            </div>

            <div className="p-4 bg-white/10 rounded-lg border border-white/10 space-y-3">
              <h3 className="text-base font-semibold">Worker Controls</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => startEmbeddingMutation.mutate("backfill")}
                  disabled={startEmbeddingMutation.isPending || stopEmbeddingMutation.isPending}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-md text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {startEmbeddingMutation.isPending ? "Starting…" : "Start Backfill"}
                </button>
                <button
                  type="button"
                  onClick={() => startEmbeddingMutation.mutate("reembed-all")}
                  disabled={startEmbeddingMutation.isPending || stopEmbeddingMutation.isPending}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-md text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {startEmbeddingMutation.isPending ? "Starting…" : "Re-embed All"}
                </button>
                <button
                  type="button"
                  onClick={() => stopEmbeddingMutation.mutate()}
                  disabled={stopEmbeddingMutation.isPending || startEmbeddingMutation.isPending}
                  className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-md text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {stopEmbeddingMutation.isPending ? "Stopping…" : "Stop Worker"}
                </button>
              </div>
              <p className="text-xs text-slate-300">
                Backfill embeds requirements missing vectors. Re-embed processes every requirement with the latest model.
              </p>
            </div>
          </div>

          <div className="p-4 bg-white/5 rounded-lg border border-white/10 space-y-2 text-sm">
            <h3 className="text-base font-semibold text-white">Vector Index Maintenance</h3>
            <p className="text-slate-300">
              Ensure the Neo4j vector index exists before running semantic search. Run this provisioning script after major upgrades:
            </p>
            <pre className="bg-black/40 text-slate-100 p-3 rounded-md text-xs overflow-x-auto">
pnpm --filter backend tsx src/scripts/create-vector-indexes.ts
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}
