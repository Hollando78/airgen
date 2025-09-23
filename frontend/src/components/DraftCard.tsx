import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { REQUIREMENT_PATTERNS, VERIFICATION_METHODS } from "../constants";
import type { DraftItem, RequirementRecord, RequirementPattern, VerificationMethod } from "../types";
import { Spinner } from "./Spinner";
import { ErrorState } from "./ErrorState";

type DraftCardProps = {
  draft: DraftItem;
  tenant: string;
  project: string;
  documentSlug?: string | null;
  onPersist: (payload: {
    tenant: string;
    projectKey: string;
    documentSlug?: string;
    title: string;
    text: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    qaScore?: number;
    qaVerdict?: string;
    suggestions?: string[];
    tags?: string[];
  }) => Promise<RequirementRecord>;
};

export function DraftCard({ draft, tenant, project, documentSlug, onPersist }: DraftCardProps): JSX.Element {
  const api = useApiClient();

  const [text, setText] = useState(draft.text);
  const [title, setTitle] = useState(draft.title);
  const [pattern, setPattern] = useState<RequirementPattern>(draft.pattern);
  const [verification, setVerification] = useState<VerificationMethod>(draft.verification);
  const [tagsRaw, setTagsRaw] = useState<string>("");
  const [qaScore, setQaScore] = useState(draft.qaScore);
  const [qaVerdict, setQaVerdict] = useState(draft.qaVerdict);
  const [qaSuggestions, setQaSuggestions] = useState<string[]>([]);
  const [applyNotes, setApplyNotes] = useState<string[]>([]);
  const [savedRef, setSavedRef] = useState<string | null>(null);

  const applyFixMutation = useMutation({
    mutationFn: (payload: string) => api.applyFix(payload),
    onSuccess: result => {
      setText(result.after);
      setApplyNotes(result.notes);
    }
  });

  const qaMutation = useMutation({
    mutationFn: (payload: string) => api.qa(payload),
    onSuccess: result => {
      setQaScore(result.score);
      setQaVerdict(result.verdict);
      setPattern(result.pattern ?? pattern);
      setVerification(result.verification ?? verification);
      setQaSuggestions(result.suggestions);
    }
  });

  const persistMutation = useMutation({
    mutationFn: async () => {
      const payloadTags = tagsRaw
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);
      return onPersist({
        tenant,
        projectKey: project,
        documentSlug: documentSlug ?? undefined,
        title,
        text,
        pattern,
        verification,
        qaScore,
        qaVerdict,
        suggestions: qaSuggestions,
        tags: payloadTags
      });
    },
    onSuccess: record => {
      setSavedRef(record.ref);
    }
  });

  const handleApplyFix = () => {
    applyFixMutation.mutate(text);
  };

  const handleQa = () => {
    qaMutation.mutate(text);
  };

  const handleSave = () => {
    setSavedRef(null);
    persistMutation.mutate();
  };

  return (
    <article className="draft-card">
      <header className="draft-card__header">
        <div>
          <span className="badge">{draft.source === "llm" ? "LLM" : "Heuristic"}</span>
          <h3>{title}</h3>
        </div>
        <div className="draft-score">
          <span className="score">{qaScore}</span>
          <span className="score-label">QA Score</span>
        </div>
      </header>

      <p className="hint">{draft.rationale}</p>

      <label className="field">
        <span>Requirement text</span>
        <textarea value={text} onChange={event => setText(event.target.value)} rows={5} />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>Pattern</span>
          <select value={pattern} onChange={event => setPattern(event.target.value as RequirementPattern)}>
            {REQUIREMENT_PATTERNS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Verification</span>
          <select
            value={verification}
            onChange={event => setVerification(event.target.value as VerificationMethod)}
          >
            {VERIFICATION_METHODS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tags</span>
          <input
            value={tagsRaw}
            placeholder="comma separated"
            onChange={event => setTagsRaw(event.target.value)}
          />
        </label>
      </div>

      <div className="draft-actions">
        <button type="button" onClick={handleApplyFix} disabled={applyFixMutation.isPending}>
          {applyFixMutation.isPending ? "Applying..." : "Smart Fix"}
        </button>
        <button type="button" onClick={handleQa} disabled={qaMutation.isPending}>
          {qaMutation.isPending ? "Checking..." : "Re-run QA"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={persistMutation.isPending || !text.trim() || !title.trim()}
        >
          {persistMutation.isPending ? "Saving..." : "Save Requirement"}
        </button>
      </div>

      <div className="draft-footer">
        <p className="verdict">{qaVerdict}</p>
        {applyNotes.length > 0 && (
          <ul className="notes">
            {applyNotes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        )}
        {qaSuggestions.length > 0 && (
          <div className="suggestions">
            <h4>Suggestions</h4>
            <ul>
              {qaSuggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
        {persistMutation.isError && <ErrorState message={(persistMutation.error as Error).message} />}
        {savedRef && <p className="success">Saved as {savedRef}</p>}
      </div>

      {(applyFixMutation.isError || qaMutation.isError) && (
        <ErrorState message={((applyFixMutation.error ?? qaMutation.error) as Error).message} />
      )}

      {(applyFixMutation.isPending || qaMutation.isPending || persistMutation.isPending) && <Spinner />}
    </article>
  );
}
