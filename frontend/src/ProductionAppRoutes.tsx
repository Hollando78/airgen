import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DraftsRoute } from "./routes/DraftsRoute";
import { RequirementsRoute } from "./routes/RequirementsRoute";
import { BaselinesRoute } from "./routes/BaselinesRoute";
import { DashboardRoute } from "./routes/DashboardRoute";
import { LinksRoute } from "./routes/LinksRoute";
import { RequirementsSchemaRoute } from "./routes/RequirementsSchemaRoute";
import { DocumentsRoute } from "./routes/DocumentsRoute";
import { ArchitectureRoute } from "./routes/ArchitectureRoute";
import { InterfaceRoute } from "./routes/InterfaceRoute";
import { AirGenRoute } from "./routes/AirGenRoute";
import { NaturalLanguageQuery } from "./pages/NaturalLanguageQuery";
import { AcceptInviteRoute } from "./routes/AcceptInviteRoute";
import { AdminUsersRoute } from "./routes/AdminUsersRoute";
import { AdminRequirementsRoute } from "./routes/AdminRequirementsRoute";
import AdminRecoveryRoute from "./routes/AdminRecoveryRoute";
import { GraphViewerRoute } from "./routes/GraphViewerRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { SuperAdminRoute } from "./routes/SuperAdminRoute";
import { TenantAdminRoute } from "./routes/TenantAdminRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RoleGuard } from "./components/RoleGuard";
import { UserRole } from "./lib/rbac";
import { useAuth } from "./contexts/AuthContext";

export default function ProductionAppRoutes(): JSX.Element {
  const { user } = useAuth();

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/invites/accept" element={<AcceptInviteRoute />} />
        
        {/* AIRGen route - most critical to protect */}
        <Route 
          path="/airgen" 
          element={
            <ProtectedRoute>
              <AirGenRoute />
            </ProtectedRoute>
          } 
        />

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

        {/* Super-Admin routes - only for Super-Admin users */}
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute>
              <RoleGuard requireSuperAdmin fallback={<Navigate to="/dashboard" replace />}>
                <SuperAdminRoute />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Tenant-Admin routes - only for Tenant-Admin users */}
        <Route
          path="/tenant-admin"
          element={
            <ProtectedRoute>
              <RoleGuard
                requireRole={UserRole.TENANT_ADMIN}
                fallback={<Navigate to="/dashboard" replace />}
              >
                <TenantAdminRoute />
              </RoleGuard>
            </ProtectedRoute>
          }
        />

        {/* Legacy admin routes - only for admin users */}
        {user?.roles?.includes('admin') && (
          <>
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminUsersRoute />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/requirements"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminRequirementsRoute />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/recovery"
              element={
                <ProtectedRoute requiredRoles={['admin']}>
                  <AdminRecoveryRoute />
                </ProtectedRoute>
              }
            />
          </>
        )}
      </Routes>
    </AppLayout>
  );
}
