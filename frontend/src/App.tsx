import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { RequirementLinkingProvider } from "./contexts/RequirementLinkingContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LandingPage } from "./LandingPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";

const AppRoutes = lazy(() => import("./AppRoutes"));
const MobileAppRoutes = lazy(() => import("./mobile/MobileAppRoutes"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

export default function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <RequirementLinkingProvider>
            <Routes>
              {/* Public routes */}
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected routes */}
              <Route path="/mobile/*" element={
                <ProtectedRoute fallback={<LandingPage />}>
                  <Suspense fallback={null}>
                    <MobileAppRoutes />
                  </Suspense>
                </ProtectedRoute>
              } />

              <Route path="/*" element={
                <ProtectedRoute fallback={<LandingPage />}>
                  <Suspense fallback={null}>
                    <AppRoutes />
                  </Suspense>
                </ProtectedRoute>
              } />
            </Routes>
          </RequirementLinkingProvider>
        </AuthProvider>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
