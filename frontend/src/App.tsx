import { lazy, Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LandingPage } from "./LandingPage";

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
          {import.meta.env.PROD || !DevAppRoutes ? (
            <ProtectedRoute fallback={<LandingPage />}>
              <Suspense fallback={null}>
                <ProductionAppRoutes />
              </Suspense>
            </ProtectedRoute>
          ) : (
            <Suspense fallback={null}>
              <DevAppRoutes />
            </Suspense>
          )}
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
