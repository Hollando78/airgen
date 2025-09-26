import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { Modal, Select, Button, TextInput } from "../Modal";
import type { RequirementPattern, VerificationMethod, DocumentSectionRecord } from "../../types";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  sections: DocumentSectionRecord[];
  tenant: string;
  project: string;
  documentSlug: string;
}

type ImportFormat = "csv" | "reqif" | "json";
type ImportStep = "upload" | "mapping" | "validation" | "importing";

interface ParsedRequirement {
  [key: string]: string | number | undefined;
}

interface ColumnMapping {
  [csvColumn: string]: string; // Maps CSV column to requirement field
}

const REQUIREMENT_FIELDS = [
  { value: "text", label: "Requirement Text (Required)" },
  { value: "pattern", label: "Pattern (EARS)" },
  { value: "verification", label: "Verification Method" },
  { value: "tags", label: "Tags (comma-separated)" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "category", label: "Category" },
  { value: "source", label: "Source" },
  { value: "rationale", label: "Rationale" },
  { value: "ignore", label: "Ignore Column" }
];

// Proper CSV parsing that handles quoted fields with commas
const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  result.push(current.trim());
  return result;
};

export function ImportModal({
  isOpen,
  onClose,
  documentName,
  sections,
  tenant,
  project,
  documentSlug
}: ImportModalProps): JSX.Element {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<ImportStep>("upload");
  const [format, setFormat] = useState<ImportFormat>("csv");
  const [targetSectionId, setTargetSectionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRequirement[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [validationResults, setValidationResults] = useState<{
    valid: ParsedRequirement[];
    invalid: { row: ParsedRequirement; errors: string[] }[];
  }>({ valid: [], invalid: [] });
  const [isProcessing, setIsProcessing] = useState(false);
  const [importOptions, setImportOptions] = useState({
    skipInvalid: true,
    updateExisting: false,
    createCustomAttributes: true
  });

  const formatOptions = [
    { value: "csv", label: "CSV File (.csv)" },
    { value: "reqif", label: "ReqIF File (.reqif)" },
    { value: "json", label: "JSON File (.json)" }
  ];

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseFile(selectedFile);
    }
  };

  const parseFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const text = await file.text();
      
      if (format === "csv") {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          throw new Error("CSV file must have at least a header row and one data row");
        }
        
        const headers = parseCSVLine(lines[0]);
        setCsvHeaders(headers);
        
        const data = lines.slice(1).map((line, index) => {
          const values = parseCSVLine(line);
          const row: ParsedRequirement = { _rowIndex: index + 2 };
          headers.forEach((header, i) => {
            row[header] = values[i] || '';
          });
          return row;
        });
        
        setParsedData(data);
        
        // Auto-map common columns
        const autoMapping: ColumnMapping = {};
        headers.forEach(header => {
          const lower = header.toLowerCase();
          if (lower.includes('text') || lower.includes('description') || lower.includes('requirement')) {
            autoMapping[header] = 'text';
          } else if (lower.includes('pattern')) {
            autoMapping[header] = 'pattern';
          } else if (lower.includes('verification') || lower.includes('verify')) {
            autoMapping[header] = 'verification';
          } else if (lower.includes('tag')) {
            autoMapping[header] = 'tags';
          } else if (lower.includes('priority')) {
            autoMapping[header] = 'priority';
          } else if (lower.includes('status')) {
            autoMapping[header] = 'status';
          } else if (lower.includes('category')) {
            autoMapping[header] = 'category';
          } else {
            autoMapping[header] = 'ignore';
          }
        });
        setColumnMapping(autoMapping);
        setStep("mapping");
        
      } else if (format === "reqif") {
        await parseReqIF(text);
      } else if (format === "json") {
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          setParsedData(data);
          setStep("validation");
        } else {
          throw new Error("JSON file must contain an array of requirements");
        }
      }
    } catch (error) {
      alert("Failed to parse file: " + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseReqIF = async (xmlText: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      
      // Extract spec objects (requirements)
      const specObjects = xmlDoc.getElementsByTagName("SPEC-OBJECT");
      const requirements: ParsedRequirement[] = [];
      
      for (let i = 0; i < specObjects.length; i++) {
        const specObject = specObjects[i];
        const req: ParsedRequirement = {
          _rowIndex: i + 1,
          id: specObject.getAttribute("IDENTIFIER") || '',
          ref: specObject.getAttribute("LONG-NAME") || ''
        };
        
        // Extract attribute values
        const attributeValues = specObject.getElementsByTagName("ATTRIBUTE-VALUE-STRING");
        for (let j = 0; j < attributeValues.length; j++) {
          const attrValue = attributeValues[j];
          const definitionRef = attrValue.getElementsByTagName("ATTRIBUTE-DEFINITION-STRING-REF")[0];
          const attrName = definitionRef?.textContent?.trim() || '';
          const value = attrValue.getAttribute("THE-VALUE") || '';
          
          // Map ReqIF attributes to our requirement fields
          if (attrName === "REQ_TEXT" || attrName.toLowerCase().includes("text")) {
            req.text = value;
          } else if (attrName === "REQ_PATTERN" || attrName.toLowerCase().includes("pattern")) {
            req.pattern = value;
          } else if (attrName === "REQ_VERIFICATION" || attrName.toLowerCase().includes("verification")) {
            req.verification = value;
          } else if (attrName && value) {
            // Store as custom attribute
            req[attrName] = value;
          }
        }
        
        requirements.push(req);
      }
      
      console.log("Parsed ReqIF requirements:", requirements);
      setParsedData(requirements);
      
      // Auto-validate ReqIF requirements since they don't need column mapping
      const valid: ParsedRequirement[] = [];
      const invalid: { row: ParsedRequirement; errors: string[] }[] = [];
      
      requirements.forEach(row => {
        const errors: string[] = [];
        
        // Validate required fields
        if (!row.text || typeof row.text !== 'string' || row.text.trim().length === 0) {
          errors.push("Requirement text is required");
        }
        
        // Validate pattern if provided (ignore empty strings)
        if (row.pattern && row.pattern.toString().trim() !== "" && !["ubiquitous", "event", "state", "unwanted", "optional"].includes(row.pattern as string)) {
          errors.push("Invalid pattern. Must be one of: ubiquitous, event, state, unwanted, optional");
        }
        
        // Validate verification if provided (ignore empty strings)
        if (row.verification && row.verification.toString().trim() !== "" && !["Test", "Analysis", "Inspection", "Demonstration"].includes(row.verification as string)) {
          errors.push("Invalid verification method. Must be one of: Test, Analysis, Inspection, Demonstration");
        }
        
        if (errors.length === 0) {
          valid.push(row);
        } else {
          invalid.push({ row, errors });
        }
      });
      
      console.log("ReqIF validation results:", { valid, invalid });
      setValidationResults({ valid, invalid });
      setStep("validation");
    } catch (error) {
      throw new Error("Invalid ReqIF format: " + (error as Error).message);
    }
  };

  const validateRequirements = () => {
    const valid: ParsedRequirement[] = [];
    const invalid: { row: ParsedRequirement; errors: string[] }[] = [];
    
    parsedData.forEach(row => {
      const errors: string[] = [];
      let mappedRow: ParsedRequirement = {};
      
      if (format === "csv") {
        // Apply column mapping
        Object.entries(columnMapping).forEach(([csvCol, field]) => {
          if (field !== "ignore" && row[csvCol] !== undefined) {
            mappedRow[field] = row[csvCol];
          }
        });
      } else {
        mappedRow = { ...row };
      }
      
      // Validate required fields
      if (!mappedRow.text || typeof mappedRow.text !== 'string' || mappedRow.text.trim().length === 0) {
        errors.push("Requirement text is required");
      }
      
      // Validate pattern if provided (ignore empty strings)
      if (mappedRow.pattern && mappedRow.pattern.toString().trim() !== "" && !["ubiquitous", "event", "state", "unwanted", "optional"].includes(mappedRow.pattern as string)) {
        errors.push("Invalid pattern. Must be one of: ubiquitous, event, state, unwanted, optional");
      }
      
      // Validate verification if provided (ignore empty strings)
      if (mappedRow.verification && mappedRow.verification.toString().trim() !== "" && !["Test", "Analysis", "Inspection", "Demonstration"].includes(mappedRow.verification as string)) {
        errors.push("Invalid verification method. Must be one of: Test, Analysis, Inspection, Demonstration");
      }
      
      if (errors.length === 0) {
        valid.push(mappedRow);
      } else {
        invalid.push({ row: mappedRow, errors });
      }
    });
    
    console.log("Validation results:", { 
      valid: valid.length, 
      invalid: invalid.length,
      invalidDetails: invalid.map(item => ({ 
        row: item.row, 
        errors: item.errors 
      }))
    });
    setValidationResults({ valid, invalid });
    setStep("validation");
  };

  const performImport = async () => {
    if (!targetSectionId) {
      alert("Please select a target section");
      return;
    }
    
    setIsProcessing(true);
    try {
      const requirementsToImport = importOptions.skipInvalid 
        ? validationResults.valid 
        : [...validationResults.valid, ...validationResults.invalid.map(i => i.row)];
      
      for (const req of requirementsToImport) {
        const createRequest = {
          tenant,
          projectKey: project,
          documentSlug,
          sectionId: targetSectionId,
          text: String(req.text),
          pattern: req.pattern as RequirementPattern | undefined,
          verification: req.verification as VerificationMethod | undefined,
          tags: req.tags ? String(req.tags).split(',').map(t => t.trim()) : undefined
        };
        
        // Add custom attributes if enabled
        if (importOptions.createCustomAttributes) {
          const customAttrs: Record<string, any> = {};
          Object.entries(req).forEach(([key, value]) => {
            if (!['text', 'pattern', 'verification', 'tags', '_rowIndex'].includes(key) && value !== undefined) {
              customAttrs[key] = value;
            }
          });
          
          if (Object.keys(customAttrs).length > 0) {
            // Store custom attributes in suggestions field as JSON for now
            // In a real implementation, you might extend the backend to support custom fields
            createRequest.qaVerdict = JSON.stringify(customAttrs);
          }
        }
        
        await api.createRequirement(createRequest);
      }
      
      // Refresh the data
      await queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });
      await queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      
      alert(`Successfully imported ${requirementsToImport.length} requirements`);
      onClose();
      resetModal();
    } catch (error) {
      alert("Import failed: " + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetModal = () => {
    setStep("upload");
    setFile(null);
    setParsedData([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setValidationResults({ valid: [], invalid: [] });
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <Select
        label="Import Format"
        value={format}
        onChange={(e) => setFormat(e.target.value as ImportFormat)}
        options={formatOptions}
        help="Choose the format of your import file"
      />
      
      <div>
        <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "6px" }}>
          Select File
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept={format === "csv" ? ".csv" : format === "reqif" ? ".reqif" : ".json"}
          onChange={handleFileSelect}
          style={{
            width: "100%",
            padding: "8px",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "14px"
          }}
        />
      </div>
      
      {format === "csv" && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: "#f0f9ff", 
          border: "1px solid #bae6fd", 
          borderRadius: "6px",
          fontSize: "12px",
          color: "#0369a1"
        }}>
          <strong>CSV Format Guidelines:</strong>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            <li>First row should contain column headers</li>
            <li>At minimum, include a column for requirement text</li>
            <li>Common columns: Text, Pattern, Verification, Tags, Priority, Status</li>
            <li>Use commas to separate values, quotes for text with commas</li>
          </ul>
        </div>
      )}
    </div>
  );

  const renderMappingStep = () => (
    <div className="space-y-6">
      <div>
        <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>
          Map CSV Columns to Requirement Fields
        </h4>
        <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 16px 0" }}>
          Map each CSV column to the appropriate requirement field. Columns mapped to "Ignore" will not be imported.
        </p>
      </div>
      
      <div style={{ 
        maxHeight: "300px", 
        overflowY: "auto",
        border: "1px solid #e5e7eb",
        borderRadius: "6px"
      }}>
        {csvHeaders.map((header, index) => (
          <div key={index} style={{
            padding: "12px",
            borderBottom: index < csvHeaders.length - 1 ? "1px solid #e5e7eb" : "none",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <div style={{ minWidth: "150px", fontWeight: "500" }}>
              {header}
            </div>
            <div style={{ flex: 1 }}>
              <select
                value={columnMapping[header] || "ignore"}
                onChange={(e) => setColumnMapping(prev => ({
                  ...prev,
                  [header]: e.target.value
                }))}
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "12px"
                }}
              >
                {REQUIREMENT_FIELDS.map(field => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", minWidth: "100px" }}>
              {parsedData[0]?.[header] ? `"${String(parsedData[0][header]).slice(0, 30)}..."` : "No data"}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ display: "flex", gap: "8px" }}>
        <Button variant="secondary" onClick={() => setStep("upload")}>
          Back
        </Button>
        <Button 
          onClick={validateRequirements}
          disabled={!Object.values(columnMapping).includes("text")}
        >
          Continue to Validation
        </Button>
      </div>
    </div>
  );

  const renderValidationStep = () => (
    <div className="space-y-6">
      <div>
        <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "600", marginBottom: "12px" }}>
          Import Validation Results
        </h4>
        <div style={{ display: "flex", gap: "24px", fontSize: "14px" }}>
          <span style={{ color: "#059669" }}>
            ✓ {validationResults.valid.length} valid requirements
          </span>
          <span style={{ color: "#dc2626" }}>
            ✗ {validationResults.invalid.length} invalid requirements
          </span>
        </div>
      </div>

      <Select
        label="Target Section"
        value={targetSectionId}
        onChange={(e) => setTargetSectionId(e.target.value)}
        options={sections.map(section => ({
          value: section.id,
          label: section.name
        }))}
        placeholder="Select section to import into"
        help="All requirements will be imported into this section"
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
              checked={importOptions.createCustomAttributes}
              onChange={(e) => setImportOptions(prev => ({ ...prev, createCustomAttributes: e.target.checked }))}
            />
            Store custom attributes (columns not mapped to standard fields)
          </label>
        </div>
      </div>
      
      {validationResults.invalid.length > 0 && (
        <div style={{
          maxHeight: "200px",
          overflowY: "auto",
          border: "1px solid #fecaca",
          borderRadius: "6px",
          backgroundColor: "#fef2f2"
        }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #fecaca", fontWeight: "600", fontSize: "12px" }}>
            Invalid Requirements
          </div>
          {validationResults.invalid.map((item, index) => (
            <div key={index} style={{ padding: "8px 12px", borderBottom: "1px solid #fecaca", fontSize: "12px" }}>
              <div style={{ fontWeight: "500" }}>Row {item.row._rowIndex}</div>
              <div style={{ color: "#dc2626", marginTop: "2px" }}>
                {item.errors.join(", ")}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div style={{ display: "flex", gap: "8px" }}>
        <Button variant="secondary" onClick={() => format === "csv" ? setStep("mapping") : setStep("upload")}>
          Back
        </Button>
        <Button 
          onClick={performImport}
          disabled={!targetSectionId || (validationResults.valid.length === 0 && importOptions.skipInvalid)}
          loading={isProcessing}
        >
          Import Requirements
        </Button>
      </div>
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
    upload: "Upload Import File",
    mapping: "Map Columns",
    validation: "Validate & Import",
    importing: "Importing..."
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Requirements"
      subtitle={`${stepTitles[step]} - ${documentName}`}
      size="large"
      footer={footer}
    >
      {isProcessing && step !== "importing" && (
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
          Processing file...
        </div>
      )}
      
      {step === "upload" && renderUploadStep()}
      {step === "mapping" && renderMappingStep()}
      {step === "validation" && renderValidationStep()}
    </Modal>
  );
}