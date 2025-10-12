import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTenantProject } from "../../hooks/useTenantProject";
import { useApiClient } from "../../lib/client";

export function MobileDocumentsScreen(): JSX.Element {
  const { state } = useTenantProject();
  const api = useApiClient();

  const documentsQuery = useQuery({
    queryKey: ["mobile-documents", state.tenant, state.project],
    queryFn: async () => {
      if (!state.tenant || !state.project) {
        return null;
      }
      const response = await api.listDocuments(state.tenant, state.project);
      return response.documents;
    },
    enabled: Boolean(state.tenant && state.project)
  });

  const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);

  if (!state.tenant || !state.project) {
    return (
      <EmptyState
        title="Select a project"
        description="Choose a tenant and project on the home tab to browse documents."
      />
    );
  }

  if (documentsQuery.isLoading) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-neutral-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading documents…</p>
      </div>
    );
  }

  if (documentsQuery.isError) {
    return (
      <ErrorState
        title="Failed to load documents"
        description={(documentsQuery.error as Error)?.message ?? "Please try again later."}
      />
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        title="No documents"
        description="This project has no structured documents yet. Author them from the desktop app."
      />
    );
  }

  return (
    <div className="space-y-3">
      {documents.map(doc => (
        <article key={doc.slug} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-semibold text-neutral-900">{doc.name}</h3>
          {doc.description && (
            <p className="mt-1 text-sm text-neutral-600">{doc.description}</p>
          )}
          <dl className="mt-3 text-xs text-neutral-500">
            <div className="flex items-center justify-between">
              <dt>Requirements</dt>
              <dd>{doc.requirementCount ?? 0}</dd>
            </div>
            {doc.updatedAt && (
              <div className="mt-1 flex items-center justify-between">
                <dt>Updated</dt>
                <dd>{new Date(doc.updatedAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
            Diagram editing and markdown authoring are available on desktop. Mobile shows metadata only.
          </p>
        </article>
      ))}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center shadow-sm">
      <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-600">{description}</p>
    </div>
  );
}

function ErrorState({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}
