import { useState } from "react";
import type { RequirementRecord, DocumentRecord } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

interface CopyAndLinkModalProps {
  isOpen: boolean;
  sourceRequirement: RequirementRecord;
  targetDocument: DocumentRecord;
  targetSectionId: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function CopyAndLinkModal({
  isOpen,
  sourceRequirement,
  targetDocument,
  targetSectionId,
  onConfirm,
  onCancel
}: CopyAndLinkModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      await onConfirm();
    } catch (error) {
      console.error('Failed to copy and link:', error);
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
          <DialogTitle className="text-xl">Copy and Link Requirement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source Requirement Display */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Source Requirement</div>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-3">
                <div className="font-mono text-sm font-bold text-blue-900">{sourceRequirement.ref}</div>
                <div className="text-sm text-blue-700 mt-1">
                  {sourceRequirement.text}
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  From: {sourceRequirement.path || sourceRequirement.documentSlug}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Description */}
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-purple-900 text-sm">This will:</div>
                  <ul className="text-xs text-purple-700 mt-2 space-y-1 list-disc list-inside">
                    <li>Create a copy of this requirement in <strong>{targetDocument.name}</strong></li>
                    <li>Place the copy in the target section</li>
                    <li>Automatically create a trace link between the original and the copy</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Target Information */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase">Target</div>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-3">
                <div className="text-sm font-medium text-green-900">
                  Document: {targetDocument.name}
                </div>
                <div className="text-xs text-green-700 mt-1">
                  Section ID: {targetSectionId}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={handleCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? "Processing..." : "Copy and Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
