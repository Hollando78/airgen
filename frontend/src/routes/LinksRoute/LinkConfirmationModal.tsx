import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import type { RequirementRecord, TraceLinkType } from "../../types";

interface LinkConfirmationModalProps {
  isOpen: boolean;
  sourceRequirements: RequirementRecord[];
  targetRequirements: RequirementRecord[];
  onConfirm: (linkType: TraceLinkType, description?: string) => void;
  onCancel: () => void;
}

const linkTypes: Array<{ value: TraceLinkType; label: string; description: string }> = [
  { value: "satisfies", label: "Satisfies", description: "Target requirement satisfies source requirement" },
  { value: "derives", label: "Derives", description: "Target requirement is derived from source requirement" },
  { value: "verifies", label: "Verifies", description: "Target requirement verifies source requirement" },
  { value: "implements", label: "Implements", description: "Target requirement implements source requirement" },
  { value: "refines", label: "Refines", description: "Target requirement refines source requirement" },
  { value: "conflicts", label: "Conflicts", description: "Target requirement conflicts with source requirement" }
];

export function LinkConfirmationModal({
  isOpen,
  sourceRequirements,
  targetRequirements,
  onConfirm,
  onCancel
}: LinkConfirmationModalProps): JSX.Element {
  const [linkType, setLinkType] = useState<TraceLinkType>('satisfies');
  const [description, setDescription] = useState('');

  const handleConfirm = () => {
    onConfirm(linkType, description.trim() || undefined);
    setDescription('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Confirm Trace Link Creation</DialogTitle>
          <DialogDescription>
            Create relationships between the selected requirements
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">From ({sourceRequirements.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sourceRequirements.map(req => (
                  <div key={req.id} className="flex flex-col space-y-1">
                    <span className="font-mono text-xs text-muted-foreground">{req.ref}</span>
                    <span className="text-sm">{req.title}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <div className="text-2xl text-muted-foreground">→</div>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">To ({targetRequirements.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {targetRequirements.map(req => (
                  <div key={req.id} className="flex flex-col space-y-1">
                    <span className="font-mono text-xs text-muted-foreground">{req.ref}</span>
                    <span className="text-sm">{req.title}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Link Type</Label>
              <Select value={linkType} onValueChange={(value) => setLinkType(value as TraceLinkType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {linkTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {linkTypes.find(t => t.value === linkType)?.description}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional notes about this relationship..."
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Create {sourceRequirements.length * targetRequirements.length} Link{sourceRequirements.length * targetRequirements.length > 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
