import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { PageLayout } from "../components/layout/PageLayout";
import { Spinner } from "../components/Spinner";
import { Button } from "../components/ui/button";

export function VerifyEmailRoute(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get("token");
  const api = useApiClient();
  const navigate = useNavigate();

  const verifyMutation = useMutation({
    mutationFn: (verifyToken: string) => api.verifyEmail(verifyToken),
  });

  useEffect(() => {
    if (!token) return;
    verifyMutation.mutate(token);
  }, [token]);

  if (!token) {
    return (
      <PageLayout
        title="Verify Email"
        description="We couldn't find a verification token in the link."
      >
        <p style={{ color: "#dc2626" }}>
          The verification link is missing its token. Please check the email you received and try again.
        </p>
        <Button style={{ marginTop: "1.5rem" }} onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
      </PageLayout>
    );
  }

  if (verifyMutation.isError) {
    const message =
      verifyMutation.error instanceof Error
        ? verifyMutation.error.message
        : "Something went wrong while verifying your email.";

    return (
      <PageLayout
        title="Verify Email"
        description="We hit a snag while verifying your email."
      >
        <p style={{ color: "#dc2626" }}>{message}</p>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
          <Button onClick={() => verifyMutation.mutate(token)}>
            Try Again
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (verifyMutation.isSuccess) {
    return (
      <PageLayout
        title="Email Verified"
        description="Your email address has been verified successfully."
      >
        <p style={{ color: "#16a34a", fontWeight: 500 }}>
          Your email is now verified. You can continue using the application.
        </p>
        <Button style={{ marginTop: "1.5rem" }} onClick={() => navigate("/dashboard")}>
          Go to Dashboard
        </Button>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Verifying Email"
      description="Hang tight while we verify your email address."
    >
      <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
        <Spinner />
      </div>
    </PageLayout>
  );
}
