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
import { AdminUsersRoute } from "./routes/AdminUsersRoute";
import { AdminRequirementsRoute } from "./routes/AdminRequirementsRoute";
import AdminRecoveryRoute from "./routes/AdminRecoveryRoute";
import { GraphViewerRoute } from "./routes/GraphViewerRoute";
import { SettingsRoute } from "./routes/SettingsRoute";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";

export default function ProductionAppRoutes(): JSX.Element {
  const { user } = useAuth();

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardRoute />} />
        
        {/* AIRGen route - most critical to protect */}
        <Route 
          path="/airgen" 
          element={
            <ProtectedRoute>
              <AirGenRoute />
            </ProtectedRoute>
          } 
        />
        
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

        {/* Admin routes - only for admin users */}
        {user?.roles.includes('admin') && (
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