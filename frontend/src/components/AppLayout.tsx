import { NavLink } from "react-router-dom";
import { TenantProjectProvider } from "../hooks/useTenantProject";
import { TokenControls } from "./TokenControls";
import { TenantProjectSelector } from "./TenantProjectSelector";
import { UserMenu } from "./UserMenu";
import { useAuth } from "../contexts/AuthContext";
import { FloatingDocumentsProvider } from "../contexts/FloatingDocumentsContext";
import { FloatingDocumentsManager } from "./FloatingDocumentsManager";

export function AppLayout({ children }: { children: React.ReactNode }): JSX.Element {
  const isDevMode = import.meta.env.MODE !== "production";
  const { user } = useAuth();
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/airgen", label: "AIRGen" },
    { to: "/documents", label: "Documents" },
    { to: "/architecture", label: "Architecture" },
    { to: "/interfaces", label: "Interfaces" },
    { to: "/drafts", label: "Drafts" },
    { to: "/requirements", label: "Requirements" },
    { to: "/baselines", label: "Baselines" },
    { to: "/links", label: "Trace Links" },
    { to: "/requirements-schema", label: "Requirements Schema" }
  ];

  if (isDevMode && user?.roles.includes('admin')) {
    links.push({ to: "/admin/users", label: "Admin Users" });
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
            <TenantProjectSelector />
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
