/**
 * Refactored Import Modal with Universal Parser
 * Supports auto-detection and unified mapping for all file formats
 */

import { useState, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { Modal, Select, Button } from "../Modal";
import { MappingUI } from "./MappingUI";
import { UniversalParser, type ParsedDocument, type DocumentFormat } from "../../lib/universal-parser";
import type {
  RequirementPattern,
  VerificationMethod,
  DocumentSectionRecord,
  CreateRequirementRequest
} from "../../types";

interface ImportModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  sections: DocumentSectionRecord[];
  tenant: string;
  project: string;
  documentSlug: string;
  onImportComplete?: () => void;
}

type ImportStep = "upload" | "mapping" | "validation" | "importing";

export function ImportModalV2({
  isOpen,
  onClose,
  documentName,
  sections,
  tenant,
  project,
  documentSlug,
  onImportComplete
}: ImportModalV2Props): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<DocumentFormat | null>(null);
  const [parsedDoc, setParsedDoc] = useState<ParsedDocument | null>(null);
  const [fieldMappings, setFieldMappings] = useState<Map<string, string>>(new Map());
  const [targetSectionId, setTargetSectionId] = useState("");
  const [validCounts, setValidCounts] = useState({ valid: 0, invalid: 0, total: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [importOptions, setImportOptions] = useState({
    skipInvalid: true,
    storeCustomAttributes: true
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const parser = new UniversalParser();
      const result = await parser.parse(selectedFile);

      setDetectedFormat(result.format);
      setParsedDoc(result);
      setStep("mapping");

      toast.success(`Detected ${result.format.toUpperCase()} format with ${result.rows.length} requirements`);
    } catch (error) {
      console.error('Parse error:', error);
      toast.error(`Failed to parse file: ${(error as Error).message}`);
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMappingChange = (mappings: Map<string, string>) => {
    setFieldMappings(mappings);
  };

  const handleValidationComplete = (valid: number, invalid: number, total: number) => {
    setValidCounts({ valid, invalid, total });
  };

  const normalizePattern = (pattern: string): string => {
    if (!pattern) return "";
    const lower = pattern.toLowerCase();

    if (lower.includes('event') || lower.includes('when')) return 'event';
    if (lower.includes('state') || lower.includes('while')) return 'state';
    if (lower === 'ubiquitous' || lower.includes('ubiquitous')) return 'ubiquitous';
    if (lower.includes('unwanted') || lower.includes('if ')) return 'unwanted';
    if (lower.includes('optional') || lower.includes('where')) return 'optional';

    if (['event', 'state', 'ubiquitous', 'unwanted', 'optional'].includes(lower)) {
      return lower;
    }

    return "";
  };

  const performImport = async () => {
    if (!targetSectionId || !parsedDoc) {
      toast.warning("Please select a target section");
      return;
    }

    if (importOptions.skipInvalid && validCounts.valid === 0) {
      toast.warning("No valid requirements to import");
      return;
    }

    setIsProcessing(true);
    setStep("importing");

    try {
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < parsedDoc.rows.length; i++) {
        const row = parsedDoc.rows[i];

        // Build mapped requirement
        const mappedReq: Record<string, any> = {};
        const customAttrs: Record<string, any> = {};

        fieldMappings.forEach((targetField, sourceField) => {
          const value = row[sourceField];

          if (targetField === 'custom' && importOptions.storeCustomAttributes) {
            // Store as custom attribute with original field name
            customAttrs[sourceField] = value;
          } else if (targetField !== 'ignore' && value !== undefined && value !== null && String(value).trim()) {
            mappedReq[targetField] = value;
          }
        });

        // Validate required field
        if (!mappedReq.text || String(mappedReq.text).trim().length < 10) {
          if (importOptions.skipInvalid) {
            errorCount++;
            continue;
          }
        }

        // Normalize pattern
        if (mappedReq.pattern) {
          const normalized = normalizePattern(String(mappedReq.pattern));
          mappedReq.pattern = normalized || undefined;
        }

        // Build create request
        const createRequest: CreateRequirementRequest = {
          tenant,
          projectKey: project,
          documentSlug,
          sectionId: targetSectionId,
          text: String(mappedReq.text || '').trim(),
          pattern: mappedReq.pattern as RequirementPattern | undefined,
          verification: mappedReq.verification as VerificationMethod | undefined,
          rationale: mappedReq.rationale ? String(mappedReq.rationale) : undefined,
          tags: mappedReq.tags ? String(mappedReq.tags).split(',').map(t => t.trim()).filter(t => t) : undefined
        };

        // Add custom attributes if any
        if (Object.keys(customAttrs).length > 0) {
          createRequest.attributes = customAttrs;
        }

        // Add other standard fields if present
        if (mappedReq.priority) createRequest.priority = String(mappedReq.priority);
        if (mappedReq.status) createRequest.status = String(mappedReq.status);
        if (mappedReq.category) createRequest.category = String(mappedReq.category);
        if (mappedReq.source) createRequest.source = String(mappedReq.source);

        try {
          await api.createRequirement(createRequest);
          successCount++;
        } catch (error) {
          console.error(`Failed to create requirement at row ${i + 1}:`, error);
          errorCount++;
          if (!importOptions.skipInvalid) {
            throw error;
          }
        }
      }

      // Refresh the data
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      await queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });

      if (successCount > 0) {
        toast.success(`Successfully imported ${successCount} requirement${successCount > 1 ? 's' : ''}`);
      }

      if (errorCount > 0) {
        toast.warning(`${errorCount} requirement${errorCount > 1 ? 's' : ''} failed to import`);
      }

      onClose();
      onImportComplete?.();
      resetModal();
    } catch (error) {
      toast.error(`Import failed: ${(error as Error).message}`);
      setStep("validation");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetModal = () => {
    setStep("upload");
    setFile(null);
    setDetectedFormat(null);
    setParsedDoc(null);
    setFieldMappings(new Map());
    setValidCounts({ valid: 0, invalid: 0, total: 0 });
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div>
        <label style={{
          display: "block",
          fontSize: "14px",
          fontWeight: "500",
          color: "#374151",
          marginBottom: "6px"
        }}>
          Select File
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.docx,.doc,.reqif,.xml,.md,.markdown,.json"
          onChange={handleFileSelect}
          disabled={isProcessing}
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "14px",
            cursor: isProcessing ? "not-allowed" : "pointer"
          }}
        />
        <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
          Supported formats: CSV, DOCX, ReqIF, Markdown, JSON - Format will be auto-detected
        </div>
      </div>

      <div style={{
        padding: "12px",
        backgroundColor: "#f0f9ff",
        border: "1px solid #bae6fd",
        borderRadius: "6px",
        fontSize: "12px",
        color: "#0369a1"
      }}>
        <strong>Auto-Detection Features:</strong>
        <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
          <li>Automatically detects file format and structure</li>
          <li>Intelligently maps fields to requirement attributes</li>
          <li>Supports custom attributes for non-standard fields</li>
          <li>Provides confidence scores for field mappings</li>
        </ul>
      </div>
    </div>
  );

  const renderMappingStep = () => {
    if (!parsedDoc) return null;

    return (
      <div className="space-y-6">
        <div>
          <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>
            Field Mapping
          </h4>
          <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
            Review and adjust the detected field mappings. Fields marked as "Custom Attribute" will be preserved with their data.
          </p>
        </div>

        <MappingUI
          parsedDoc={parsedDoc}
          onMappingChange={handleMappingChange}
          onValidationComplete={handleValidationComplete}
        />

        <div style={{ display: "flex", gap: "8px" }}>
          <Button variant="secondary" onClick={() => {
            setStep("upload");
            setParsedDoc(null);
            setFile(null);
          }}>
            Back
          </Button>
          <Button
            onClick={() => setStep("validation")}
            disabled={validCounts.valid === 0}
          >
            Continue to Import ({validCounts.valid} valid)
          </Button>
        </div>
      </div>
    );
  };

  const renderValidationStep = () => (
    <div className="space-y-6">
      <div>
        <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>
          Ready to Import
        </h4>
        <div style={{ display: "flex", gap: "24px", fontSize: "14px" }}>
          <span style={{ color: "#059669" }}>
            ✓ {validCounts.valid} valid requirements
          </span>
          {validCounts.invalid > 0 && (
            <span style={{ color: "#dc2626" }}>
              ✗ {validCounts.invalid} with validation errors
            </span>
          )}
        </div>
      </div>

      <Select
        label="Target Section"
        value={targetSectionId}
        onChange={(e) => setTargetSectionId(e.target.value)}
        options={[
          { value: "", label: "Select a section..." },
          ...sections.map(section => ({
            value: section.id,
            label: section.name
          }))
        ]}
        help="All requirements will be imported into this section"
        required
      />

      <div>
        <h5 style={{ margin: 0, fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
          Import Options
        </h5>
        <div className="space-y-4">
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={importOptions.skipInvalid}
              onChange={(e) => setImportOptions(prev => ({ ...prev, skipInvalid: e.target.checked }))}
            />
            Skip invalid requirements (only import valid ones)
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={importOptions.storeCustomAttributes}
              onChange={(e) => setImportOptions(prev => ({ ...prev, storeCustomAttributes: e.target.checked }))}
            />
            Store custom attributes (fields not mapped to standard fields)
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <Button variant="secondary" onClick={() => setStep("mapping")}>
          Back to Mapping
        </Button>
        <Button
          onClick={performImport}
          disabled={!targetSectionId || (validCounts.valid === 0 && importOptions.skipInvalid)}
          loading={isProcessing}
        >
          Import {validCounts.valid} Requirements
        </Button>
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div style={{
      padding: "32px",
      textAlign: "center"
    }}>
      <div style={{
        width: "48px",
        height: "48px",
        border: "4px solid #e5e7eb",
        borderTopColor: "#3b82f6",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
        margin: "0 auto 16px"
      }} />
      <div style={{ fontSize: "16px", fontWeight: "500", marginBottom: "8px" }}>
        Importing Requirements...
      </div>
      <div style={{ fontSize: "14px", color: "#6b7280" }}>
        Please wait while we import your requirements
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  const footer = step === "upload" ? (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </>
  ) : null;

  const stepTitles = {
    upload: "Upload File",
    mapping: "Map Fields",
    validation: "Review & Import",
    importing: "Importing..."
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === "importing" ? () => {} : onClose}
      title="Import Requirements"
      subtitle={`${stepTitles[step]} - ${documentName}`}
      size="large"
      footer={footer}
      dismissible={step !== "importing"}
    >
      {isProcessing && step === "upload" && (
        <div style={{
          padding: "12px",
          backgroundColor: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: "6px",
          marginBottom: "16px",
          textAlign: "center",
          fontSize: "14px",
          color: "#0369a1"
        }}>
          Analyzing file...
        </div>
      )}

      {step === "upload" && renderUploadStep()}
      {step === "mapping" && renderMappingStep()}
      {step === "validation" && renderValidationStep()}
      {step === "importing" && renderImportingStep()}
    </Modal>
  );
}
