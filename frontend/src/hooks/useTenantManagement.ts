import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiClient } from "../lib/client";
import { useAuth } from "../contexts/AuthContext";

/**
 * Custom hook for tenant management operations
 *
 * Handles:
 * - Listing tenants
 * - Creating new tenants
 * - Deleting tenants
 * - Inviting users to tenants
 * - Managing tenant invitations
 */
export function useTenantManagement() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const { refreshAccessToken } = useAuth();

  // UI State
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [newTenantData, setNewTenantData] = useState({ slug: "", name: "" });
  const [inviteTenantSlug, setInviteTenantSlug] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [tenantSlugPendingDeletion, setTenantSlugPendingDeletion] = useState<string | null>(null);

  // Queries
  const tenantsQuery = useQuery({
    queryKey: ["tenants"],
    queryFn: api.listTenants
  });

  const tenantInvitationsQuery = useQuery({
    queryKey: ["tenantInvitations", inviteTenantSlug],
    queryFn: () => api.listTenantInvitations(inviteTenantSlug ?? ""),
    enabled: Boolean(inviteTenantSlug)
  });

  // Mutations
  const createTenantMutation = useMutation({
    mutationFn: api.createTenant,
    onSuccess: async () => {
      // Refresh the access token to get updated ownedTenantSlugs
      await refreshAccessToken();
      // Then invalidate queries to refresh the UI with the new tenant
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setShowCreateTenant(false);
      setNewTenantData({ slug: "", name: "" });
      toast.success("Tenant created successfully");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to create tenant";
      toast.error(message);
    }
  });

  const deleteTenantMutation = useMutation({
    mutationFn: api.deleteTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setTenantSlugPendingDeletion(null);
      toast.success("Tenant deleted successfully");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to delete tenant";
      toast.error(message);
    }
  });

  const inviteTenantMutation = useMutation({
    mutationFn: ({ tenant, email }: { tenant: string; email: string }) =>
      api.inviteToTenant(tenant, { email }),
    onSuccess: (_, variables) => {
      toast.success(`Invitation sent to ${variables.email}`);
      queryClient.invalidateQueries({ queryKey: ["tenantInvitations", variables.tenant] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setInviteEmail("");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(message);
    }
  });

  // Handlers
  const closeInviteModal = useCallback(() => {
    setInviteTenantSlug(null);
    setInviteEmail("");
  }, []);

  const handleSendInvite = useCallback(() => {
    if (!inviteTenantSlug || !inviteEmail) {
      return;
    }
    inviteTenantMutation.mutate({ tenant: inviteTenantSlug, email: inviteEmail.trim() });
  }, [inviteTenantSlug, inviteEmail, inviteTenantMutation]);

  const handleCreateTenant = useCallback(() => {
    if (!newTenantData.slug.trim()) {
      return;
    }
    createTenantMutation.mutate(newTenantData);
  }, [newTenantData, createTenantMutation]);

  const handleDeleteTenant = useCallback((tenantSlug: string) => {
    deleteTenantMutation.mutate(tenantSlug);
  }, [deleteTenantMutation]);

  const openInviteDialog = useCallback((tenantSlug: string) => {
    setInviteTenantSlug(tenantSlug);
    setInviteEmail("");
  }, []);

  // Derived state
  const tenants = tenantsQuery.data?.tenants ?? [];
  const showOwnerActions = tenants.some(tenant => tenant.isOwner);

  return {
    // Queries
    tenantsQuery,
    tenantInvitationsQuery,
    tenants,
    showOwnerActions,

    // Mutations
    createTenantMutation,
    deleteTenantMutation,
    inviteTenantMutation,

    // UI State
    showCreateTenant,
    setShowCreateTenant,
    newTenantData,
    setNewTenantData,
    inviteTenantSlug,
    inviteEmail,
    setInviteEmail,
    tenantSlugPendingDeletion,
    setTenantSlugPendingDeletion,

    // Handlers
    handleCreateTenant,
    handleDeleteTenant,
    handleSendInvite,
    openInviteDialog,
    closeInviteModal
  };
}
