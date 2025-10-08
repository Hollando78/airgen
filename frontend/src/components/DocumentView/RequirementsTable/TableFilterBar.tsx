import type { ColumnVisibility } from "./ColumnSelector";

/**
 * Filter state type
 */
export type FilterState = {
  text: string;
  pattern: string;
  verification: string;
  rationale: string;
  complianceStatus: string;
  complianceRationale: string;
  minQaScore: string;
  maxQaScore: string;
  objectTypes: string[]; // Array of object types to display: 'requirement', 'info'
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
  /** Column visibility to show only relevant filters */
  visibleColumns: ColumnVisibility;
}

/**
 * Filter controls for the requirements table with text search,
 * pattern filter, verification filter, and QA score range
 */
export function TableFilterBar({
  filters,
  onFiltersChange,
  onClearFilters,
  hasActiveFilters,
  visibleColumns
}: TableFilterBarProps): JSX.Element {
  const handleFilterChange = (key: keyof FilterState, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const handleObjectTypeToggle = (objectType: string) => {
    const currentTypes = filters.objectTypes || ['requirement', 'info'];
    const newTypes = currentTypes.includes(objectType)
      ? currentTypes.filter(t => t !== objectType)
      : [...currentTypes, objectType];

    // Ensure at least one type is always selected
    if (newTypes.length === 0) return;

    onFiltersChange({
      ...filters,
      objectTypes: newTypes
    });
  };

  // Count visible filter fields to determine grid layout
  const visibleFilterCount =
    1 + // text search is always visible
    (visibleColumns.pattern ? 1 : 0) +
    (visibleColumns.verification ? 1 : 0) +
    (visibleColumns.rationale ? 1 : 0) +
    (visibleColumns.complianceStatus ? 1 : 0) +
    (visibleColumns.complianceRationale ? 1 : 0) +
    (visibleColumns.qaScore ? 2 : 0) + // min and max
    1 + // object types
    1; // clear button

  return (
    <div style={{
      padding: "16px 24px",
      backgroundColor: "#f1f5f9",
      borderBottom: "1px solid #e2e8f0",
      display: "flex",
      flexWrap: "wrap",
      gap: "12px",
      alignItems: "end"
    }}>
      <div style={{ minWidth: "250px", flexGrow: 1 }}>
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

      {visibleColumns.pattern && (
        <div style={{ minWidth: "150px" }}>
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
      )}

      {visibleColumns.verification && (
        <div style={{ minWidth: "150px" }}>
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
      )}

      {visibleColumns.rationale && (
        <div style={{ minWidth: "200px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
            Rationale
          </label>
          <input
            type="text"
            placeholder="Search rationale..."
            value={filters.rationale}
            onChange={(e) => handleFilterChange('rationale', e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "12px"
            }}
          />
        </div>
      )}

      {visibleColumns.complianceStatus && (
        <div style={{ minWidth: "180px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
            Compliance Status
          </label>
          <select
            value={filters.complianceStatus}
            onChange={(e) => handleFilterChange('complianceStatus', e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "12px"
            }}
          >
            <option value="">All</option>
            <option value="N/A">N/A</option>
            <option value="Compliant">Compliant</option>
            <option value="Compliance Risk">Compliance Risk</option>
            <option value="Non-Compliant">Non-Compliant</option>
          </select>
        </div>
      )}

      {visibleColumns.complianceRationale && (
        <div style={{ minWidth: "200px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
            Compliance Rationale
          </label>
          <input
            type="text"
            placeholder="Search compliance rationale..."
            value={filters.complianceRationale}
            onChange={(e) => handleFilterChange('complianceRationale', e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "12px"
            }}
          />
        </div>
      )}

      {visibleColumns.qaScore && (
        <div style={{ minWidth: "120px" }}>
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
      )}

      {visibleColumns.qaScore && (
        <div style={{ minWidth: "120px" }}>
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
      )}

      <div>
        <label style={{ display: "block", fontSize: "12px", fontWeight: "500", color: "#374151", marginBottom: "4px" }}>
          Object Types
        </label>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={(filters.objectTypes || ['requirement', 'info']).includes('requirement')}
              onChange={() => handleObjectTypeToggle('requirement')}
              style={{ cursor: "pointer" }}
            />
            <span>Requirements</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={(filters.objectTypes || ['requirement', 'info']).includes('info')}
              onChange={() => handleObjectTypeToggle('info')}
              style={{ cursor: "pointer" }}
            />
            <span>Info</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={(filters.objectTypes || ['requirement', 'info']).includes('surrogate')}
              onChange={() => handleObjectTypeToggle('surrogate')}
              style={{ cursor: "pointer" }}
            />
            <span>Surrogates</span>
          </label>
        </div>
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
