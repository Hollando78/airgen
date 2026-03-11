import { Modal, TextInput as ModalTextInput, Button as ModalActionButton } from "../../Modal";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ProjectRecord } from "../../../types";
import type { EditProjectData } from "../../../hooks/useProjectManagement";

interface EditProjectDialogProps {
  projectInfo: { tenant: string; project: ProjectRecord } | null;
  onClose: () => void;
  onSubmit: () => void;
  editData: EditProjectData;
  setEditData: (data: EditProjectData) => void;
  updateProjectMutation: UseMutationResult<unknown, Error, { tenant: string; project: string; data: Partial<EditProjectData> }, unknown>;
}

/**
 * Modal for editing project name, description, code, and key
 */
export function EditProjectDialog({
  projectInfo,
  onClose,
  onSubmit,
  editData,
  setEditData,
  updateProjectMutation
}: EditProjectDialogProps) {
  return (
    <Modal
      isOpen={Boolean(projectInfo)}
      onClose={onClose}
      title={`Edit Project: ${projectInfo?.project.slug ?? ""}`}
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
            loading={updateProjectMutation.isPending}
          >
            {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
          </ModalActionButton>
        </>
      )}
    >
      <ModalTextInput
        label="Project Slug"
        value={projectInfo?.project.slug ?? ""}
        readOnly
        disabled
      />
      <ModalTextInput
        label="Display Name"
        placeholder="e.g., Mobile Application"
        value={editData.name}
        onChange={(event) => setEditData({ ...editData, name: event.target.value })}
        autoFocus
      />
      <ModalTextInput
        label="Description"
        placeholder="Brief project description"
        value={editData.description}
        onChange={(event) => setEditData({ ...editData, description: event.target.value })}
      />
      <ModalTextInput
        label="Project Code"
        placeholder="e.g., MOB"
        value={editData.code}
        onChange={(event) => setEditData({ ...editData, code: event.target.value })}
      />
      <ModalTextInput
        label="Project Key"
        placeholder="e.g., MOBILE"
        value={editData.key}
        onChange={(event) => setEditData({ ...editData, key: event.target.value })}
      />
    </Modal>
  );
}
