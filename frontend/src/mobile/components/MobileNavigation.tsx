import { NavLink } from "react-router-dom";
import { FileText, Home, Users, LayoutDashboard, Wand2 } from "lucide-react";

const NAV_ITEMS = [
  { to: "/mobile", label: "Home", icon: Home },
  { to: "/mobile/requirements", label: "Requirements", icon: FileText },
  { to: "/mobile/documents", label: "Documents", icon: LayoutDashboard },
  { to: "/mobile/airgen", label: "AIRGen", icon: Wand2 },
  { to: "/mobile/admin", label: "Admin", icon: Users }
] as const;

export function MobileNavigation(): JSX.Element {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <ul className="flex items-stretch justify-around">
        {NAV_ITEMS.map(item => (
          <li key={item.to} className="flex-1">
            <NavLink
              to={item.to}
              end={item.to === "/mobile"}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-700"
                ].join(" ")
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
