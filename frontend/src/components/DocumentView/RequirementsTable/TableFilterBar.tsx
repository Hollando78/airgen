/**
 * Filter state type
 */
export type FilterState = {
  text: string;
  pattern: string;
  verification: string;
  minQaScore: string;
  maxQaScore: string;
};

/**
 * Props for the TableFilterBar component
 */
export interface TableFilterBarProps {
  /** Current filter values */
  filters: FilterState;
  /** Handler for filter changes */
  onFiltersChange: (filters: FilterState) => void;
  /** Handler for clearing all filters */
  onClearFilters: () => void;
  /** Whether any filters are active */
  hasActiveFilters: boolean;
}

/**
 * Filter controls for the requirements table with text search,
 * pattern filter, verification filter, and QA score range
 */
export function TableFilterBar({
  filters,
  onFiltersChange,
  onClearFilters,
  hasActiveFilters
}: TableFilterBarProps): JSX.Element {
  const handleFilterChange = (key: keyof FilterState, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  return (
    <div style={{
      padding: "16px 24px",
      backgroundColor: "#f1f5f9",
      borderBottom: "1px solid #e2e8f0",
      display: "grid",
      gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto",
      gap: "12px",
      alignItems: "end"
    }}>
      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
          Text Search
        </label>
        <input
          type="text"
          placeholder="Search in ID or description..."
          value={filters.text}
          onChange={(e) => handleFilterChange('text', e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "12px"
          }}
        />
      </div>

      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
          Pattern
        </label>
        <select
          value={filters.pattern}
          onChange={(e) => handleFilterChange('pattern', e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "12px"
          }}
        >
          <option value="">All</option>
          <option value="ubiquitous">Ubiquitous</option>
          <option value="event">Event</option>
          <option value="state">State</option>
          <option value="unwanted">Unwanted</option>
          <option value="optional">Optional</option>
        </select>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
          Verification
        </label>
        <select
          value={filters.verification}
          onChange={(e) => handleFilterChange('verification', e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "12px"
          }}
        >
          <option value="">All</option>
          <option value="Test">Test</option>
          <option value="Analysis">Analysis</option>
          <option value="Inspection">Inspection</option>
          <option value="Demonstration">Demonstration</option>
        </select>
      </div>

      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
          Min QA Score
        </label>
        <input
          type="number"
          min="0"
          max="100"
          placeholder="0"
          value={filters.minQaScore}
          onChange={(e) => handleFilterChange('minQaScore', e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "12px"
          }}
        />
      </div>

      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
          Max QA Score
        </label>
        <input
          type="number"
          min="0"
          max="100"
          placeholder="100"
          value={filters.maxQaScore}
          onChange={(e) => handleFilterChange('maxQaScore', e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            fontSize: "12px"
          }}
        />
      </div>

      <button
        onClick={onClearFilters}
        disabled={!hasActiveFilters}
        style={{
          padding: "6px 12px",
          backgroundColor: hasActiveFilters ? "#ef4444" : "#e5e7eb",
          color: hasActiveFilters ? "white" : "#9ca3af",
          border: "none",
          borderRadius: "4px",
          cursor: hasActiveFilters ? "pointer" : "not-allowed",
          fontSize: "12px",
          whiteSpace: "nowrap"
        }}
      >
        Clear
      </button>
    </div>
  );
}
