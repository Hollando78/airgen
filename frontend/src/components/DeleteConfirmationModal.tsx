import { useState } from "react";
import type { RequirementRecord } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  requirement: RequirementRecord;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export function DeleteConfirmationModal({
  isOpen,
  requirement,
  onConfirm,
  onCancel
}: DeleteConfirmationModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Failed to delete requirement:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (isProcessing) return;
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        handleCancel();
      }
    }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-red-600">Delete Requirement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Requirement Display */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Requirement to Delete</div>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-3">
                <div className="font-mono text-sm font-bold text-red-900">{requirement.ref}</div>
                <div className="text-sm text-red-700 mt-1">
                  {requirement.text}
                </div>
                {requirement.path && (
                  <div className="text-xs text-red-600 mt-1">
                    From: {requirement.path}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Warning Message */}
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-amber-900 text-sm">Warning</div>
                  <div className="text-xs text-amber-700 mt-2">
                    This will <strong>soft-delete</strong> the requirement. The requirement will be marked as deleted
                    but can be recovered by an administrator if needed.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={handleCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isProcessing ? "Deleting..." : "Delete Requirement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
