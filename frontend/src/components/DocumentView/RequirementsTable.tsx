import type { RequirementRecord, DocumentSectionRecord } from "../../types";

export interface RequirementsTableProps {
  section: DocumentSectionRecord & { requirements: RequirementRecord[] };
  tenant: string;
  project: string;
  onAddRequirement: () => void;
  onEditRequirement: (requirement: RequirementRecord) => void;
}

export function RequirementsTable({
  section,
  tenant,
  project,
  onAddRequirement,
  onEditRequirement
}: RequirementsTableProps): JSX.Element {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid #e2e8f0",
        backgroundColor: "#f8f9fa"
      }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>{section.name}</h2>
        <p style={{ margin: "4px 0 0 0", color: "#64748b", fontSize: "14px" }}>
          {section.description}
        </p>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
          <thead style={{ position: "sticky", top: 0, backgroundColor: "#f1f5f9" }}>
            <tr>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "100px" }}>ID</th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "200px" }}>Title</th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left" }}>Description</th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "120px" }}>Pattern</th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "120px" }}>Verification</th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "80px" }}>QA Score</th>
              <th style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "left", width: "60px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {section.requirements.length === 0 ? (
              <tr>
                <td colSpan={7} style={{
                  border: "1px solid #e2e8f0",
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b"
                }}>
                  No requirements in this section yet
                </td>
              </tr>
            ) : (
              section.requirements.map((req: RequirementRecord, index: number) => (
                <tr key={req.id} style={{ backgroundColor: index % 2 === 0 ? "white" : "#f8f9fa" }}>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>{req.ref}</td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>{req.title}</td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>{req.text}</td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>
                    <span style={{ padding: "2px 6px", borderRadius: "3px", fontSize: "12px", backgroundColor: "#e2e8f0" }}>
                      {req.pattern || "—"}
                    </span>
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px" }}>
                    <span style={{ padding: "2px 6px", borderRadius: "3px", fontSize: "12px", backgroundColor: "#e2e8f0" }}>
                      {req.verification || "—"}
                    </span>
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "center" }}>
                    {req.qaScore ? (
                      <span
                        style={{
                          padding: "2px 6px",
                          borderRadius: "3px",
                          fontSize: "12px",
                          backgroundColor:
                            req.qaScore >= 80 ? "#d4edda" : req.qaScore >= 60 ? "#fff3cd" : "#f8d7da",
                          color:
                            req.qaScore >= 80 ? "#155724" : req.qaScore >= 60 ? "#856404" : "#721c24"
                        }}
                      >
                        {req.qaScore}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ border: "1px solid #e2e8f0", padding: "12px", textAlign: "center" }}>
                    <button
                      onClick={() => onEditRequirement(req)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        borderRadius: "3px"
                      }}
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        padding: "16px 24px",
        borderTop: "1px solid #e2e8f0",
        backgroundColor: "#f8f9fa",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div>
          <strong>{section.requirements.length}</strong> requirement{section.requirements.length !== 1 ? 's' : ''}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onAddRequirement}
            style={{
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              padding: "8px 12px",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            ＋ Add Requirement
          </button>
          <a
            href={`#/documents/${tenant}/${project}/${section.documentSlug}/sections/${section.id}`}
            style={{
              color: "#2563eb",
              textDecoration: "none",
              padding: "8px 12px"
            }}
          >
            Open in detail
          </a>
        </div>
      </div>
    </div>
  );
}
