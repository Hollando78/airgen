import { Modal, TextInput as ModalTextInput, Button as ModalActionButton } from "../../Modal";
import { Spinner } from "../../Spinner";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

interface TenantInvitation {
  id: string;
  email: string;
  status: string;
  createdAt: string;
}

interface TenantInvitationsData {
  invitations: TenantInvitation[];
}

interface InviteUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string | null;
  email: string;
  setEmail: (email: string) => void;
  onSubmit: () => void;
  inviteTenantMutation: UseMutationResult<unknown, Error, { tenant: string; email: string }, unknown>;
  tenantInvitationsQuery: UseQueryResult<TenantInvitationsData, Error>;
}

function formatDate(value: string | null | undefined): string {
  if (!value) { return "—"; }
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

/**
 * Dialog for inviting users to a tenant
 */
export function InviteUserDialog({
  isOpen,
  onClose,
  tenantSlug,
  email,
  setEmail,
  onSubmit,
  inviteTenantMutation,
  tenantInvitationsQuery
}: InviteUserDialogProps) {
  return (
    <Modal
      isOpen={isOpen && Boolean(tenantSlug)}
      onClose={onClose}
      title="Invite Teammates"
      size="large"
      footer={(
        <>
          <ModalActionButton
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Close
          </ModalActionButton>
          <ModalActionButton
            type="button"
            onClick={onSubmit}
            loading={inviteTenantMutation.isPending}
            disabled={!email.trim()}
          >
            {inviteTenantMutation.isPending ? "Sending…" : "Send Invite"}
          </ModalActionButton>
        </>
      )}
    >
      <ModalTextInput
        label="Email Address"
        type="email"
        required
        placeholder="e.g., teammate@company.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        help={tenantSlug ? `We'll email an acceptance link to join ${tenantSlug}.` : undefined}
      />

      <div>
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Recent Invitations
        </h3>
        {tenantInvitationsQuery.isLoading ? (
          <Spinner />
        ) : tenantInvitationsQuery.isError ? (
          <p className="error-text" style={{ color: "#dc2626" }}>
            {tenantInvitationsQuery.error.message}
          </p>
        ) : tenantInvitationsQuery.data && tenantInvitationsQuery.data.invitations.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Invited</th>
              </tr>
            </thead>
            <tbody>
              {tenantInvitationsQuery.data.invitations.map(invitation => (
                <tr key={invitation.id}>
                  <td>{invitation.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{invitation.status}</td>
                  <td>{formatDate(invitation.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">No invitations sent yet.</p>
        )}
      </div>
    </Modal>
  );
}
