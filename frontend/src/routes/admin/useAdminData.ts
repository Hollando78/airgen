import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";

type Tab = "deleted" | "archived" | "drift" | "badlinks" | "candidates";

export function useAdminData(
  selectedTenant: string,
  selectedProject: string,
  candidateStatusFilter: string,
  activeTab: Tab
) {
  const api = useApiClient();

  // Fetch tenants
  const { data: tenantsData } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const response = await api.get("/tenants");
      return response.data;
    }
  });
  const tenants = tenantsData?.tenants || [];

  // Fetch projects for selected tenant
  const { data: projectsData } = useQuery({
    queryKey: ["projects", selectedTenant],
    queryFn: async () => {
      const response = await api.get(`/tenants/${selectedTenant}/projects`);
      return response.data;
    },
    enabled: !!selectedTenant
  });
  const projects = projectsData?.projects || [];

  // Fetch deleted requirements
  const { data: deletedData, isLoading: isLoadingDeleted, error: deletedError } = useQuery({
    queryKey: ["admin", "requirements", "deleted", selectedTenant, selectedProject],
    queryFn: () => api.listDeletedRequirements(selectedTenant, selectedProject),
    enabled: activeTab === "deleted" && !!selectedTenant && !!selectedProject
  });

  // Fetch archived requirements
  const { data: archivedData, isLoading: isLoadingArchived, error: archivedError } = useQuery({
    queryKey: ["admin", "requirements", "archived", selectedTenant, selectedProject],
    queryFn: () => api.listArchivedRequirements(selectedTenant, selectedProject),
    enabled: activeTab === "archived" && !!selectedTenant && !!selectedProject
  });

  // Fetch drift
  const { data: driftData, isLoading: isLoadingDrift, error: driftError } = useQuery({
    queryKey: ["admin", "requirements", "drift", selectedTenant, selectedProject],
    queryFn: () => api.detectRequirementsDrift(selectedTenant, selectedProject),
    enabled: activeTab === "drift" && !!selectedTenant && !!selectedProject
  });

  // Fetch bad links
  const { data: badLinksData, isLoading: isLoadingBadLinks, error: badLinksError } = useQuery({
    queryKey: ["admin", "requirements", "badlinks", selectedTenant, selectedProject],
    queryFn: () => api.listBadLinksRequirements(selectedTenant, selectedProject),
    enabled: activeTab === "badlinks" && !!selectedTenant && !!selectedProject
  });

  // Fetch candidates
  const { data: candidatesData, isLoading: isLoadingCandidates, error: candidatesError } = useQuery({
    queryKey: ["admin", "requirements", "candidates", selectedTenant, selectedProject, candidateStatusFilter],
    queryFn: () => api.listCandidatesAdmin(selectedTenant, selectedProject, candidateStatusFilter || undefined),
    enabled: activeTab === "candidates" && !!selectedTenant && !!selectedProject
  });

  // Derived state based on active tab
  const currentData =
    activeTab === "deleted"
      ? deletedData?.requirements
      : activeTab === "archived"
      ? archivedData?.requirements
      : activeTab === "badlinks"
      ? badLinksData?.requirements
      : activeTab === "candidates"
      ? candidatesData?.candidates
      : driftData?.drifted;

  const isLoading =
    activeTab === "deleted"
      ? isLoadingDeleted
      : activeTab === "archived"
      ? isLoadingArchived
      : activeTab === "badlinks"
      ? isLoadingBadLinks
      : activeTab === "candidates"
      ? isLoadingCandidates
      : isLoadingDrift;

  const error =
    activeTab === "deleted"
      ? deletedError
      : activeTab === "archived"
      ? archivedError
      : activeTab === "badlinks"
      ? badLinksError
      : activeTab === "candidates"
      ? candidatesError
      : driftError;

  return {
    tenants,
    projects,
    deletedData,
    archivedData,
    driftData,
    badLinksData,
    candidatesData,
    currentData,
    isLoading,
    error
  };
}
