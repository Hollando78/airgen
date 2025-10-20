import { ConfirmDialog } from "../../ui/confirm-dialog";
import type { UseMutationResult } from "@tanstack/react-query";

interface DeleteTenantDialogProps {
  tenantSlug: string | null;
  onClose: () => void;
  onConfirm: (tenantSlug: string) => void;
  deleteTenantMutation: UseMutationResult<unknown, Error, string, unknown>;
}

/**
 * Confirmation dialog for deleting a tenant
 */
export function DeleteTenantDialog({
  tenantSlug,
  onClose,
  onConfirm,
  deleteTenantMutation
}: DeleteTenantDialogProps) {
  return (
    <ConfirmDialog
      open={Boolean(tenantSlug)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onConfirm={() => {
        if (!tenantSlug) { return; }
        onConfirm(tenantSlug);
      }}
      title="Delete tenant?"
      description={
        tenantSlug
          ? `This will permanently delete tenant "${tenantSlug}" and all of its projects.`
          : "This will permanently delete the tenant and all of its projects."
      }
      confirmText={deleteTenantMutation.isPending ? "Deleting..." : "Delete Tenant"}
      cancelText="Cancel"
      variant="destructive"
    />
  );
}
