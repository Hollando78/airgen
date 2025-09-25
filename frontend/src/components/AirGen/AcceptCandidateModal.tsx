import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { Modal, TextInput, Select, TextArea, Button } from "../Modal";
import { CreateDocumentModal } from "../CreateDocumentModal";
import { AddSectionModal } from "../AddSectionModal";
import { EditDocumentModal } from "../EditDocumentModal";
import { EditSectionModal } from "../EditSectionModal";
import type {
  RequirementCandidate,
  RequirementPattern,
  VerificationMethod,
  DocumentRecord,
  DocumentSectionRecord
} from "../../types";

const patternOptions: Array<{ value: RequirementPattern; label: string }> = [
  { value: "ubiquitous", label: "Ubiquitous" },
  { value: "event", label: "Event" },
  { value: "state", label: "State" },
  { value: "unwanted", label: "Unwanted" },
  { value: "optional", label: "Optional" }
];

const verificationOptions: Array<{ value: VerificationMethod; label: string }> = [
  { value: "Test", label: "Test" },
  { value: "Analysis", label: "Analysis" },
  { value: "Inspection", label: "Inspection" },
  { value: "Demonstration", label: "Demonstration" }
];

function summarize(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77).trim()}…`;
}

function defaultTitle(text: string): string {
  const summary = summarize(text);
  return summary.replace(/shall/i, "shall");
}

type AcceptCandidateModalProps = {
  isOpen: boolean;
  candidate: RequirementCandidate | null;
  tenant: string;
  project: string;
  onClose: () => void;
  onAccepted: () => void;
};

export function AcceptCandidateModal({
  isOpen,
  candidate,
  tenant,
  project,
  onClose,
  onAccepted
}: AcceptCandidateModalProps): JSX.Element | null {
  const api = useApiClient();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [pattern, setPattern] = useState<string>("");
  const [verification, setVerification] = useState<string>("");
  const [documentSlug, setDocumentSlug] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showCreateDocument, setShowCreateDocument] = useState(false);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showEditDocument, setShowEditDocument] = useState(false);
  const [showEditSection, setShowEditSection] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentRecord | null>(null);
  const [editingSection, setEditingSection] = useState<DocumentSectionRecord | null>(null);

  const handleEditDocumentClick = (document: DocumentRecord) => {
    setEditingDocument(document);
    setShowEditDocument(true);
  };

  const handleEditSectionClick = (section: DocumentSectionRecord) => {
    setEditingSection(section);
    setShowEditSection(true);
  };

  const documentsQuery = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: isOpen && Boolean(tenant && project)
  });

  const sectionsQuery = useQuery({
    queryKey: ["sections", tenant, project, documentSlug],
    queryFn: () => api.listDocumentSections(tenant, project, documentSlug),
    enabled: isOpen && Boolean(tenant && project && documentSlug)
  });

  const createSectionMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string; shortCode?: string }) => {
      if (!documentSlug) {
        throw new Error("Select a document before adding a section.");
      }
      const order = sectionsQuery.data?.sections.length ?? 0;
      const result = await api.createDocumentSection({
        tenant,
        projectKey: project,
        documentSlug,
        name: payload.name,
        description: payload.description || undefined,
        shortCode: payload.shortCode,
        order
      });
      return result.section;
    },
    onSuccess: section => {
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      setSectionId(section.id);
      setShowAddSection(false);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!candidate) {
        throw new Error("No candidate selected");
      }
      setError(null);
      return api.acceptRequirementCandidate(candidate.id, {
        tenant,
        projectKey: project,
        title: title.trim(),
        pattern: pattern ? (pattern as RequirementPattern) : undefined,
        verification: verification ? (verification as VerificationMethod) : undefined,
        documentSlug: documentSlug || undefined,
        sectionId: sectionId || undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["airgen", "candidates", "grouped", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      if (documentSlug) {
        queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
        queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      }
      onAccepted();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    }
  });

  useEffect(() => {
    if (isOpen && candidate) {
      setTitle(defaultTitle(candidate.text));
      setPattern("");
      setVerification("");
      setDocumentSlug(candidate.documentSlug ?? "");
      setSectionId(candidate.sectionId ?? "");
      setError(null);
    }
    if (!isOpen) {
      setShowCreateDocument(false);
      setShowAddSection(false);
    }
  }, [isOpen, candidate]);

  const documents = documentsQuery.data?.documents ?? [];
  const sections = sectionsQuery.data?.sections ?? [];

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button
        type="submit"
        loading={acceptMutation.isPending}
        onClick={() => acceptMutation.mutate()}
        disabled={!title.trim()}
      >
        Accept requirement
      </Button>
    </>
  );

  return (
    <>
      <Modal
        isOpen={isOpen && Boolean(candidate)}
        onClose={onClose}
        title="Accept candidate requirement"
        footer={footer}
      >
        {!candidate ? (
          <p>No candidate selected.</p>
        ) : (
          <div className="accept-modal">
            <TextInput
              label="Title"
              value={title}
              onChange={event => setTitle(event.target.value)}
              placeholder="Provide a concise requirement title"
            />

            <TextArea
              label="Requirement"
              value={candidate.text}
              rows={4}
              readOnly
            />

            <Select
              label="Pattern"
              value={pattern}
              onChange={event => setPattern(event.target.value)}
              options={patternOptions}
              placeholder="Select pattern"
              help="Optional. Choose the best-fit EARS pattern"
            />

            <Select
              label="Verification method"
              value={verification}
              onChange={event => setVerification(event.target.value)}
              options={verificationOptions}
              placeholder="Select method"
            />

            <Select
              label="Document"
              value={documentSlug}
              onChange={event => {
                setDocumentSlug(event.target.value);
                setSectionId("");
              }}
              options={documents.map((doc: DocumentRecord) => ({
                value: doc.slug,
                label: doc.name
              }))}
              placeholder="Select target document"
              help="Create a new document if needed"
            />

            <div className="accept-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateDocument(true)}
                disabled={!tenant || !project}
              >
                New document
              </Button>
              {documentSlug && documents.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const selectedDoc = documents.find(d => d.slug === documentSlug);
                    if (selectedDoc) handleEditDocumentClick(selectedDoc);
                  }}
                >
                  Edit document
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAddSection(true)}
                disabled={!documentSlug}
              >
                New section
              </Button>
              {sectionId && sections.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const selectedSection = sections.find(s => s.id === sectionId);
                    if (selectedSection) handleEditSectionClick(selectedSection);
                  }}
                >
                  Edit section
                </Button>
              )}
            </div>

            <Select
              label="Section"
              value={sectionId}
              onChange={event => setSectionId(event.target.value)}
              options={sections.map((section: DocumentSectionRecord) => ({
                value: section.id,
                label: section.name
              }))}
              placeholder={documentSlug ? "Select section" : "Select a document first"}
              disabled={!documentSlug || sections.length === 0}
            />

            {error && <p className="accept-error">{error}</p>}
          </div>
        )}
      </Modal>

      {tenant && project && (
        <CreateDocumentModal
          isOpen={showCreateDocument}
          tenant={tenant}
          project={project}
          onClose={() => setShowCreateDocument(false)}
          onCreated={slug => {
            queryClient.invalidateQueries({ queryKey: ["documents", tenant, project] });
            setDocumentSlug(slug);
            setShowCreateDocument(false);
          }}
        />
      )}

      <AddSectionModal
        isOpen={showAddSection}
        onClose={() => setShowAddSection(false)}
        onAdd={({ name, description, shortCode }) =>
          createSectionMutation.mutate({
            name,
            description,
            shortCode
          })
        }
      />

      {tenant && project && (
        <EditDocumentModal
          isOpen={showEditDocument}
          tenant={tenant}
          project={project}
          document={editingDocument}
          onClose={() => {
            setShowEditDocument(false);
            setEditingDocument(null);
          }}
          onUpdated={() => {
            if (documentSlug) {
              sectionsQuery.refetch();
            }
          }}
        />
      )}

      {tenant && project && (
        <EditSectionModal
          isOpen={showEditSection}
          tenant={tenant}
          project={project}
          documentSlug={documentSlug}
          section={editingSection}
          onClose={() => {
            setShowEditSection(false);
            setEditingSection(null);
          }}
          onUpdated={() => {
            sectionsQuery.refetch();
          }}
        />
      )}
    </>
  );
}
