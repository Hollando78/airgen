import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TraceLinkType, RequirementRecord, DocumentLinkset } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";
import { useApiClient } from "../lib/client";

interface LinkTypeSelectionModalProps {
  isOpen: boolean;
  sourceRequirement: RequirementRecord;
  targetRequirement: RequirementRecord;
  onConfirm: (linkType: TraceLinkType, description?: string) => void;
  onCancel: () => void;
}

const LINK_TYPES: Array<{ value: TraceLinkType; label: string; description: string; icon: string }> = [
  {
    value: "satisfies",
    label: "Satisfies",
    description: "Target requirement satisfies source requirement",
    icon: "✓"
  },
  {
    value: "derives",
    label: "Derives From",
    description: "Target requirement is derived from source requirement",
    icon: "↘"
  },
  {
    value: "verifies",
    label: "Verifies",
    description: "Target requirement verifies source requirement",
    icon: "🔍"
  },
  {
    value: "implements",
    label: "Implements",
    description: "Target requirement implements source requirement",
    icon: "⚙"
  },
  {
    value: "refines",
    label: "Refines",
    description: "Target requirement refines source requirement",
    icon: "◆"
  },
  {
    value: "conflicts",
    label: "Conflicts With",
    description: "Target requirement conflicts with source requirement",
    icon: "⚠"
  }
];

