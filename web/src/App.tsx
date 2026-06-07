import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth";
import { Layout } from "@/components/Layout";
import { RequireRole } from "@/components/RequireRole";
import { LoginScreen } from "@/components/LoginScreen";
import DashboardPage from "@/pages/DashboardPage";
import PeoplePage from "@/pages/PeoplePage";
import ProjectsPage from "@/pages/ProjectsPage";
import AllocationsPage from "@/pages/AllocationsPage";
import AuditPage from "@/pages/AuditPage";

export default function App() {
  const { me, isLoading, error } = useAuth();

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-[var(--color-muted-foreground)]">Loading…</div>;
  }

  if (error || !me) {
    return <LoginScreen />;
  }

  const home = me.roles.includes("leadership") ? "/dashboard" : "/allocations";

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route
          path="/dashboard"
          element={
            <RequireRole roles={["leadership"]}>
              <DashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/people"
          element={
            <RequireRole roles={["viewer", "editor", "leadership"]}>
              <PeoplePage />
            </RequireRole>
          }
        />
        <Route
          path="/projects"
          element={
            <RequireRole roles={["viewer", "editor", "leadership"]}>
              <ProjectsPage />
            </RequireRole>
          }
        />
        <Route
          path="/allocations"
          element={
            <RequireRole roles={["viewer", "editor", "leadership"]}>
              <AllocationsPage />
            </RequireRole>
          }
        />
        <Route
          path="/audit"
          element={
            <RequireRole roles={["leadership"]}>
              <AuditPage />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}
