import { Spinner } from "../Spinner";
import { ErrorState } from "../ErrorState";
import type { UseQueryResult } from "@tanstack/react-query";

interface HealthData {
  ok: boolean;
  env: string;
  workspace: string;
  time: string;
}

interface SystemHealthCardProps {
  healthQuery: UseQueryResult<HealthData, Error>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) { return "—"; }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

/**
 * System health card displaying environment, workspace, and server time
 */
export function SystemHealthCard({ healthQuery }: SystemHealthCardProps) {
  if (healthQuery.isLoading) {
    return <Spinner />;
  }

  if (healthQuery.isError) {
    return <ErrorState message={healthQuery.error.message} />;
  }

  if (!healthQuery.data) {
    return null;
  }

  const { env, workspace, time } = healthQuery.data;

  return (
    <div className="grid grid-cols-3">
      <div className="stat-card">
        <span className="stat-label">Environment</span>
        <span className="stat-value">{env}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Workspace</span>
        <span className="stat-value">{workspace}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Server Time</span>
        <span className="stat-value">{formatDate(time)}</span>
      </div>
    </div>
  );
}
