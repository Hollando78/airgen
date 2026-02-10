import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { useApiClient } from "../lib/client";

export function EmailVerificationBanner(): JSX.Element | null {
  const { user } = useAuth();
  const api = useApiClient();
  const [dismissed, setDismissed] = useState(false);

  const resendMutation = useMutation({
    mutationFn: () => api.requestVerification(),
  });

  if (!user || user.emailVerified !== false || dismissed) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "0.5rem 1rem",
        backgroundColor: "#fef3c7",
        borderBottom: "1px solid #f59e0b",
        fontSize: "0.875rem",
        color: "#92400e",
      }}
    >
      <span>
        Your email address is not verified. Please check your inbox for a verification link.
      </span>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        {resendMutation.isSuccess ? (
          <span style={{ color: "#16a34a", fontWeight: 500 }}>Sent!</span>
        ) : (
          <button
            onClick={() => resendMutation.mutate()}
            disabled={resendMutation.isPending}
            style={{
              background: "none",
              border: "1px solid #d97706",
              borderRadius: "0.25rem",
              padding: "0.25rem 0.75rem",
              color: "#92400e",
              cursor: "pointer",
              fontWeight: 500,
              fontSize: "0.8rem",
            }}
          >
            {resendMutation.isPending ? "Sending..." : "Resend"}
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            color: "#92400e",
            cursor: "pointer",
            fontSize: "1rem",
            lineHeight: 1,
            padding: "0 0.25rem",
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
