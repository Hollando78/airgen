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
const AdminUsersRoute = lazy(() => import("./routes/AdminUsersRoute").then(m => ({ default: m.AdminUsersRoute })));

export default function DevAppRoutes(): JSX.Element {
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><Spinner /></div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute fallback={<LandingPage />}>
                <DashboardRoute />
              </ProtectedRoute>
            }
          />
        <Route
          path="/airgen"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <AirGenRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <DocumentsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/architecture"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <ArchitectureRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/interfaces"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <InterfaceRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/drafts"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <DraftsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requirements"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <RequirementsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/baselines"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <BaselinesRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/links"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <LinksRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requirements-schema"
          element={
            <ProtectedRoute fallback={<LandingPage />}>
              <RequirementsSchemaRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute fallback={<LandingPage />} requiredRoles={["admin"]}>
              <AdminUsersRoute />
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
    </AppLayout>
  );
}
