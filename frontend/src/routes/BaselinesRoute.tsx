import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

export function BaselinesRoute(): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState("");
  const [author, setAuthor] = useState("");

  const baselinesQuery = useQuery({
    queryKey: ["baselines", state.tenant, state.project],
    queryFn: () => api.listBaselines(state.tenant ?? "", state.project ?? ""),
    enabled: Boolean(state.tenant && state.project)
  });

  const createBaselineMutation = useMutation({
    mutationFn: async (payload: { label?: string; author?: string }) => {
      if (!state.tenant || !state.project) {
        throw new Error("Select a tenant and project first.");
      }
      const result = await api.createBaseline({
        tenant: state.tenant,
        projectKey: state.project,
        label: payload.label,
        author: payload.author
      });
      await queryClient.invalidateQueries({ queryKey: ["baselines", state.tenant, state.project] });
      return result.baseline;
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createBaselineMutation.mutate({
      label: label || undefined,
      author: author || undefined
    });
  };

  if (!state.tenant || !state.project) {
    return (
      <div className="panel">
        <h1>Baselines</h1>
        <p>Select a tenant and project to manage baselines.</p>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Baselines</h1>
            <p>
              {state.tenant} / {state.project}
            </p>
          </div>
        </div>

        <form className="baseline-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Label</span>
            <input value={label} onChange={event => setLabel(event.target.value)} placeholder="Release 1.0" />
          </label>
          <label className="field">
            <span>Author</span>
            <input value={author} onChange={event => setAuthor(event.target.value)} placeholder="Jane Doe" />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={createBaselineMutation.isPending}>
              {createBaselineMutation.isPending ? "Creating..." : "Create baseline"}
            </button>
          </div>
        </form>
        {createBaselineMutation.isError && <ErrorState message={(createBaselineMutation.error as Error).message} />}
        {createBaselineMutation.isSuccess && (
          <div className="alert alert-success">Baseline {createBaselineMutation.data.ref} created.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>History</h2>
        </div>
        {baselinesQuery.isLoading ? (
          <Spinner />
        ) : baselinesQuery.isError ? (
          <ErrorState message={(baselinesQuery.error as Error).message} />
        ) : baselinesQuery.data?.items.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Created</th>
                <th>Author</th>
                <th>Label</th>
                <th>Requirements</th>
              </tr>
            </thead>
            <tbody>
              {baselinesQuery.data.items.map(item => (
                <tr key={item.ref}>
                  <td>{item.ref}</td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>{item.author ?? "—"}</td>
                  <td>{item.label ?? "—"}</td>
                  <td>{item.requirementRefs.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No baselines created yet.</p>
        )}
      </section>
    </div>
  );
}
