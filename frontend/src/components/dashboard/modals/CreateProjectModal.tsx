import { Modal, TextInput as ModalTextInput, Button as ModalActionButton } from "../../Modal";
import type { UseMutationResult } from "@tanstack/react-query";

interface CreateProjectData {
  slug: string;
  key: string;
}

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string | null;
  projectData: CreateProjectData;
  setProjectData: (data: CreateProjectData) => void;
  onSubmit: () => void;
  createProjectMutation: UseMutationResult<unknown, Error, { tenant: string; data: CreateProjectData }, unknown>;
}

/**
 * Modal for creating a new project within a tenant
 */
export function CreateProjectModal({
  isOpen,
  onClose,
  tenantSlug,
  projectData,
  setProjectData,
  onSubmit,
  createProjectMutation
}: CreateProjectModalProps) {
  return (
    <Modal
      isOpen={isOpen && Boolean(tenantSlug)}
      onClose={onClose}
      title="Create New Project"
      size="medium"
      dismissible={false}
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
            loading={createProjectMutation.isPending}
            disabled={!projectData.slug.trim() || !tenantSlug}
          >
            {createProjectMutation.isPending ? "Creating..." : "Create Project"}
          </ModalActionButton>
        </>
      )}
    >
      <ModalTextInput
        label="Tenant"
        value={tenantSlug ?? ""}
        readOnly
        disabled
      />
      <ModalTextInput
        label="Project Slug"
        required
        placeholder="e.g., mobile-app"
        value={projectData.slug}
        onChange={(event) => setProjectData({ ...projectData, slug: event.target.value })}
        autoFocus
      />
      <ModalTextInput
        label="Project Key"
        placeholder="e.g., MOBILE"
        value={projectData.key}
        onChange={(event) => setProjectData({ ...projectData, key: event.target.value })}
      />
    </Modal>
  );
}
