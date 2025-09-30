import { useState } from "react";
import type { TraceLinkType, RequirementRecord } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Trace Link</DialogTitle>
          <DialogDescription>
            Establish a relationship between two requirements
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">FROM (Source)</div>
                  <div className="font-semibold">{sourceRequirement.ref}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {sourceRequirement.text.substring(0, 100)}{sourceRequirement.text.length > 100 ? '...' : ''}
                  </div>
                </div>
                
                <div className="flex items-center justify-center py-2 text-gray-400">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </div>
                
                <div>
                  <div className="text-xs text-muted-foreground mb-1">TO (Target)</div>
                  <div className="font-semibold">{targetRequirement.ref}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {targetRequirement.text.substring(0, 100)}{targetRequirement.text.length > 100 ? '...' : ''}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <Label className="text-sm font-semibold">
              Select Link Type
            </Label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {LINK_TYPES.map(linkType => (
                <Button
                  key={linkType.value}
                  variant={selectedType === linkType.value ? "default" : "outline"}
                  onClick={() => setSelectedType(linkType.value)}
                  className={cn(
                    "h-auto p-3 text-left justify-start",
                    selectedType === linkType.value && "ring-2 ring-primary"
                  )}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{linkType.icon}</span>
                      <span className="font-medium">{linkType.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground leading-tight">
                      {linkType.description}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold">
              Description (Optional)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add any additional context or rationale for this link..."
              className="min-h-[80px] mt-2"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Create Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}