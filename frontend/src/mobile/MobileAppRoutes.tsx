import { Navigate, Route, Routes } from "react-router-dom";
import { MobileLayout } from "./MobileLayout";
import { MobileHome } from "./screens/MobileHome";
import { MobileRequirementsScreen } from "./screens/MobileRequirementsScreen";
import { MobileDocumentsScreen } from "./screens/MobileDocumentsScreen";
import { MobileAdminScreen } from "./screens/MobileAdminScreen";

export default function MobileAppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<MobileLayout />}>
        <Route index element={<MobileHome />} />
        <Route path="requirements" element={<MobileRequirementsScreen />} />
        <Route path="documents" element={<MobileDocumentsScreen />} />
        <Route path="admin" element={<MobileAdminScreen />} />
        <Route path="*" element={<Navigate to="/mobile" replace />} />
      </Route>
    </Routes>
  );
}
