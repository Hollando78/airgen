import type { FormEvent} from "react";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { DraftCard } from "../components/DraftCard";
import { REQUIREMENT_PATTERNS, VERIFICATION_METHODS } from "../constants";
import type { DraftRequest, RequirementRecord, RequirementPattern, VerificationMethod } from "../types";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";

const DEFAULT_COUNT = 3;

export function DraftsRoute(): JSX.Element {
  const api = useApiClient();
  const { tenant, project, documentSlug } = useTenantProjectDocument();
  const queryClient = useQueryClient();

  const [need, setNeed] = useState("");
  const [pattern, setPattern] = useState<string>("");
  const [verification, setVerification] = useState<string>("Test");
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [useLlm, setUseLlm] = useState<boolean>(false);
  const [actor, setActor] = useState("");
  const [system, setSystem] = useState("");
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [constraint, setConstraint] = useState("");

  const draftMutation = useMutation({
    mutationFn: (payload: DraftRequest) => api.draft(payload)
  });

  type PersistPayload = {
    tenant: string;
    projectKey: string;
    text: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    qaScore?: number;
    qaVerdict?: string;
    suggestions?: string[];
    tags?: string[];
  };

  const persistRequirement = useMutation({
    mutationFn: async (payload: PersistPayload) => {
      const result = await api.createRequirement(payload);
      await queryClient.invalidateQueries({ queryKey: ["requirements", payload.tenant, payload.projectKey] });
      await queryClient.invalidateQueries({ queryKey: ["projects", payload.tenant] });
      return result.requirement;
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload: DraftRequest = {
      need,
      useLlm,
      count,
      pattern: pattern ? (pattern as DraftRequest["pattern"]) : undefined,
      verification: verification ? (verification as DraftRequest["verification"]) : undefined,
      actor: actor || undefined,
      system: system || undefined,
      trigger: trigger || undefined,
      response: response || undefined,
      constraint: constraint || undefined
    };
    draftMutation.mutate(payload);
  };

  const drafts = draftMutation.data?.items ?? [];
  const llmError = draftMutation.data?.meta.llm.error;

  const canGenerate = need.trim().length >= 12;
  const missingSelection = !tenant || !project;

  return (
    <div className="panel-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Draft Generator</h1>
            <p>Capture the stakeholder need and generate requirement candidates.</p>
          </div>
        </div>
        <form className="draft-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Need / context</span>
            <textarea
              value={need}
              onChange={event => setNeed(event.target.value)}
              rows={4}
              placeholder="As a driver..."
              required
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>Pattern</span>
              <select value={pattern} onChange={event => setPattern(event.target.value)}>
                <option value="">Auto</option>
                {REQUIREMENT_PATTERNS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Verification</span>
              <select value={verification} onChange={event => setVerification(event.target.value)}>
                {VERIFICATION_METHODS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Draft count</span>
              <input
                type="number"
                min={1}
                max={5}
                value={count}
                onChange={event => setCount(Number(event.target.value))}
              />
            </label>

            <label className="checkbox">
              <input type="checkbox" checked={useLlm} onChange={event => setUseLlm(event.target.checked)} />
              <span>Include LLM drafts</span>
            </label>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Actor</span>
              <input value={actor} onChange={event => setActor(event.target.value)} placeholder="e.g., user, admin, customer" />
            </label>
            <label className="field">
              <span>System</span>
              <input value={system} onChange={event => setSystem(event.target.value)} placeholder="e.g., user interface, payment system" />
            </label>
            <label className="field">
              <span>Trigger</span>
              <input value={trigger} onChange={event => setTrigger(event.target.value)} placeholder="e.g., user clicks button, timeout occurs" />
            </label>
            <label className="field">
              <span>Response</span>
              <input value={response} onChange={event => setResponse(event.target.value)} placeholder="e.g., display confirmation, send notification" />
            </label>
            <label className="field">
              <span>Constraint</span>
              <input value={constraint} onChange={event => setConstraint(event.target.value)} placeholder="e.g., within 3 seconds, under 100ms" />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={!canGenerate || draftMutation.isPending}>
              {draftMutation.isPending ? "Generating..." : "Generate drafts"}
            </button>
            {missingSelection && (
              <span className="hint">Select tenant and project to enable saving.</span>
            )}
          </div>
        </form>
        {draftMutation.isError && <ErrorState message={(draftMutation.error as Error).message} />}
        {llmError && <div className="alert alert-warn">LLM error: {llmError}</div>}
      </section>

      {draftMutation.isPending && <Spinner />}

      {drafts.length > 0 && tenant && project && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Drafts</h2>
              <p>Review, adjust, run QA, and persist requirements.</p>
            </div>
          </div>
          <div className="draft-grid">
            {drafts.map((draft, index) => (
              <DraftCard
                key={`${draft.source}-${index}`}
                draft={draft}
                tenant={tenant!}
                project={project!}
                documentSlug={documentSlug}
                onPersist={async payload => persistRequirement.mutateAsync(payload)}
              />
            ))}
          </div>
        </section>
      )}

      {drafts.length === 0 && draftMutation.isSuccess && (
        <section className="panel">
          <p>No drafts generated. Try refining the need or parameters.</p>
        </section>
      )}
    </div>
  );
}
