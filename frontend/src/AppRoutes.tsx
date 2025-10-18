import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RoleGuard } from "./components/RoleGuard";
import { Spinner } from "./components/Spinner";
import { UserRole } from "./lib/rbac";

// Lazy load route components for better performance
const DashboardRoute = lazy(() => import("./routes/DashboardRoute").then(m => ({ default: m.DashboardRoute })));
const AirGenRoute = lazy(() => import("./routes/AirGenRoute").then(m => ({ default: m.AirGenRoute })));
const AskAirGenRoute = lazy(() => import("./routes/AskAirGenRoute").then(m => ({ default: m.AskAirGenRoute })));
const NaturalLanguageQuery = lazy(() => import("./pages/NaturalLanguageQuery").then(m => ({ default: m.NaturalLanguageQuery })));
const DocumentsRoute = lazy(() => import("./routes/DocumentsRoute").then(m => ({ default: m.DocumentsRoute })));
const ArchitectureRoute = lazy(() => import("./routes/ArchitectureRoute").then(m => ({ default: m.ArchitectureRoute })));
const InterfaceRoute = lazy(() => import("./routes/InterfaceRoute").then(m => ({ default: m.InterfaceRoute })));
const DraftsRoute = lazy(() => import("./routes/DraftsRoute").then(m => ({ default: m.DraftsRoute })));
const RequirementsRoute = lazy(() => import("./routes/RequirementsRoute").then(m => ({ default: m.RequirementsRoute })));
const BaselinesRoute = lazy(() => import("./routes/BaselinesRoute").then(m => ({ default: m.BaselinesRoute })));
const LinksRoute = lazy(() => import("./routes/LinksRoute").then(m => ({ default: m.LinksRoute })));
const RequirementsSchemaRoute = lazy(() => import("./routes/RequirementsSchemaRoute").then(m => ({ default: m.RequirementsSchemaRoute })));
const GraphViewerRoute = lazy(() => import("./routes/GraphViewerRoute").then(m => ({ default: m.GraphViewerRoute })));
const SettingsRoute = lazy(() => import("./routes/SettingsRoute").then(m => ({ default: m.SettingsRoute })));
const AcceptInviteRoute = lazy(() => import("./routes/AcceptInviteRoute").then(m => ({ default: m.AcceptInviteRoute })));

// Admin routes
const AdminUsersRoute = lazy(() => import("./routes/AdminUsersRoute").then(m => ({ default: m.AdminUsersRoute })));
const AdminRequirementsRoute = lazy(() => import("./routes/AdminRequirementsRoute").then(m => ({ default: m.AdminRequirementsRoute })));
const AdminRecoveryRoute = lazy(() => import("./routes/AdminRecoveryRoute"));
const SuperAdminUsersRoute = lazy(() => import("./routes/SuperAdminUsersRoute").then(m => ({ default: m.SuperAdminUsersRoute })));
const TenantAdminUsersRoute = lazy(() => import("./routes/TenantAdminUsersRoute").then(m => ({ default: m.TenantAdminUsersRoute })));

export default function AppRoutes(): JSX.Element {
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner /></div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route path="/invites/accept" element={<AcceptInviteRoute />} />

          {/* AIRGen route - protected */}
          <Route
            path="/airgen"
            element={
              <ProtectedRoute>
                <AirGenRoute />
              </ProtectedRoute>
            }
          />
          <Route path="/ask-airgen" element={<AskAirGenRoute />} />

          {/* Main application routes */}
          <Route path="/query" element={<NaturalLanguageQuery />} />
          <Route path="/documents" element={<DocumentsRoute />} />
          <Route path="/architecture" element={<ArchitectureRoute />} />
          <Route path="/interfaces" element={<InterfaceRoute />} />
          <Route path="/drafts" element={<DraftsRoute />} />
          <Route path="/requirements" element={<RequirementsRoute />} />
          <Route path="/baselines" element={<BaselinesRoute />} />
          <Route path="/links" element={<LinksRoute />} />
          <Route path="/requirements-schema" element={<RequirementsSchemaRoute />} />
          <Route path="/graph-viewer" element={<GraphViewerRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />

          {/* Super-Admin routes - full CRUD for all users */}
          <Route
            path="/super-admin/users"
            element={
              <ProtectedRoute>
                <RoleGuard requireSuperAdmin fallback={<Navigate to="/dashboard" replace />}>
                  <SuperAdminUsersRoute />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          {/* Tenant-Admin routes - full CRUD for tenant users */}
          <Route
            path="/tenant-admin/users"
            element={
              <ProtectedRoute>
                <RoleGuard
                  requireRole={UserRole.TENANT_ADMIN}
                  fallback={<Navigate to="/dashboard" replace />}
                >
                  <TenantAdminUsersRoute />
                </RoleGuard>
              </ProtectedRoute>
            }
          />

          {/* Legacy admin routes - for backwards compatibility */}
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requiredRoles={["admin"]}>
                <AdminUsersRoute />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/requirements"
            element={
              <ProtectedRoute requiredRoles={["admin"]}>
                <AdminRequirementsRoute />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/recovery"
            element={
              <ProtectedRoute requiredRoles={["admin"]}>
                <AdminRecoveryRoute />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}
