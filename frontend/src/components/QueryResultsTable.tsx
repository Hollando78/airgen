import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface QueryResultsTableProps {
  results: unknown[];
  loading?: boolean;
  error?: string;
}

export function QueryResultsTable({ results, loading, error }: QueryResultsTableProps) {
  const [expandedRows, setExpandedRows] = React.useState<Set<number>>(new Set());

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 p-4">
        <p className="text-red-800 font-medium">Error</p>
        <p className="text-red-700 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No results found</p>
      </div>
    );
  }

  const isObjectArray = results.every(r => typeof r === "object" && r !== null);

  if (!isObjectArray) {
    // Simple scalar results
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-4 py-2 font-medium text-gray-700 border-b">Value</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, idx) => (
              <tr key={idx} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">{String(result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Object/dict results
  const firstObj = results[0] as Record<string, unknown>;
  const columns = Object.keys(firstObj).slice(0, 10); // Limit columns for readability

  const toggleRow = (idx: number) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setExpandedRows(newSet);
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return "—";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100 border-b">
            <th className="w-8 px-4 py-2"></th>
            {columns.map(col => (
              <th key={col} className="text-left px-4 py-2 font-medium text-gray-700">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((row, idx) => {
            const obj = row as Record<string, unknown>;
            const isExpanded = expandedRows.has(idx);

            return (
              <React.Fragment key={idx}>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => toggleRow(idx)}
                      className="p-1 hover:bg-gray-200 rounded"
                      title={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  </td>
                  {columns.map(col => (
                    <td key={col} className="px-4 py-2 text-gray-700 max-w-xs truncate">
                      {formatValue(obj[col])}
                    </td>
                  ))}
                </tr>
                {isExpanded && (
                  <tr className="bg-gray-50 border-b">
                    <td colSpan={columns.length + 1} className="px-4 py-4">
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-gray-600 mb-2">All fields:</p>
                        <pre className="bg-white border rounded p-3 text-xs overflow-x-auto max-h-96">
                          {JSON.stringify(obj, null, 2)}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
