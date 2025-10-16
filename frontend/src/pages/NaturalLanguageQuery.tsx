import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { QueryResultsTable } from "../components/QueryResultsTable";
import { QueryExamplesDropdown } from "../components/QueryExamplesDropdown";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";

export function NaturalLanguageQuery() {
  const { state } = useTenantProject();
  const client = useApiClient();

  const [query, setQuery] = React.useState("");
  const [includeExplanation, setIncludeExplanation] = React.useState(true);
  const [lastResult, setLastResult] = React.useState<{
    cypher: string;
    results: unknown[];
    executionTime: number;
    explanation?: string;
  } | null>(null);

  if (!state.tenant || !state.project) {
    return <div className="text-center py-8 text-gray-600">Loading project...</div>;
  }

  // Fetch example queries
  const { data: examplesData, isLoading: loadingExamples } = useQuery({
    queryKey: ["examples"],
    queryFn: () => client.getExampleQueries()
  });

  // Mutation for querying
  const queryMutation = useMutation({
    mutationFn: async (nlQuery: string) => {
      return await client.naturalLanguageQuery({
        tenant: state.tenant!,
        projectKey: state.project!,
        query: nlQuery,
        includeExplanation
      });
    },
    onSuccess: (data) => {
      setLastResult({
        cypher: data.cypherQuery,
        results: data.results,
        executionTime: data.executionTime,
        explanation: data.explanation
      });
      toast.success(`Found ${data.resultCount} results in ${data.executionTime}ms`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Query failed");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error("Please enter a query");
      return;
    }
    queryMutation.mutate(query);
  };

  const copyCypher = () => {
    if (lastResult?.cypher) {
      navigator.clipboard.writeText(lastResult.cypher);
      toast.success("Cypher query copied to clipboard");
    }
  };

  const downloadResults = () => {
    if (lastResult?.results) {
      const csv = convertResultsToCSV(lastResult.results);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `query-results-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Results downloaded as CSV");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Query Requirements</h1>
        <p className="text-gray-600">
          Ask questions about your requirements, documents, and traceability in natural language.
        </p>
      </div>

      {/* Query Input Section */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Your Question
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Show me all high-scoring requirements, or find requirements created in the last 7 days..."
              className="w-full px-4 py-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
              disabled={queryMutation.isPending}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeExplanation}
                  onChange={(e) => setIncludeExplanation(e.target.checked)}
                  className="w-4 h-4 border rounded"
                  disabled={queryMutation.isPending}
                />
                <span className="text-sm text-gray-700">Include explanation</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={queryMutation.isPending || !query.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {queryMutation.isPending ? "Querying..." : "Query"}
            </button>
          </div>
        </form>
      </div>

      {/* Example Queries */}
      {examplesData?.examples && (
        <div className="mb-6">
          <QueryExamplesDropdown
            examples={examplesData.examples}
            onSelectExample={(ex) => setQuery(ex)}
            loading={loadingExamples}
          />
        </div>
      )}

      {/* Results Section */}
      {lastResult && (
        <div className="space-y-6">
          {/* Cypher Query */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">Generated Cypher Query</h2>
              <button
                onClick={copyCypher}
                className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
              >
                <Copy size={16} />
                Copy
              </button>
            </div>
            <pre className="bg-gray-50 border rounded p-4 overflow-x-auto text-sm text-gray-800">
              {lastResult.cypher}
            </pre>
          </div>

          {/* Explanation (if available) */}
          {lastResult.explanation && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-medium text-blue-900 mb-2">Explanation</h3>
              <p className="text-blue-800">{lastResult.explanation}</p>
            </div>
          )}

          {/* Execution Time */}
          <div className="text-sm text-gray-600">
            Query executed in {lastResult.executionTime}ms
            {lastResult.results.length > 0 && ` • Found ${lastResult.results.length} results`}
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Results</h2>
              {lastResult.results.length > 0 && (
                <button
                  onClick={downloadResults}
                  className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                >
                  <Download size={16} />
                  Export CSV
                </button>
              )}
            </div>
            <QueryResultsTable
              results={lastResult.results}
              loading={false}
              error={queryMutation.error instanceof Error ? queryMutation.error.message : undefined}
            />
          </div>
        </div>
      )}

      {/* Loading State */}
      {queryMutation.isPending && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-blue-800 font-medium">Processing your query...</p>
        </div>
      )}

      {/* Error State */}
      {queryMutation.error && !lastResult && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-red-700 text-sm mt-2">
            {queryMutation.error instanceof Error ? queryMutation.error.message : "An unknown error occurred"}
          </p>
        </div>
      )}
    </div>
  );
}

function convertResultsToCSV(results: unknown[]): string {
  if (results.length === 0) return "";

  const first = results[0];
  if (typeof first !== "object" || first === null) {
    // Scalar values
    return results.map(r => String(r)).join("\n");
  }

  // Object results
  const obj = first as Record<string, unknown>;
  const headers = Object.keys(obj);
  const csvHeaders = headers.map(h => `"${h}"`).join(",");
  const csvRows = results
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map(row =>
      headers
        .map(h => {
          const value = row[h];
          if (value === null || value === undefined) return "";
          if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
          if (typeof value === "object") return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          return String(value);
        })
        .join(",")
    );

  return [csvHeaders, ...csvRows].join("\n");
}
