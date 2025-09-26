import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DraftsRoute } from "./routes/DraftsRoute";
import { RequirementsRoute } from "./routes/RequirementsRoute";
import { BaselinesRoute } from "./routes/BaselinesRoute";
import { DashboardRoute } from "./routes/DashboardRoute";
import { LinksRoute } from "./routes/LinksRoute";
import { DocumentsRoute } from "./routes/DocumentsRoute";
import { ArchitectureRoute } from "./routes/ArchitectureRoute";
import { InterfaceRoute } from "./routes/InterfaceRoute";
import { AirGenRoute } from "./routes/AirGenRoute";
import { AdminUsersRoute } from "./routes/AdminUsersRoute";
import { LandingPage } from "./LandingPage";

export default function DevAppRoutes(): JSX.Element {
  return (
    <AppLayout>
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
          path="/admin/users"
          element={
            <ProtectedRoute fallback={<LandingPage />} requiredRoles={["admin"]}>
              <AdminUsersRoute />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AppLayout>
  );
}
