import { useState, useEffect } from "react";
import { useApiClient } from "../lib/client";
import { toast } from "sonner";
import { PageLayout } from "../components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../components/ui/table";
import { Database, HardDrive, Cloud, Calendar, RefreshCw, Shield, AlertTriangle } from "lucide-react";
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
    <PageLayout
      title="Admin Recovery"
      description="Manage backups, verify integrity, and restore from backups"
      maxWidth="7xl"
    >
      <div className="space-y-6">
        {/* System Status */}
        {status && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Backup System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="flex items-center gap-2 font-semibold mb-3">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Local Backups
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>Daily: {status.localBackups.dailyCount} backups</div>
                    <div>Weekly: {status.localBackups.weeklyCount} backups</div>
                    <div>Last daily: {status.localBackups.lastDaily}</div>
                    <div>Last weekly: {status.localBackups.lastWeekly}</div>
                    <div>Total size: {status.localBackups.totalSize}</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-semibold mb-3">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    Remote Backups
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      Status:{" "}
                      {status.remoteBackups.configured ? (
                        <span className="text-success font-medium">✓ Configured</span>
                      ) : (
                        <span className="text-warning font-medium">Not configured</span>
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
                  <div className="flex items-center gap-2 font-semibold mb-3">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Disk Space
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>Available: {status.diskSpace.available}</div>
                    <div>Used: {status.diskSpace.used}</div>
                    <div>Usage: {status.diskSpace.percentage}</div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-semibold mb-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Scheduled Jobs
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
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
            </CardContent>
          </Card>
        )}

        {/* Manual Backup Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Manual Backup</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                onClick={handleTriggerDaily}
                disabled={isOperationRunning}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Database className="h-4 w-4 mr-2" />
                Trigger Daily Backup (Local)
              </Button>
              <Button
                onClick={handleTriggerWeekly}
                disabled={isOperationRunning}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Cloud className="h-4 w-4 mr-2" />
                Trigger Weekly Backup (Local + Remote)
              </Button>
              <Button
                onClick={loadData}
                disabled={isOperationRunning}
                variant="secondary"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
            </div>
            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
              <strong>Note:</strong> Daily backups are incremental (faster). Weekly backups include full volume snapshots and remote upload.
            </div>
          </CardContent>
        </Card>

        {/* Local Backups List */}
        {localBackups && (
          <Card>
            <CardHeader>
              <CardTitle>Local Backups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-base font-semibold mb-3">Daily Backups</h3>
                {localBackups.daily.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Select</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Files</TableHead>
                          <TableHead>Modified</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {localBackups.daily.map((backup) => (
                          <TableRow key={backup.path}>
                            <TableCell>
                              <input
                                type="radio"
                                name="selectedBackup"
                                value={backup.path}
                                checked={selectedBackup === backup.path}
                                onChange={(e) => setSelectedBackup(e.target.value)}
                                className="cursor-pointer"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{backup.name}</TableCell>
                            <TableCell>{backup.size}</TableCell>
                            <TableCell>{backup.files}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(backup.modified)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4">No daily backups found</p>
                )}
              </div>

              <div>
                <h3 className="text-base font-semibold mb-3">Weekly Backups</h3>
                {localBackups.weekly.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Select</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Files</TableHead>
                          <TableHead>Modified</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {localBackups.weekly.map((backup) => (
                          <TableRow key={backup.path}>
                            <TableCell>
                              <input
                                type="radio"
                                name="selectedBackup"
                                value={backup.path}
                                checked={selectedBackup === backup.path}
                                onChange={(e) => setSelectedBackup(e.target.value)}
                                className="cursor-pointer"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{backup.name}</TableCell>
                            <TableCell>{backup.size}</TableCell>
                            <TableCell>{backup.files}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(backup.modified)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4">No weekly backups found</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Remote Backups List */}
        {remoteBackups && remoteBackups.configured && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5" />
                Remote Backups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {remoteBackups.snapshots.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Snapshot ID</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Hostname</TableHead>
                        <TableHead>Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {remoteBackups.snapshots.map((snapshot) => (
                        <TableRow key={snapshot.id}>
                          <TableCell className="font-mono text-xs">{snapshot.id}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(snapshot.time)}</TableCell>
                          <TableCell>{snapshot.hostname}</TableCell>
                          <TableCell className="text-sm">{snapshot.tags.join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={Cloud}
                  title="No remote snapshots found"
                  description="Remote backups will appear here after weekly backup runs."
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Backup Operations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Backup Operations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Selected Backup:
              </label>
              <div className="text-sm text-muted-foreground font-mono bg-muted p-2 rounded-md">
                {selectedBackup || "No backup selected"}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Restore Component:
              </label>
              <select
                value={restoreComponent}
                onChange={(e) => setRestoreComponent(e.target.value)}
                className="w-full md:w-64 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="all">All Components</option>
                <option value="neo4j">Neo4j Only</option>
                <option value="postgres">PostgreSQL Only</option>
                <option value="workspace">Workspace Only</option>
                <option value="config">Config Only</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleVerifyBackup}
                disabled={isOperationRunning || !selectedBackup}
                className="bg-green-600 hover:bg-green-700"
              >
                <Shield className="h-4 w-4 mr-2" />
                Verify Backup Integrity
              </Button>
              <Button
                onClick={handleRestoreDryRun}
                disabled={isOperationRunning || !selectedBackup}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Restore (Dry-Run Only)
              </Button>
            </div>

            <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
              <strong>Note:</strong> Dry-run shows what would be restored without making any changes.
              For actual restoration, use the CLI: <code className="bg-background px-1 rounded">/root/airgen/scripts/backup-restore.sh [path]</code>
            </div>
          </CardContent>
        </Card>

        {/* Operation Output */}
        {showOutput && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-200">Operation Output</CardTitle>
                <button
                  onClick={() => setShowOutput(false)}
                  className="text-slate-400 hover:text-slate-200 transition-colors"
                >
                  ✕
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-slate-200 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                {operationOutput || "No output yet..."}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
