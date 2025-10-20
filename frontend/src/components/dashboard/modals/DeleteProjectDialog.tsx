import { ConfirmDialog } from "../../ui/confirm-dialog";
import type { UseMutationResult } from "@tanstack/react-query";

interface DeleteProjectInfo {
  tenant: string;
  project: string;
}

interface DeleteProjectDialogProps {
  projectInfo: DeleteProjectInfo | null;
  onClose: () => void;
  onConfirm: () => void;
  deleteProjectMutation: UseMutationResult<unknown, Error, { tenant: string; project: string }, unknown>;
}

/**
 * Confirmation dialog for deleting a project
 */
export function DeleteProjectDialog({
  projectInfo,
  onClose,
  onConfirm,
  deleteProjectMutation
}: DeleteProjectDialogProps) {
  return (
    <ConfirmDialog
      open={Boolean(projectInfo)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      onConfirm={onConfirm}
      title="Delete project?"
      description={
        projectInfo
          ? `This will permanently delete project "${projectInfo.project}" from tenant "${projectInfo.tenant}" and all of its data.`
          : "This will permanently delete the project and all of its data."
      }
      confirmText={deleteProjectMutation.isPending ? "Deleting..." : "Delete Project"}
      cancelText="Cancel"
      variant="destructive"
    />
  );
}
