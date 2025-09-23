import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { DraftsRoute } from "./routes/DraftsRoute";
import { RequirementsRoute } from "./routes/RequirementsRoute";
import { BaselinesRoute } from "./routes/BaselinesRoute";
import { DashboardRoute } from "./routes/DashboardRoute";
import { LinksRoute } from "./routes/LinksRoute";
import { DocumentsRoute } from "./routes/DocumentsRoute";
import { ArchitectureRoute } from "./routes/ArchitectureRoute";

export default function App(): JSX.Element {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/documents" element={<DocumentsRoute />} />
        <Route path="/architecture" element={<ArchitectureRoute />} />
        <Route path="/drafts" element={<DraftsRoute />} />
        <Route path="/requirements" element={<RequirementsRoute />} />
        <Route path="/baselines" element={<BaselinesRoute />} />
        <Route path="/links" element={<LinksRoute />} />
      </Routes>
    </AppLayout>
  );
}
