import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Bot,
  Sparkles,
  Search,
  FileText,
  ListChecks,
  Layers,
  GitBranch,
  Share2,
  Box,
  Network,
  ShieldCheck,
  Crown,
  Building2,
  Users,
  ClipboardList,
  RefreshCw,
  ChevronDown
} from "lucide-react";
import { TenantProjectProvider } from "../hooks/useTenantProject";
import { TokenControls } from "./TokenControls";
import { UserMenu } from "./UserMenu";
import { useAuth } from "../contexts/AuthContext";
import { useUserRole } from "../hooks/useUserRole";
import { UserRole } from "../lib/rbac";
import { FloatingDocumentsProvider } from "../contexts/FloatingDocumentsContext";
import { FloatingDocumentsManager } from "./FloatingDocumentsManager";
import { MobileViewToggle } from "../mobile/components/MobileViewToggle";

 type NavItemConfig = {
  to: string;
  label: string;
  icon: LucideIcon;
  visible?: boolean;
};

 type NavSectionConfig = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItemConfig[];
};

export function AppLayout({ children }: { children: React.ReactNode }): JSX.Element {
  const isDevMode = import.meta.env.MODE !== "production";
  const { user } = useAuth();
  const { isSuperAdmin, hasRole } = useUserRole();
  const location = useLocation();

  const navSections = useMemo<NavSectionConfig[]>(() => {
    const sections: NavSectionConfig[] = [
      {
        id: "workspace",
        label: "Workspace",
        icon: LayoutDashboard,
        items: [
          { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { to: "/airgen", label: "AIRGen", icon: Bot },
          { to: "/ask-airgen", label: "Ask AIRGen", icon: Sparkles },
          { to: "/query", label: "Query", icon: Search }
        ]
      },
      {
        id: "models",
        label: "System Models",
        icon: Network,
        items: [
          { to: "/architecture", label: "Architecture", icon: Box },
          { to: "/interfaces", label: "Interfaces", icon: Network }
        ]
      },
      {
        id: "requirements",
        label: "Requirements",
        icon: FileText,
        items: [
          { to: "/documents", label: "Documents", icon: FileText },
          { to: "/requirements", label: "Requirements", icon: ListChecks },
          { to: "/baselines", label: "Baselines", icon: Layers },
          { to: "/links", label: "Trace Links", icon: GitBranch },
          { to: "/requirements-schema", label: "Requirements Schema", icon: Share2 },
          { to: "/graph-viewer", label: "Graph Viewer", icon: Network }
        ]
      }
    ];

    const adminItems: NavItemConfig[] = [];

    if (isSuperAdmin()) {
      adminItems.push({ to: "/super-admin/users", label: "Super Admin Users", icon: Crown, visible: true });
    }

    if (hasRole(UserRole.TENANT_ADMIN)) {
      adminItems.push({ to: "/tenant-admin/users", label: "Tenant Admin Users", icon: Building2, visible: true });
    }

    if (user?.roles?.includes("admin")) {
      adminItems.push(
        { to: "/admin/users", label: "Admin Users", icon: Users, visible: true },
        { to: "/admin/requirements", label: "Admin Requirements", icon: ClipboardList, visible: true },
        { to: "/admin/recovery", label: "Admin Recovery", icon: RefreshCw, visible: true }
      );
    }

    const filteredAdminItems = adminItems.filter(item => item.visible ?? true);
    if (filteredAdminItems.length > 0) {
      sections.push({
        id: "administration",
        label: "Administration",
        icon: ShieldCheck,
        items: filteredAdminItems
      });
    }

    return sections
      .map(section => ({
        ...section,
        items: section.items.filter(item => item.visible ?? true)
      }))
      .filter(section => section.items.length > 0);
  }, [hasRole, isSuperAdmin, user?.roles]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOpenSections(prev => {
      const next: Record<string, boolean> = {};
      navSections.forEach(section => {
        const hasActive = section.items.some(item => location.pathname.startsWith(item.to));
        const previous = prev[section.id];
        next[section.id] = hasActive ? true : previous ?? false;
      });
      return next;
    });
  }, [navSections, location.pathname]);

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

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
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginLeft: "auto" }}>
              <MobileViewToggle />
              <TokenControls />
              <UserMenu />
            </div>
          </header>
          <div className="app-body">
            <nav className="app-nav">
              {navSections.map(section => {
                const SectionIcon = section.icon;
                const isOpen = openSections[section.id];
                return (
                  <div className="nav-section" key={section.id}>
                    <button
                      type="button"
                      className="nav-section-header"
                      onClick={() => toggleSection(section.id)}
                      aria-expanded={isOpen ?? false}
                    >
                      <span className="nav-section-title">
                        <SectionIcon size={16} />
                        <span>{section.label}</span>
                      </span>
                      <ChevronDown
                        size={16}
                        className={`nav-section-chevron ${isOpen ? "open" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                    <div className={`nav-section-items ${isOpen ? "open" : "closed"}`}>
                      {section.items.map(item => {
                        const ItemIcon = item.icon;
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                              `nav-link nav-item${isActive ? " active" : ""}`
                            }
                          >
                            <ItemIcon size={16} className="nav-item-icon" />
                            <span>{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
