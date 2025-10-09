import { useState, useEffect } from "react";
import { useApiClient } from "../lib/client";
import { toast } from "sonner";
import type {
  BackupInfo,
  RemoteSnapshot,
  BackupStatusResponse,
} from "../types";

export default function AdminRecoveryRoute() {
  const api = useApiClient();

  const [status, setStatus] = useState<BackupStatusResponse | null>(null);
  const [localBackups, setLocalBackups] = useState<{
    daily: BackupInfo[];
    weekly: BackupInfo[];
  } | null>(null);
  const [remoteBackups, setRemoteBackups] = useState<{
    snapshots: RemoteSnapshot[];
    configured: boolean;
  } | null>(null);

  const [selectedBackup, setSelectedBackup] = useState<string>("");
  const [restoreComponent, setRestoreComponent] = useState<string>("all");
  const [isOperationRunning, setIsOperationRunning] = useState(false);
  const [operationOutput, setOperationOutput] = useState<string>("");
  const [showOutput, setShowOutput] = useState(false);

  // Load status and backups on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusData, backupsData, remoteData] = await Promise.all([
        api.getBackupStatus(),
        api.listBackups(),
        api.listRemoteBackups(),
      ]);

      setStatus(statusData);
      setLocalBackups(backupsData);
      setRemoteBackups(remoteData);
    } catch (error) {
      toast.error(`Failed to load backup data: ${(error as Error).message}`);
    }
  };

  const handleTriggerDaily = async () => {
    if (isOperationRunning) {
      toast.error("An operation is already running");
      return;
    }

    setIsOperationRunning(true);
    setOperationOutput("");
    setShowOutput(true);

    const toastId = toast.loading("Triggering daily backup...");

    try {
      const result = await api.triggerDailyBackup();
      setOperationOutput(result.output);

      if (result.success) {
        toast.success(result.message, { id: toastId });
        await loadData(); // Refresh data
      } else {
        toast.error(result.message, { id: toastId });
      }
    } catch (error) {
      toast.error(`Failed to trigger daily backup: ${(error as Error).message}`, { id: toastId });
    } finally {
      setIsOperationRunning(false);
    }
  };

  const handleTriggerWeekly = async () => {
    if (isOperationRunning) {
      toast.error("An operation is already running");
      return;
    }

    setIsOperationRunning(true);
    setOperationOutput("");
    setShowOutput(true);

    const toastId = toast.loading("Triggering weekly backup (with remote upload)...");

    try {
      const result = await api.triggerWeeklyBackup();
      setOperationOutput(result.output);

      if (result.success) {
        toast.success(result.message, { id: toastId });
        await loadData(); // Refresh data
      } else {
        toast.error(result.message, { id: toastId });
      }
    } catch (error) {
      toast.error(`Failed to trigger weekly backup: ${(error as Error).message}`, { id: toastId });
    } finally {
      setIsOperationRunning(false);
    }
  };

  const handleVerifyBackup = async () => {
    if (!selectedBackup) {
      toast.error("Please select a backup to verify");
      return;
    }

    if (isOperationRunning) {
      toast.error("An operation is already running");
      return;
    }

    setIsOperationRunning(true);
    setOperationOutput("");
    setShowOutput(true);

    const toastId = toast.loading("Verifying backup integrity...");

    try {
      const result = await api.verifyBackup(selectedBackup);
      setOperationOutput(result.output);

      if (result.success) {
        toast.success(result.message, { id: toastId });
      } else {
        toast.error(result.message, { id: toastId });
      }
    } catch (error) {
      toast.error(`Failed to verify backup: ${(error as Error).message}`, { id: toastId });
    } finally {
      setIsOperationRunning(false);
    }
  };

  const handleRestoreDryRun = async () => {
    if (!selectedBackup) {
      toast.error("Please select a backup to restore");
      return;
    }

    if (isOperationRunning) {
      toast.error("An operation is already running");
      return;
    }

    setIsOperationRunning(true);
    setOperationOutput("");
    setShowOutput(true);

    const toastId = toast.loading("Running restore dry-run (no changes will be made)...");

    try {
      const result = await api.restoreBackupDryRun(selectedBackup, restoreComponent);
      setOperationOutput(result.output);

      if (result.success) {
        toast.success(result.message, { id: toastId });
      } else {
        toast.error(result.message, { id: toastId });
      }
    } catch (error) {
      toast.error(`Failed to run restore dry-run: ${(error as Error).message}`, { id: toastId });
    } finally {
      setIsOperationRunning(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Admin Recovery</h1>
        <p style={{ color: "#64748b" }}>
          Manage backups, verify integrity, and restore from backups
        </p>
      </div>

      {/* System Status */}
      {status && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "#f8fafc",
            borderRadius: "8px",
            marginBottom: "2rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Backup System Status</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1rem" }}>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Local Backups</div>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                <div>Daily: {status.localBackups.dailyCount} backups</div>
                <div>Weekly: {status.localBackups.weeklyCount} backups</div>
                <div>Last daily: {status.localBackups.lastDaily}</div>
                <div>Last weekly: {status.localBackups.lastWeekly}</div>
                <div>Total size: {status.localBackups.totalSize}</div>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Remote Backups</div>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                <div>
                  Status: {status.remoteBackups.configured ? (
                    <span style={{ color: "#10b981" }}>✓ Configured</span>
                  ) : (
                    <span style={{ color: "#f59e0b" }}>Not configured</span>
                  )}
                </div>
                {status.remoteBackups.configured && (
                  <>
                    <div>Count: {status.remoteBackups.count} snapshots</div>
                    <div>Last upload: {status.remoteBackups.lastSnapshot}</div>
                  </>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Disk Space</div>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                <div>Available: {status.diskSpace.available}</div>
                <div>Used: {status.diskSpace.used}</div>
                <div>Usage: {status.diskSpace.percentage}</div>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Scheduled Jobs</div>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                {status.cronJobs.length > 0 ? (
                  status.cronJobs.map((job, idx) => (
                    <div key={idx}>{job.schedule} - Backup</div>
                  ))
                ) : (
                  <div>No cron jobs configured</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Backup Actions */}
      <div
        style={{
          padding: "1.5rem",
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          marginBottom: "2rem",
          border: "1px solid #e2e8f0",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Manual Backup</h2>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            onClick={handleTriggerDaily}
            disabled={isOperationRunning}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: "500",
              cursor: isOperationRunning ? "not-allowed" : "pointer",
              opacity: isOperationRunning ? 0.5 : 1,
            }}
          >
            Trigger Daily Backup (Local)
          </button>
          <button
            onClick={handleTriggerWeekly}
            disabled={isOperationRunning}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#8b5cf6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: "500",
              cursor: isOperationRunning ? "not-allowed" : "pointer",
              opacity: isOperationRunning ? 0.5 : 1,
            }}
          >
            Trigger Weekly Backup (Local + Remote)
          </button>
          <button
            onClick={loadData}
            disabled={isOperationRunning}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: "500",
              cursor: isOperationRunning ? "not-allowed" : "pointer",
              opacity: isOperationRunning ? 0.5 : 1,
            }}
          >
            Refresh Status
          </button>
        </div>
        <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#64748b" }}>
          <strong>Note:</strong> Daily backups are incremental (faster). Weekly backups include full volume snapshots and remote upload.
        </div>
      </div>

      {/* Local Backups List */}
      {localBackups && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            marginBottom: "2rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Local Backups</h2>

          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem", fontWeight: "600" }}>Daily Backups</h3>
          {localBackups.daily.length > 0 ? (
            <div style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
              <table style={{ width: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Select</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Name</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Size</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Files</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {localBackups.daily.map((backup) => (
                    <tr key={backup.path} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.75rem" }}>
                        <input
                          type="radio"
                          name="selectedBackup"
                          value={backup.path}
                          checked={selectedBackup === backup.path}
                          onChange={(e) => setSelectedBackup(e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.75rem" }}>{backup.name}</td>
                      <td style={{ padding: "0.75rem" }}>{backup.size}</td>
                      <td style={{ padding: "0.75rem" }}>{backup.files}</td>
                      <td style={{ padding: "0.75rem" }}>{formatDate(backup.modified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "1rem", color: "#64748b", marginBottom: "1.5rem" }}>No daily backups found</div>
          )}

          <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem", fontWeight: "600" }}>Weekly Backups</h3>
          {localBackups.weekly.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Select</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Name</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Size</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Files</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {localBackups.weekly.map((backup) => (
                    <tr key={backup.path} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.75rem" }}>
                        <input
                          type="radio"
                          name="selectedBackup"
                          value={backup.path}
                          checked={selectedBackup === backup.path}
                          onChange={(e) => setSelectedBackup(e.target.value)}
                        />
                      </td>
                      <td style={{ padding: "0.75rem" }}>{backup.name}</td>
                      <td style={{ padding: "0.75rem" }}>{backup.size}</td>
                      <td style={{ padding: "0.75rem" }}>{backup.files}</td>
                      <td style={{ padding: "0.75rem" }}>{formatDate(backup.modified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "1rem", color: "#64748b" }}>No weekly backups found</div>
          )}
        </div>
      )}

      {/* Remote Backups List */}
      {remoteBackups && remoteBackups.configured && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            marginBottom: "2rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Remote Backups</h2>
          {remoteBackups.snapshots.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: "0.875rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Snapshot ID</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Time</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Hostname</th>
                    <th style={{ padding: "0.75rem", textAlign: "left" }}>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {remoteBackups.snapshots.map((snapshot) => (
                    <tr key={snapshot.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{snapshot.id}</td>
                      <td style={{ padding: "0.75rem" }}>{formatDate(snapshot.time)}</td>
                      <td style={{ padding: "0.75rem" }}>{snapshot.hostname}</td>
                      <td style={{ padding: "0.75rem" }}>{snapshot.tags.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "1rem", color: "#64748b" }}>No remote snapshots found</div>
          )}
        </div>
      )}

      {/* Backup Operations */}
      <div
        style={{
          padding: "1.5rem",
          backgroundColor: "#ffffff",
          borderRadius: "8px",
          marginBottom: "2rem",
          border: "1px solid #e2e8f0",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Backup Operations</h2>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Selected Backup:
          </label>
          <div style={{ fontSize: "0.875rem", color: "#64748b", fontFamily: "monospace" }}>
            {selectedBackup || "No backup selected"}
          </div>
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
            Restore Component:
          </label>
          <select
            value={restoreComponent}
            onChange={(e) => setRestoreComponent(e.target.value)}
            style={{
              padding: "0.5rem",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              fontSize: "0.875rem",
              width: "200px",
            }}
          >
            <option value="all">All Components</option>
            <option value="neo4j">Neo4j Only</option>
            <option value="postgres">PostgreSQL Only</option>
            <option value="workspace">Workspace Only</option>
            <option value="config">Config Only</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <button
            onClick={handleVerifyBackup}
            disabled={isOperationRunning || !selectedBackup}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: "500",
              cursor: isOperationRunning || !selectedBackup ? "not-allowed" : "pointer",
              opacity: isOperationRunning || !selectedBackup ? 0.5 : 1,
            }}
          >
            Verify Backup Integrity
          </button>
          <button
            onClick={handleRestoreDryRun}
            disabled={isOperationRunning || !selectedBackup}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#f59e0b",
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: "500",
              cursor: isOperationRunning || !selectedBackup ? "not-allowed" : "pointer",
              opacity: isOperationRunning || !selectedBackup ? 0.5 : 1,
            }}
          >
            Restore (Dry-Run Only)
          </button>
        </div>
        <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#64748b" }}>
          <strong>Note:</strong> Dry-run shows what would be restored without making any changes.
          For actual restoration, use the CLI: <code>/root/airgen/scripts/backup-restore.sh [path]</code>
        </div>
      </div>

      {/* Operation Output */}
      {showOutput && (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "#1e293b",
            borderRadius: "8px",
            border: "1px solid #334155",
            color: "#e2e8f0",
            fontFamily: "monospace",
            fontSize: "0.875rem",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
            maxHeight: "400px",
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
            <strong>Operation Output:</strong>
            <button
              onClick={() => setShowOutput(false)}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              ✕
            </button>
          </div>
          {operationOutput || "No output yet..."}
        </div>
      )}
    </div>
  );
}
