import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Spinner } from "./components/Spinner";
import { LandingPage } from "./LandingPage";

// Lazy load route components for better initial load performance
const DashboardRoute = lazy(() => import("./routes/DashboardRoute").then(m => ({ default: m.DashboardRoute })));
const AirGenRoute = lazy(() => import("./routes/AirGenRoute").then(m => ({ default: m.AirGenRoute })));
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
const AdminUsersRoute = lazy(() => import("./routes/AdminUsersRoute").then(m => ({ default: m.AdminUsersRoute })));
const AdminRequirementsRoute = lazy(() => import("./routes/AdminRequirementsRoute").then(m => ({ default: m.AdminRequirementsRoute })));
const AdminRecoveryRoute = lazy(() => import("./routes/AdminRecoveryRoute"));

export default function DevAppRoutes(): JSX.Element {
  return (
    <ProtectedRoute fallback={<LandingPage />}>
      <AppLayout>
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner /></div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardRoute />} />
            <Route path="/airgen" element={<AirGenRoute />} />
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
    </ProtectedRoute>
  );
}
