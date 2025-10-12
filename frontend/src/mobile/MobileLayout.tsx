import { Outlet, useNavigate } from "react-router-dom";
import { TenantProjectProvider } from "../hooks/useTenantProject";
import { MobileNavigation } from "./components/MobileNavigation";
import { disableMobileRedirectPreference } from "./useMobileRedirect";

export function MobileLayout(): JSX.Element {
  const navigate = useNavigate();

  const handleViewDesktop = () => {
    disableMobileRedirectPreference();
    navigate("/dashboard", { replace: true });
  };

  return (
    <TenantProjectProvider>
      <div className="flex min-h-screen flex-col bg-neutral-50">
        <header className="sticky top-0 z-20 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-primary/80">AIRGen</p>
              <h1 className="text-lg font-semibold text-neutral-900">Mobile Viewer</h1>
            </div>
            <button
              type="button"
              onClick={handleViewDesktop}
              className="rounded-full border border-primary/30 px-3 py-1 text-xs font-semibold text-primary transition hover:border-primary hover:bg-primary/10"
            >
              View desktop site
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 pb-20 pt-4">
          <Outlet />
        </main>

        <MobileNavigation />
      </div>
    </TenantProjectProvider>
  );
}
