import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useTenantProject } from "../../hooks/useTenantProject";
import { useApiClient } from "../../lib/client";
import type { RequirementCandidate } from "../../types";
import { MobileLoadingOverlay } from "../components/MobileLoadingOverlay";

export function MobileAirGenScreen(): JSX.Element {
  const { state } = useTenantProject();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");

  const tenant = state.tenant ?? "";
  const project = state.project ?? "";

  // Fetch all historical candidates
  const candidatesQuery = useQuery({
    queryKey: ["airgen", "candidates", "grouped", tenant, project],
    queryFn: () => api.listRequirementCandidatesGrouped(tenant, project),
    enabled: Boolean(tenant && project)
  });

  const draftMutation = useMutation({
    mutationFn: () =>
      api.airgenChat({
        tenant,
        projectKey: project,
        user_input: prompt,
        mode: "requirements",
        n: 3
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
      setPrompt("");
    }
  });

  // Flatten all candidates from all groups
  const candidates: RequirementCandidate[] = useMemo(() => {
    const groups = candidatesQuery.data?.groups ?? [];
    return groups.flatMap(group => group.candidates);
  }, [candidatesQuery.data]);

  const canSubmit = prompt.trim().length >= 12 && !draftMutation.isPending && !!state.tenant && !!state.project;

  // Show workspace selection prompt if no tenant/project selected
  // Keep this after all hooks to comply with Rules of Hooks
  const showWorkspacePrompt = !state.tenant || !state.project;

  return (
    <div className="space-y-4">
      {showWorkspacePrompt ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center shadow-sm">
          <h3 className="text-base font-semibold text-neutral-900">Select a workspace</h3>
          <p className="mt-2 text-sm text-neutral-600">
            Choose a tenant and project on the home tab to generate requirement drafts.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-neutral-900">Generate drafts</h2>
                <p className="text-sm text-neutral-600">
                  Describe what you need. AIRGen will propose requirement summaries and candidates. Finalize on desktop.
                </p>
              </div>
            </div>

            <form
              className="mt-4 space-y-3"
              onSubmit={event => {
                event.preventDefault();
                if (canSubmit) {
                  draftMutation.mutate();
                }
              }}
            >
              <label className="block space-y-2">
                <span className="text-sm font-medium text-neutral-700">Need / Context</span>
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  rows={4}
                  placeholder="As a pilot, I need to..."
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-xs text-neutral-500">
                  At least 12 characters. Include actor, trigger, and response for best results.
                </span>
              </label>

              {draftMutation.isError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {(draftMutation.error as Error)?.message ?? "Failed to generate suggestions. Try again later."}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start AIRGen
              </button>
            </form>
          </section>

          {candidatesQuery.isLoading ? (
            <div className="rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-neutral-600">Loading candidates...</p>
            </div>
          ) : (
            <CandidateGroups candidates={candidates} />
          )}

          {draftMutation.isPending && <MobileLoadingOverlay message="AIRGen is preparing candidates…" />}
        </>
      )}
    </div>
  );
}

type CandidateGroupsProps = {
  candidates: RequirementCandidate[];
};

function CandidateGroups({ candidates }: CandidateGroupsProps): JSX.Element | null {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const grouped = useMemo(() => {
    if (candidates.length === 0) {
      return [];
    }
    const groups = candidates.reduce((acc, candidate) => {
      const sessionId = candidate.querySessionId || "latest";
      if (!acc.has(sessionId)) {
        acc.set(sessionId, []);
      }
      acc.get(sessionId)!.push(candidate);
      return acc;
    }, new Map<string, RequirementCandidate[]>());

    return Array.from(groups.entries())
      .map(([sessionId, items]) => ({
        sessionId,
        createdAt: new Date(items[0]?.createdAt ?? Date.now()).getTime(),
        items: items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [candidates]);

  if (grouped.length === 0) {
    return null;
  }

  useEffect(() => {
    if (grouped.length > 0) {
      setExpandedGroup(grouped[0].sessionId);
    }
  }, [grouped]);

  return (
    <section className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Requirement Candidates
      </h3>
      <ul className="space-y-3">
        {grouped.map(group => {
          const isExpanded = expandedGroup === group.sessionId;
          return (
            <li key={group.sessionId} className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setExpandedGroup(isExpanded ? null : group.sessionId)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">
                    Session {group.sessionId === "latest" ? "" : group.sessionId.slice(0, 6)}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {group.items.length} {group.items.length === 1 ? "candidate" : "candidates"} ·{" "}
                    {new Date(group.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="text-sm font-semibold text-primary">
                  {isExpanded ? "Hide" : "Show"}
                </span>
              </button>
              {isExpanded && (
                <div className="space-y-3 border-t border-neutral-200 px-4 py-3">
                  {group.items.map(candidate => (
                    <article key={candidate.id} className="space-y-3 rounded-xl border border-neutral-200 px-3 py-3">
                      <header className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary/80">
                          Candidate
                          {candidate.qaVerdict && (
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                              {candidate.qaVerdict}
                            </span>
                          )}
                        </span>
                        <time className="text-[11px] text-neutral-500">
                          {new Date(candidate.createdAt).toLocaleTimeString()}
                        </time>
                      </header>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-neutral-800">
                        {candidate.text}
                      </p>
                      {((candidate.suggestions?.length ?? 0) > 0 || (candidate.qa?.suggestions.length ?? 0) > 0) && (
                        <div className="space-y-1 rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
                          <p className="font-semibold text-neutral-700">Suggestions</p>
                          <ul className="list-disc space-y-1 pl-4">
                            {(candidate.suggestions ?? candidate.qa?.suggestions ?? []).map((suggestion, index) => (
                              <li key={`${candidate.id}-suggestion-${index}`}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="rounded-xl bg-neutral-100 px-4 py-3 text-xs text-neutral-600">
        Save and refine requirements from the desktop AIRGen console to add them to your project.
      </p>
    </section>
  );
}