export function LinkTypeSelectionModal({
  isOpen,
  sourceRequirement,
  targetRequirement,
  onConfirm,
  onCancel
}: LinkTypeSelectionModalProps) {
  const [selectedType, setSelectedType] = useState<TraceLinkType>("satisfies");
  const [description, setDescription] = useState("");
  const apiClient = useApiClient();

  // Fetch linksets to check if one exists for this document pair
  const { data: linksetsData, isLoading } = useQuery({
    queryKey: ['linksets', sourceRequirement.tenant, sourceRequirement.projectKey],
    queryFn: () => apiClient.listLinksets(sourceRequirement.tenant, sourceRequirement.projectKey),
    enabled: isOpen
  });

  // Determine linkset status
  const linksetInfo = useMemo(() => {
    const sourceDocSlug = sourceRequirement.documentSlug;
    const targetDocSlug = targetRequirement.documentSlug;

    // Check if both requirements have document slugs
    if (!sourceDocSlug || !targetDocSlug) {
      return {
        type: 'unknown' as const,
        message: 'Unable to determine document information for requirements'
      };
    }

    // Check if this is an intra-document link
    if (sourceDocSlug === targetDocSlug) {
      return {
        type: 'intra-document' as const,
        message: 'This is a link within the same document.',
        documentName: sourceRequirement.path || sourceDocSlug
      };
    }

    // This is an inter-document link - check if linkset exists
    const linksets = linksetsData?.linksets || [];
    const matchingLinkset = linksets.find(
      ls => ls.sourceDocumentSlug === sourceDocSlug && ls.targetDocumentSlug === targetDocSlug
    );

    if (matchingLinkset) {
      return {
        type: 'has-linkset' as const,
        linkset: matchingLinkset,
        message: `This link will be added to an existing linkset`
      };
    }

    // No linkset exists for this document pair
    return {
      type: 'missing-linkset' as const,
      message: `No linkset exists between these documents.`,
      sourceDocSlug,
      targetDocSlug
    };
  }, [sourceRequirement, targetRequirement, linksetsData]);

  const handleConfirm = () => {
    onConfirm(selectedType, description.trim() || undefined);
    setDescription("");
    setSelectedType("satisfies");
  };

  const handleCancel = () => {
    onCancel();
    setDescription("");
    setSelectedType("satisfies");
  };

  const canCreateLink = linksetInfo.type !== 'missing-linkset';

  // Fix z-index for overlay when modal opens
  useEffect(() => {
    if (isOpen) {
      // Find and update the Radix overlay z-index
      setTimeout(() => {
        const overlay = document.querySelector('[data-radix-dialog-overlay]') as HTMLElement;
        if (overlay) {
          overlay.style.zIndex = '9999';
        }
      }, 0);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        handleCancel();
      }
    }}>
      <DialogContent className="max-w-3xl z-[10000]" style={{ zIndex: 10000 }}>
        <DialogHeader>
          <DialogTitle className="text-xl">Create Trace Link</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Requirements Display */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Source</div>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-3">
                  <div className="font-mono text-sm font-bold text-blue-900">{sourceRequirement.ref}</div>
                  <div className="text-xs text-blue-700 mt-1 line-clamp-2">
                    {sourceRequirement.text}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Target</div>
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-3">
                  <div className="font-mono text-sm font-bold text-purple-900">{targetRequirement.ref}</div>
                  <div className="text-xs text-purple-700 mt-1 line-clamp-2">
                    {targetRequirement.text}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Linkset Status */}
          {isLoading ? (
            <Card className="bg-gray-50">
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                Checking linkset status...
              </CardContent>
            </Card>
          ) : (
            <Card className={cn(
              "border-2",
              linksetInfo.type === 'missing-linkset' && 'bg-yellow-50 border-yellow-400',
              linksetInfo.type === 'has-linkset' && 'bg-green-50 border-green-400',
              linksetInfo.type === 'intra-document' && 'bg-blue-50 border-blue-400',
              linksetInfo.type === 'unknown' && 'bg-gray-50 border-gray-300'
            )}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {linksetInfo.type === 'missing-linkset' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-600">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <line x1="12" y1="9" x2="12" y2="13"/>
                        <line x1="12" y1="17" x2="12.01" y2="17"/>
                      </svg>
                    )}
                    {linksetInfo.type === 'has-linkset' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                    )}
                    {linksetInfo.type === 'intra-document' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {linksetInfo.type === 'intra-document' && (
                      <div>
                        <div className="font-semibold text-blue-900 text-sm">Same Document Link</div>
                        <div className="text-xs text-blue-700 mt-1">
                          Both requirements are in the same document. No linkset required.
                        </div>
                      </div>
                    )}

                    {linksetInfo.type === 'has-linkset' && linksetInfo.linkset && (
                      <div>
                        <div className="font-semibold text-green-900 text-sm">Linkset Found</div>
                        <div className="text-xs text-green-700 mt-1">
                          This link will be added to the existing linkset:
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs bg-white/60 rounded px-2 py-1.5 border border-green-300">
                          <span className="font-mono font-medium">{linksetInfo.linkset.sourceDocument.name}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                          </svg>
                          <span className="font-mono font-medium">{linksetInfo.linkset.targetDocument.name}</span>
                        </div>
                        <div className="text-xs text-green-600 mt-1.5">
                          Current links in set: {linksetInfo.linkset.linkCount}
                        </div>
                      </div>
                    )}

                    {linksetInfo.type === 'missing-linkset' && (
                      <div>
                        <div className="font-semibold text-yellow-900 text-sm">Linkset Required</div>
                        <div className="text-xs text-yellow-800 mt-1">
                          You must create a linkset before linking requirements between these documents:
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs bg-white/60 rounded px-2 py-1.5 border border-yellow-300">
                          <span className="font-mono">{linksetInfo.sourceDocSlug}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-600">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                          </svg>
                          <span className="font-mono">{linksetInfo.targetDocSlug}</span>
                        </div>
                        <div className="text-xs text-yellow-800 mt-2 font-medium">
                          → Please navigate to the <strong>Requirements Schema</strong> view to create the linkset first.
                        </div>
                      </div>
                    )}

                    {linksetInfo.type === 'unknown' && (
                      <div className="text-sm text-muted-foreground">
                        {linksetInfo.message}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Link Type Selection */}
          {canCreateLink && (
            <>
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Link Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {LINK_TYPES.map(linkType => (
                    <button
                      key={linkType.value}
                      type="button"
                      onClick={() => setSelectedType(linkType.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 transition-all text-left",
                        selectedType === linkType.value
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <span className="text-lg">{linkType.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{linkType.label}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground bg-gray-50 rounded p-2 border border-gray-200">
                  {LINK_TYPES.find(lt => lt.value === selectedType)?.description}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Description <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add context or rationale for this traceability link..."
                  className="min-h-[80px] resize-none"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canCreateLink || isLoading}
          >
            {isLoading ? "Checking..." : "Create Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
