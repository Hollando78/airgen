import { NavLink } from "react-router-dom";
import { TenantProjectProvider } from "../hooks/useTenantProject";
import { TokenControls } from "./TokenControls";
import { TenantProjectDocumentSelector } from "./TenantProjectDocumentSelector";

export function AppLayout({ children }: { children: React.ReactNode }): JSX.Element {
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/documents", label: "Documents" },
    { to: "/architecture", label: "Architecture" },
    { to: "/drafts", label: "Drafts" },
    { to: "/requirements", label: "Requirements" },
    { to: "/baselines", label: "Baselines" },
    { to: "/links", label: "Trace Links" }
  ];

  return (
    <TenantProjectProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-brand">
            <span className="brand-logo">AIRGen</span>
            <span className="brand-subtitle">Studio</span>
          </div>
          <TenantProjectDocumentSelector />
          <TokenControls />
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
    </TenantProjectProvider>
  );
}
