import { Modal, TextInput as ModalTextInput, Button as ModalActionButton } from "../../Modal";
import type { UseMutationResult } from "@tanstack/react-query";

interface CreateTenantData {
  slug: string;
  name: string;
}

interface CreateTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantData: CreateTenantData;
  setTenantData: (data: CreateTenantData) => void;
  onSubmit: () => void;
  createTenantMutation: UseMutationResult<unknown, Error, CreateTenantData, unknown>;
}

/**
 * Modal for creating a new tenant
 */
export function CreateTenantModal({
  isOpen,
  onClose,
  tenantData,
  setTenantData,
  onSubmit,
  createTenantMutation
}: CreateTenantModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Tenant"
      size="medium"
      footer={(
        <>
          <ModalActionButton
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancel
          </ModalActionButton>
          <ModalActionButton
            type="button"
            onClick={onSubmit}
            loading={createTenantMutation.isPending}
            disabled={!tenantData.slug.trim()}
          >
            {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
          </ModalActionButton>
        </>
      )}
    >
      <ModalTextInput
        label="Tenant Slug"
        required
        placeholder="e.g., acme-corp"
        value={tenantData.slug}
        onChange={(event) => setTenantData({ ...tenantData, slug: event.target.value })}
        autoFocus
      />
      <ModalTextInput
        label="Display Name"
        placeholder="e.g., ACME Corporation"
        value={tenantData.name}
        onChange={(event) => setTenantData({ ...tenantData, name: event.target.value })}
      />
    </Modal>
  );
}
