import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { RequirementLinkingProvider } from "./contexts/RequirementLinkingContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LandingPage } from "./LandingPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";

const ProductionAppRoutes = lazy(() => import("./ProductionAppRoutes"));
const DevAppRoutes = import.meta.env.PROD ? null : lazy(() => import("./DevAppRoutes"));

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
              <Route path="/*" element={
                import.meta.env.PROD || !DevAppRoutes ? (
                  <ProtectedRoute fallback={<LandingPage />}>
                    <Suspense fallback={null}>
                      <ProductionAppRoutes />
                    </Suspense>
                  </ProtectedRoute>
                ) : (
                  <Suspense fallback={null}>
                    <DevAppRoutes />
                  </Suspense>
                )
              } />
            </Routes>
          </RequirementLinkingProvider>
        </AuthProvider>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
