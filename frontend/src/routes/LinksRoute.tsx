import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProject } from "../hooks/useTenantProject";
import { ErrorState } from "../components/ErrorState";

export function LinksRoute(): JSX.Element {
  const api = useApiClient();
  const { state } = useTenantProject();
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(3);

  const suggestMutation = useMutation({
    mutationFn: () => {
      if (!state.tenant || !state.project) {
        throw new Error("Select a tenant and project before requesting suggestions.");
      }
      return api.suggestLinks({
        tenant: state.tenant,
        project: state.project,
        text,
        limit
      });
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    suggestMutation.mutate();
  };

  if (!state.tenant || !state.project) {
    return (
      <div className="panel">
        <h1>Trace Links</h1>
        <p>Select a tenant and project first.</p>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Trace Link Suggestions</h1>
            <p>Provide requirement text to locate related artifacts.</p>
          </div>
        </div>

        <form className="link-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Requirement text</span>
            <textarea
              value={text}
              onChange={event => setText(event.target.value)}
            rows={4}
            placeholder="Paste requirement text to analyze"
            required
          />
        </label>
        <label className="field field--inline">
          <span>Limit</span>
          <input
            type="number"
            min={1}
            max={10}
            value={limit}
            onChange={event => setLimit(Number(event.target.value))}
          />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={suggestMutation.isPending || text.trim().length < 10}>
            {suggestMutation.isPending ? "Finding..." : "Suggest links"}
          </button>
        </div>
      </form>

        {suggestMutation.isError && <ErrorState message={(suggestMutation.error as Error).message} />}
      </section>

      {suggestMutation.data && (
        <section className="panel">
          <h2>Suggestions</h2>
          {suggestMutation.data.suggestions.length === 0 ? (
            <p>No related requirements found.</p>
          ) : (
            <ul className="suggestion-list">
              {suggestMutation.data.suggestions.map(item => (
                <li key={item.ref}>
                  <strong>{item.ref}</strong> – {item.title}
                  <div className="path">{item.path}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
