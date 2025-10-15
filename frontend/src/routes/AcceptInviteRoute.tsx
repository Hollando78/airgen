import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useAuth } from "../contexts/AuthContext";
import { useTenantProject } from "../hooks/useTenantProject";
import { PageLayout } from "../components/layout/PageLayout";
import { Spinner } from "../components/Spinner";
import { Button } from "../components/ui/button";

export function AcceptInviteRoute(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get("token");
  const api = useApiClient();
  const { setSession } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setTenant, setProject } = useTenantProject();

  const acceptInvitationMutation = useMutation({
    mutationFn: (invitationToken: string) => api.acceptTenantInvitation(invitationToken),
    onSuccess: async (result) => {
      setSession(result.token, result.user);
      setTenant(result.tenantSlug);
      setProject(null);
      await queryClient.invalidateQueries({ queryKey: ["tenants"] });
      navigate("/dashboard", { replace: true });
    }
  });

  useEffect(() => {
    if (!token) {
      return;
    }
    acceptInvitationMutation.mutate(token);
  }, [token, acceptInvitationMutation]);

  if (!token) {
    return (
      <PageLayout
        title="Accept Invitation"
        description="We couldn't find an invitation token in the link."
      >
        <p style={{ color: "#dc2626" }}>
          The invitation link is missing its token. Double-check the email you received and try again.
        </p>
        <Button style={{ marginTop: "1.5rem" }} onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </PageLayout>
    );
  }

  if (acceptInvitationMutation.isError) {
    const message =
      acceptInvitationMutation.error instanceof Error
        ? acceptInvitationMutation.error.message
        : "Something went wrong while accepting the invitation.";

    return (
      <PageLayout
        title="Accept Invitation"
        description="We hit a snag while processing your invitation."
      >
        <p style={{ color: "#dc2626" }}>{message}</p>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Return to Dashboard
          </Button>
          <Button onClick={() => acceptInvitationMutation.mutate(token)}>
            Try Again
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Accepting Invitation"
      description="Hang tight while we add this workspace to your account."
    >
      <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
        <Spinner />
      </div>
    </PageLayout>
  );
}
