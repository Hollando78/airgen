import { Spinner } from "../Spinner";
import { ErrorState } from "../ErrorState";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ProjectRecord, ProjectsResponse } from "../../types";

interface ProjectsTableProps {
  projectsQuery: UseQueryResult<ProjectsResponse, Error>;
  onEdit: (project: ProjectRecord) => void;
  onDelete: (project: ProjectRecord) => void;
}

function formatDate(value: string | null | undefined): string {
  if (!value) { return "—"; }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * Projects table with edit/delete actions for the selected tenant
 */
export function ProjectsTable({
  projectsQuery,
  onEdit,
  onDelete
}: ProjectsTableProps) {
  if (projectsQuery.isLoading) {
    return <Spinner />;
  }

  if (projectsQuery.isError) {
    return <ErrorState message={projectsQuery.error.message} />;
  }

  const projects: ProjectRecord[] = projectsQuery.data?.projects ?? [];

  if (projects.length === 0) {
    return (
      <p className="text-neutral-500 text-sm py-4">No projects found for this tenant.</p>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Slug</th>
          <th>Name</th>
          <th>Key</th>
          <th>Requirements</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {projects.map(project => (
          <tr key={project.slug}>
            <td className="font-medium">{project.slug}</td>
            <td>{project.name ?? "—"}</td>
            <td>{project.key ?? "—"}</td>
            <td>{project.requirementCount}</td>
            <td>{formatDate(project.createdAt)}</td>
            <td>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="ghost-button"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => onEdit(project)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="danger-button"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => onDelete(project)}
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
