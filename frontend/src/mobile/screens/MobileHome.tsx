import { Link } from "react-router-dom";
import { TenantProjectSelector } from "../../components/TenantProjectSelector";
import { useTenantProject } from "../../hooks/useTenantProject";

export function MobileHome(): JSX.Element {
  const { state } = useTenantProject();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-900">Select Workspace</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Choose a tenant and project to browse requirements and documents.
        </p>
        <div className="mt-4">
          <TenantProjectSelector />
        </div>
        {state.tenant && state.project && (
          <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
            Viewing {state.tenant}/{state.project}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Quick Links</h2>
        <div className="grid gap-3">
          <Link
            to="/mobile/requirements"
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-neutral-900">Requirements</h3>
            <p className="text-sm text-neutral-600">
              Read-only list of requirements for your selected project.
            </p>
          </Link>
          <Link
            to="/mobile/documents"
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-neutral-900">Documents</h3>
            <p className="text-sm text-neutral-600">
              Browse structured documents generated from the knowledge graph.
            </p>
          </Link>
          <Link
            to="/mobile/admin"
            className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition hover:border-primary/40 hover:shadow-md"
          >
            <h3 className="text-base font-semibold text-neutral-900">Admin Tools</h3>
            <p className="text-sm text-neutral-600">
              Perform lightweight user management tasks on the go.
            </p>
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-neutral-900">Desktop-Only Features</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Authoring, diagram editing, and AI-assisted drafting remain available on the desktop site.
          Use mobile for review, quick lookups, and administrative triage.
        </p>
      </section>
    </div>
  );
}
