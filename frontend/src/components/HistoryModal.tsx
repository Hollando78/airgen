import React, { useState, useEffect } from "react";
import { diffWords, diffChars } from "diff";
import { useApiClient } from "../lib/client";
import type { RequirementVersionRecord, RequirementDiff } from "../types";

type HistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tenant: string;
  project: string;
  requirementId: string;
  requirementRef: string;
  onRestore?: () => void;
};

export function HistoryModal({
  isOpen,
  onClose,
  tenant,
  project,
  requirementId,
  requirementRef,
  onRestore
}: HistoryModalProps) {
  const client = useApiClient();
  const [history, setHistory] = useState<RequirementVersionRecord[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<{from: number | null, to: number | null}>({ from: null, to: null });
  const [diff, setDiff] = useState<RequirementDiff[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, requirementId]);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.getRequirementHistory(tenant, project, requirementId);
      setHistory(response.history);

      // Auto-select latest two versions for diff
      if (response.history.length >= 2) {
        setSelectedVersions({
          from: response.history[1].versionNumber,
          to: response.history[0].versionNumber
        });
        loadDiff(response.history[1].versionNumber, response.history[0].versionNumber);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load version history");
    } finally {
      setLoading(false);
    }
  };

  const loadDiff = async (from: number, to: number) => {
    if (from === to) {
      setDiff(null);
      return;
    }

    setDiffLoading(true);
    try {
      const response = await client.getRequirementDiff(tenant, project, requirementId, from, to);
      setDiff(response.diff);
    } catch (err: any) {
      console.error("Failed to load diff:", err);
      setDiff(null);
    } finally {
      setDiffLoading(false);
    }
  };

  const handleVersionSelect = (versionNumber: number, type: 'from' | 'to') => {
    const newSelection = { ...selectedVersions, [type]: versionNumber };
    setSelectedVersions(newSelection);

    if (newSelection.from !== null && newSelection.to !== null) {
      loadDiff(newSelection.from, newSelection.to);
    }
  };

  const handleRestore = async (versionNumber: number) => {
    if (!confirm(`Are you sure you want to restore this requirement to version ${versionNumber}? This will create a new version with the restored state.`)) {
      return;
    }

    setRestoring(versionNumber);
    try {
      await client.restoreRequirementVersion(tenant, project, requirementId, versionNumber);
      alert(`Successfully restored to version ${versionNumber}`);
      loadHistory(); // Reload history to show new version
      onRestore?.();
    } catch (err: any) {
      alert(`Failed to restore: ${err.message}`);
    } finally {
      setRestoring(null);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "(none)";
    if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "(empty)";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  // Render inline diff with word-level changes highlighted
  const renderInlineDiff = (oldValue: any, newValue: any, fieldName: string) => {
    const oldStr = formatValue(oldValue);
    const newStr = formatValue(newValue);

    // For long text fields (like requirement text), use word-level diff
    // For shorter fields, use character-level diff for precision
    const isLongText = fieldName === 'text' || fieldName === 'rationale' || fieldName === 'complianceRationale';
    const changes = isLongText ? diffWords(oldStr, newStr) : diffChars(oldStr, newStr);

    return (
      <div style={{
        padding: "8px 12px",
        backgroundColor: "#f9fafb",
        borderRadius: "4px",
        fontFamily: "monospace",
        fontSize: "12px",
        lineHeight: "1.6",
        wordWrap: "break-word",
        whiteSpace: "pre-wrap"
      }}>
        {changes.map((part, index) => {
          if (part.added) {
            return (
              <span
                key={index}
                style={{
                  backgroundColor: "#d1fae5",
                  color: "#065f46",
                  fontWeight: "500",
                  padding: "1px 2px",
                  borderRadius: "2px"
                }}
              >
                {part.value}
              </span>
            );
          } else if (part.removed) {
            return (
              <span
                key={index}
                style={{
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  textDecoration: "line-through",
                  padding: "1px 2px",
                  borderRadius: "2px"
                }}
              >
                {part.value}
              </span>
            );
          } else {
            return <span key={index}>{part.value}</span>;
          }
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          width: "90%",
          maxWidth: "1200px",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "20px", borderBottom: "1px solid #e5e7eb" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "600" }}>
            Version History - {requirementRef}
          </h2>
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              padding: "0 8px",
              color: "#6b7280"
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* History List */}
          <div
            style={{
              width: "350px",
              borderRight: "1px solid #e5e7eb",
              overflow: "auto",
              padding: "16px"
            }}
          >
            <h3 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 12px 0" }}>
              Versions ({history.length})
            </h3>

            {loading ? (
              <div style={{ textAlign: "center", padding: "20px" }}>Loading...</div>
            ) : error ? (
              <div style={{ color: "#dc2626", padding: "12px", fontSize: "14px" }}>{error}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {history.map((version) => (
                  <div
                    key={version.versionId}
                    style={{
                      padding: "12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      fontSize: "13px",
                      backgroundColor:
                        selectedVersions.from === version.versionNumber || selectedVersions.to === version.versionNumber
                          ? "#eff6ff"
                          : "white"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <strong>v{version.versionNumber}</strong>
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          backgroundColor:
                            version.changeType === "created" ? "#dbeafe" :
                            version.changeType === "updated" ? "#fef3c7" :
                            version.changeType === "restored" ? "#d1fae5" : "#f3f4f6",
                          color: "#374151"
                        }}
                      >
                        {version.changeType}
                      </span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px" }}>
                      {formatTimestamp(version.timestamp)}<br />
                      by {version.changedBy}
                    </div>
                    <div style={{ fontSize: "12px", color: "#374151", marginBottom: "8px", lineHeight: "1.4" }}>
                      {version.text.substring(0, 80)}{version.text.length > 80 ? "..." : ""}
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => handleVersionSelect(version.versionNumber, 'from')}
                        disabled={selectedVersions.to === version.versionNumber}
                        style={{
                          fontSize: "11px",
                          padding: "4px 8px",
                          border: selectedVersions.from === version.versionNumber ? "1px solid #3b82f6" : "1px solid #d1d5db",
                          borderRadius: "4px",
                          backgroundColor: selectedVersions.from === version.versionNumber ? "#3b82f6" : "white",
                          color: selectedVersions.from === version.versionNumber ? "white" : "#374151",
                          cursor: selectedVersions.to === version.versionNumber ? "not-allowed" : "pointer"
                        }}
                      >
                        From
                      </button>
                      <button
                        onClick={() => handleVersionSelect(version.versionNumber, 'to')}
                        disabled={selectedVersions.from === version.versionNumber}
                        style={{
                          fontSize: "11px",
                          padding: "4px 8px",
                          border: selectedVersions.to === version.versionNumber ? "1px solid #3b82f6" : "1px solid #d1d5db",
                          borderRadius: "4px",
                          backgroundColor: selectedVersions.to === version.versionNumber ? "#3b82f6" : "white",
                          color: selectedVersions.to === version.versionNumber ? "white" : "#374151",
                          cursor: selectedVersions.from === version.versionNumber ? "not-allowed" : "pointer"
                        }}
                      >
                        To
                      </button>
                      {version.versionNumber < (history[0]?.versionNumber || 0) && (
                        <button
                          onClick={() => handleRestore(version.versionNumber)}
                          disabled={restoring === version.versionNumber}
                          style={{
                            fontSize: "11px",
                            padding: "4px 8px",
                            border: "1px solid #10b981",
                            borderRadius: "4px",
                            backgroundColor: "white",
                            color: "#10b981",
                            cursor: restoring === version.versionNumber ? "wait" : "pointer"
                          }}
                        >
                          {restoring === version.versionNumber ? "..." : "Restore"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Diff View */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
            <h3 style={{ fontSize: "14px", fontWeight: "600", margin: "0 0 12px 0" }}>
              Changes
              {selectedVersions.from && selectedVersions.to && (
                <span style={{ fontSize: "12px", fontWeight: "normal", color: "#6b7280", marginLeft: "8px" }}>
                  (v{selectedVersions.from} → v{selectedVersions.to})
                </span>
              )}
            </h3>

            {diffLoading ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#6b7280" }}>
                Loading diff...
              </div>
            ) : !diff ? (
              <div style={{ textAlign: "center", padding: "20px", color: "#6b7280" }}>
                Select two versions to compare
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {diff.filter(d => d.changed).map((change, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "6px",
                      backgroundColor: "#fafafa"
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px", color: "#374151" }}>
                      {change.field}
                    </div>
                    <div style={{ fontSize: "12px" }}>
                      {renderInlineDiff(change.oldValue, change.newValue, change.field)}
                      <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "8px", fontStyle: "italic" }}>
                        <span style={{ backgroundColor: "#fee2e2", color: "#991b1b", padding: "2px 4px", borderRadius: "2px", marginRight: "8px" }}>
                          Removed
                        </span>
                        <span style={{ backgroundColor: "#d1fae5", color: "#065f46", padding: "2px 4px", borderRadius: "2px" }}>
                          Added
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {diff.filter(d => d.changed).length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px", color: "#6b7280" }}>
                    No changes between these versions
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
