import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTenantProject } from "../../hooks/useTenantProject";
import { useApiClient } from "../../lib/client";
import type { RequirementRecord } from "../../types";

export function MobileRequirementsScreen(): JSX.Element {
  const { state } = useTenantProject();
  const api = useApiClient();

  const requirementsQuery = useQuery({
    queryKey: ["mobile-requirements", state.tenant, state.project],
    queryFn: async () => {
      if (!state.tenant || !state.project) {
        return null;
      }
      const result = await api.listRequirements(state.tenant, state.project);
      return result.data;
    },
    enabled: Boolean(state.tenant && state.project)
  });

  const items = useMemo<RequirementRecord[]>(() => requirementsQuery.data ?? [], [requirementsQuery.data]);
  const tenantProjectLabel = state.tenant && state.project ? `${state.tenant}/${state.project}` : null;

  if (!state.tenant || !state.project) {
    return (
      <EmptyState
        title="Select a project"
        message="Choose a tenant and project on the home tab to view requirements in read-only mode."
      />
    );
  }

  if (requirementsQuery.isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-neutral-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading requirements for {tenantProjectLabel}...</p>
      </div>
    );
  }

  if (requirementsQuery.isError) {
    return (
      <ErrorState
        title="Unable to load requirements"
        message={(requirementsQuery.error as Error)?.message ?? "Something went wrong fetching data."}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No requirements yet"
        message="This project has no published requirements. Switch projects or add content from the desktop app."
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-900">Requirements</h2>
        <p className="text-sm text-neutral-600">
          Showing {items.length} items for {tenantProjectLabel}.
        </p>
      </header>

      <ul className="space-y-4">
        {items.map(requirement => (
          <li key={requirement.id}>
            <article className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <header className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary/80">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                      {requirement.ref}
                    </span>
                    {requirement.qaVerdict && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                        {requirement.qaVerdict}
                      </span>
                    )}
                  </span>
                  <h3 className="text-base font-semibold text-neutral-900">
                    {requirement.title || requirement.ref}
                  </h3>
                </div>
              </header>

              <p className="whitespace-pre-wrap text-[0.95rem] leading-6 text-neutral-700">
                {requirement.text}
              </p>

              <div className="grid gap-3 text-xs text-neutral-600">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {requirement.pattern && (
                    <div>
                      <p className="font-semibold text-neutral-700">Pattern</p>
                      <p>{requirement.pattern}</p>
                    </div>
                  )}
                  {requirement.verification && (
                    <div>
                      <p className="font-semibold text-neutral-700">Verification</p>
                      <p>{requirement.verification}</p>
                    </div>
                  )}
                  {requirement.tags && requirement.tags.length > 0 && (
                    <div className="flex-1">
                      <p className="font-semibold text-neutral-700">Tags</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {requirement.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-600">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center shadow-sm">
      <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-600">{message}</p>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 flex-none" />
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm">{message}</p>
        </div>
      </div>
    </div>
  );
}
