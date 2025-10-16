import React from "react";
import { ChevronDown } from "lucide-react";
import type { ExampleQuery } from "../types";

interface QueryExamplesDropdownProps {
  examples: ExampleQuery[];
  onSelectExample: (query: string) => void;
  loading?: boolean;
}

export function QueryExamplesDropdown({
  examples,
  onSelectExample,
  loading
}: QueryExamplesDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");

  // Group examples by category
  const grouped = React.useMemo(() => {
    const groups: Record<string, ExampleQuery[]> = {};
    examples.forEach(ex => {
      if (!groups[ex.category]) {
        groups[ex.category] = [];
      }
      groups[ex.category].push(ex);
    });
    return groups;
  }, [examples]);

  // Filter examples by search term
  const filtered = React.useMemo(() => {
    if (!searchTerm) return grouped;

    const filtered: Record<string, ExampleQuery[]> = {};
    Object.entries(grouped).forEach(([category, items]) => {
      const matches = items.filter(ex =>
        ex.natural.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (matches.length > 0) {
        filtered[category] = matches;
      }
    });
    return filtered;
  }, [grouped, searchTerm]);

  const handleSelect = (query: string) => {
    onSelectExample(query);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Example queries:</span>
        <div className="relative flex-1 max-w-xs">
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={loading}
            className="w-full px-3 py-2 text-left text-sm border rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 flex items-center justify-between"
          >
            <span className="text-gray-700">Choose an example...</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </button>

          {isOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border rounded-md shadow-lg z-10 max-h-96 overflow-hidden flex flex-col">
              <input
                type="text"
                placeholder="Search examples..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="px-3 py-2 text-sm border-b sticky top-0 bg-white"
                autoFocus
              />
              <div className="overflow-y-auto">
                {Object.entries(filtered).length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">
                    No examples found
                  </div>
                ) : (
                  Object.entries(filtered).map(([category, items]) => (
                    <div key={category}>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-50 sticky top-10">
                        {category}
                      </div>
                      {items.map((ex, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelect(ex.natural)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 border-b last:border-b-0"
                        >
                          {ex.natural}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {isOpen && (
        <div
          className="fixed inset-0 z-5"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
