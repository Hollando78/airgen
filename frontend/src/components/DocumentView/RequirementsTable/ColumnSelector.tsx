/**
 * Column visibility state type
 */
export type ColumnVisibility = {
  id: boolean;
  description: boolean;
  pattern: boolean;
  verification: boolean;
  rationale: boolean;
  complianceStatus: boolean;
  complianceRationale: boolean;
  qaScore: boolean;
  attributes: boolean;
  actions: boolean;
};

/**
 * Props for the ColumnSelector component
 */
export interface ColumnSelectorProps {
  /** Current column visibility state */
  visibleColumns: ColumnVisibility;
  /** Handler for column visibility changes */
  onVisibleColumnsChange: (columns: ColumnVisibility) => void;
}

/**
 * Column visibility selector component that allows showing/hiding table columns
 */
export function ColumnSelector({
  visibleColumns,
  onVisibleColumnsChange
}: ColumnSelectorProps): JSX.Element {
  const handleToggleAll = () => {
    const allVisible = Object.values(visibleColumns).every(v => v);
    if (allVisible) {
      // Hide all except description and actions (keep these always visible)
      onVisibleColumnsChange({
        id: false,
        description: true,
        pattern: false,
        verification: false,
        rationale: false,
        complianceStatus: false,
        complianceRationale: false,
        qaScore: false,
        attributes: false,
        actions: true
      });
    } else {
      // Show all
      onVisibleColumnsChange({
        id: true,
        description: true,
        pattern: true,
        verification: true,
        rationale: true,
        complianceStatus: true,
        complianceRationale: true,
        qaScore: true,
        attributes: true,
        actions: true
      });
    }
  };

  const handleColumnToggle = (e: React.ChangeEvent<HTMLInputElement>, column: keyof ColumnVisibility) => {
    e.stopPropagation();
    onVisibleColumnsChange({
      ...visibleColumns,
      [column]: e.target.checked
    });
  };

  return (
    <div style={{
      padding: "16px 24px",
      backgroundColor: "#f0f9ff",
      borderBottom: "1px solid #e2e8f0",
      display: "flex",
      flexDirection: "column",
      gap: "12px"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>
          Column Visibility
        </h4>
        <button
          onClick={handleToggleAll}
          style={{
            padding: "4px 8px",
            backgroundColor: "transparent",
            color: "#3b82f6",
            border: "1px solid #3b82f6",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "11px"
          }}
        >
          {Object.values(visibleColumns).every(v => v) ? "Hide All" : "Show All"}
        </button>
      </div>

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "16px",
        alignItems: "center"
      }}>
        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "60px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.id}
            onChange={(e) => handleColumnToggle(e, 'id')}
          />
          ID
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "120px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.description}
            onChange={(e) => handleColumnToggle(e, 'description')}
            disabled={true}
          />
          Description
          <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: "normal" }}>(required)</span>
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "80px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.pattern}
            onChange={(e) => handleColumnToggle(e, 'pattern')}
          />
          Pattern
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "100px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.verification}
            onChange={(e) => handleColumnToggle(e, 'verification')}
          />
          Verification
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "90px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.rationale}
            onChange={(e) => handleColumnToggle(e, 'rationale')}
          />
          Rationale
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "150px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.complianceStatus}
            onChange={(e) => handleColumnToggle(e, 'complianceStatus')}
          />
          Compliance Status
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "170px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.complianceRationale}
            onChange={(e) => handleColumnToggle(e, 'complianceRationale')}
          />
          Compliance Rationale
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "90px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.qaScore}
            onChange={(e) => handleColumnToggle(e, 'qaScore')}
          />
          QA Score
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "100px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.attributes}
            onChange={(e) => handleColumnToggle(e, 'attributes')}
          />
          Attributes
        </label>

        <label style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "13px",
          minWidth: "100px",
          fontWeight: "500"
        }}>
          <input
            type="checkbox"
            checked={visibleColumns.actions}
            onChange={(e) => handleColumnToggle(e, 'actions')}
            disabled={true}
          />
          Actions
          <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: "normal" }}>(required)</span>
        </label>
      </div>
    </div>
  );
}
