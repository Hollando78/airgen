import { NavLink } from "react-router-dom";
import { TenantProjectProvider } from "../hooks/useTenantProject";
import { TokenControls } from "./TokenControls";
import { UserMenu } from "./UserMenu";
import { useAuth } from "../contexts/AuthContext";
import { FloatingDocumentsProvider } from "../contexts/FloatingDocumentsContext";
import { FloatingDocumentsManager } from "./FloatingDocumentsManager";
import { MobileViewToggle } from "../mobile/components/MobileViewToggle";

export function AppLayout({ children }: { children: React.ReactNode }): JSX.Element {
  const isDevMode = import.meta.env.MODE !== "production";
  const { user } = useAuth();
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/airgen", label: "AIRGen" },
    { to: "/documents", label: "Documents" },
    { to: "/architecture", label: "Architecture" },
    { to: "/interfaces", label: "Interfaces" },
    // { to: "/drafts", label: "Drafts" }, // ARCHIVED: Not production ready
    { to: "/requirements", label: "Requirements" },
    { to: "/baselines", label: "Baselines" },
    { to: "/links", label: "Trace Links" },
    { to: "/requirements-schema", label: "Requirements Schema" },
    { to: "/graph-viewer", label: "Graph Viewer" }
  ];

  if (isDevMode && user?.roles.includes('admin')) {
    links.push({ to: "/admin/users", label: "Admin Users" });
    links.push({ to: "/admin/requirements", label: "Admin Requirements" });
    links.push({ to: "/admin/recovery", label: "Admin Recovery" });
  }

  return (
    <TenantProjectProvider>
      <FloatingDocumentsProvider>
        <div className="app-shell">
          <header className="app-header">
            <div className="app-brand">
              <img src="/AIRGen_logo.png" alt="AIRGen" className="brand-logo-img" />
              <div className="brand-text">
                <span className="brand-logo">AIRGen</span>
                <span className="brand-subtitle">Studio</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
              <MobileViewToggle />
              <TokenControls />
              <UserMenu />
            </div>
          </header>
          <div className="app-body">
            <nav className="app-nav">
              {links.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
            <main className="app-main">{children}</main>
          </div>
        </div>
        
        {/* Render persistent floating document windows */}
        <FloatingDocumentsManager />
      </FloatingDocumentsProvider>
    </TenantProjectProvider>
  );
}
