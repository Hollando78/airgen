import type { FormEvent} from "react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/client";
import { useTenantProjectDocument } from "../components/TenantProjectDocumentSelector";
import { DraftCard } from "../components/DraftCard";
import { REQUIREMENT_PATTERNS, VERIFICATION_METHODS } from "../constants";
import type { DraftRequest, RequirementRecord, RequirementPattern, VerificationMethod } from "../types";
import { Spinner } from "../components/Spinner";
import { ErrorState } from "../components/ErrorState";
import { PageLayout } from "../components/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Checkbox } from "../components/ui/checkbox";
import { AlertCircle, FileText, Sparkles } from "lucide-react";

const DEFAULT_COUNT = 3;

export function DraftsRoute(): JSX.Element {
  const api = useApiClient();
  const { tenant, project, documentSlug } = useTenantProjectDocument();
  const queryClient = useQueryClient();

  const [need, setNeed] = useState("");
  const [pattern, setPattern] = useState<string>("");
  const [verification, setVerification] = useState<string>("Test");
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [useLlm, setUseLlm] = useState<boolean>(false);
  const [actor, setActor] = useState("");
  const [system, setSystem] = useState("");
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [constraint, setConstraint] = useState("");

  const draftMutation = useMutation({
    mutationFn: (payload: DraftRequest) => api.draft(payload)
  });

  type PersistPayload = {
    tenant: string;
    projectKey: string;
    text: string;
    pattern?: RequirementPattern;
    verification?: VerificationMethod;
    qaScore?: number;
    qaVerdict?: string;
    suggestions?: string[];
    tags?: string[];
  };

  const persistRequirement = useMutation({
    mutationFn: async (payload: PersistPayload) => {
      const result = await api.createRequirement(payload);
      await queryClient.invalidateQueries({ queryKey: ["requirements", payload.tenant, payload.projectKey] });
      await queryClient.invalidateQueries({ queryKey: ["projects", payload.tenant] });
      return result.requirement;
    }
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload: DraftRequest = {
      need,
      useLlm,
      count,
      pattern: pattern ? (pattern as DraftRequest["pattern"]) : undefined,
      verification: verification ? (verification as DraftRequest["verification"]) : undefined,
      actor: actor || undefined,
      system: system || undefined,
      trigger: trigger || undefined,
      response: response || undefined,
      constraint: constraint || undefined
    };
    draftMutation.mutate(payload);
  };

  const drafts = draftMutation.data?.items ?? [];
  const llmError = draftMutation.data?.meta.llm.error;

  const canGenerate = need.trim().length >= 12;
  const missingSelection = !tenant || !project;

  return (
    <PageLayout
      title="Draft Generator"
      description="Capture the stakeholder need and generate requirement candidates."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Generate Requirements
            </CardTitle>
            <CardDescription>
              Enter a need or user story to generate requirement drafts using templates and AI.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="need">Need / Context *</Label>
                <Textarea
                  id="need"
                  value={need}
                  onChange={event => setNeed(event.target.value)}
                  rows={4}
                  placeholder="As a driver, I need to..."
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Describe the stakeholder need or user story (minimum 12 characters)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pattern">Pattern</Label>
                  <Select value={pattern} onValueChange={setPattern}>
                    <SelectTrigger id="pattern">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto</SelectItem>
                      {REQUIREMENT_PATTERNS.map(option => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="verification">Verification</Label>
                  <Select value={verification} onValueChange={setVerification}>
                    <SelectTrigger id="verification">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VERIFICATION_METHODS.map(option => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="count">Draft Count</Label>
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    max={5}
                    value={count}
                    onChange={event => setCount(Number(event.target.value))}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-8">
                  <Checkbox
                    id="useLlm"
                    checked={useLlm}
                    onCheckedChange={checked => setUseLlm(checked as boolean)}
                  />
                  <Label htmlFor="useLlm" className="cursor-pointer">
                    Include LLM drafts
                  </Label>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-sm font-semibold mb-4">Optional Pattern Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="actor">Actor</Label>
                    <Input
                      id="actor"
                      value={actor}
                      onChange={event => setActor(event.target.value)}
                      placeholder="e.g., user, admin, customer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="system">System</Label>
                    <Input
                      id="system"
                      value={system}
                      onChange={event => setSystem(event.target.value)}
                      placeholder="e.g., user interface, payment system"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trigger">Trigger</Label>
                    <Input
                      id="trigger"
                      value={trigger}
                      onChange={event => setTrigger(event.target.value)}
                      placeholder="e.g., user clicks button, timeout occurs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="response">Response</Label>
                    <Input
                      id="response"
                      value={response}
                      onChange={event => setResponse(event.target.value)}
                      placeholder="e.g., display confirmation, send notification"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="constraint">Constraint</Label>
                    <Input
                      id="constraint"
                      value={constraint}
                      onChange={event => setConstraint(event.target.value)}
                      placeholder="e.g., within 3 seconds, under 100ms"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4 border-t">
                <Button type="submit" disabled={!canGenerate || draftMutation.isPending}>
                  {draftMutation.isPending ? "Generating..." : "Generate drafts"}
                </Button>
                {missingSelection && (
                  <p className="text-sm text-muted-foreground">
                    Select tenant and project to enable saving drafts.
                  </p>
                )}
              </div>
            </form>

            {draftMutation.isError && (
              <div className="mt-4">
                <ErrorState message={(draftMutation.error as Error).message} />
              </div>
            )}
            {llmError && (
              <div className="mt-4 flex items-start gap-2 p-4 bg-warning/10 border border-warning rounded-lg">
                <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-warning">LLM Error</p>
                  <p className="text-sm text-muted-foreground mt-1">{llmError}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {draftMutation.isPending && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {drafts.length > 0 && tenant && project && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Generated Drafts
              </CardTitle>
              <CardDescription>
                Review, adjust, run QA checks, and save requirements to your project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {drafts.map((draft, index) => (
                  <DraftCard
                    key={`${draft.source}-${index}`}
                    draft={draft}
                    tenant={tenant!}
                    project={project!}
                    documentSlug={documentSlug}
                    onPersist={async payload => persistRequirement.mutateAsync(payload)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {drafts.length === 0 && draftMutation.isSuccess && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No drafts generated</p>
                <p className="text-sm mt-1">Try refining the need or adjusting the parameters above.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
