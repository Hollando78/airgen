import { useState } from "react";
import { Modal, Select, Button } from "../Modal";
import type { DocumentSectionRecord, RequirementRecord } from "../../types";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentName: string;
  sections: (DocumentSectionRecord & { requirements: RequirementRecord[] })[];
  tenant: string;
  project: string;
  documentSlug: string;
}

type ExportFormat = "word" | "pdf" | "csv" | "reqif";
type ExportScope = "document" | "section" | "selected";

export function ExportModal({
  isOpen,
  onClose,
  documentName,
  sections,
  tenant,
  project,
  documentSlug
}: ExportModalProps): JSX.Element {
  const [format, setFormat] = useState<ExportFormat>("word");
  const [scope, setScope] = useState<ExportScope>("document");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeQaData, setIncludeQaData] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const formatOptions = [
    { value: "word", label: "HTML Document (.html)" },
    { value: "pdf", label: "PDF Document (.pdf)" },
    { value: "csv", label: "CSV Spreadsheet (.csv)" },
    { value: "reqif", label: "ReqIF Exchange Format (.reqif)" }
  ];

  const scopeOptions = [
    { value: "document", label: "Entire Document" },
    { value: "section", label: "Single Section" }
  ];

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // Determine what to export based on scope
      let exportData;
      if (scope === "document") {
        exportData = sections;
      } else if (scope === "section" && selectedSectionId) {
        exportData = sections.filter(s => s.id === selectedSectionId);
      } else {
        throw new Error("Please select a section to export");
      }

      // Generate export based on format
      switch (format) {
        case "word":
          await exportToWord(exportData);
          break;
        case "pdf":
          await exportToPdf(exportData);
          break;
        case "csv":
          await exportToCsv(exportData);
          break;
        case "reqif":
          await exportToReqif(exportData);
          break;
      }
      
      onClose();
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed: " + (error as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToWord = async (data: typeof sections) => {
    // Create Word document content
    let content = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${documentName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
        h2 { color: #374151; margin-top: 30px; }
        .requirement { margin: 15px 0; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; }
        .requirement-header { font-weight: bold; color: #1f2937; margin-bottom: 8px; }
        .requirement-text { margin: 8px 0; line-height: 1.5; }
        .metadata { font-size: 12px; color: #6b7280; margin-top: 8px; }
        .metadata span { margin-right: 15px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
        th { background-color: #f9fafb; }
    </style>
</head>
<body>
    <h1>${documentName}</h1>
    <p><strong>Project:</strong> ${project} | <strong>Tenant:</strong> ${tenant}</p>
    <p><strong>Exported:</strong> ${new Date().toLocaleString()}</p>
`;

    data.forEach(section => {
      content += `
    <h2>${section.name}</h2>
    ${section.description ? `<p><em>${section.description}</em></p>` : ''}
    <p><strong>Requirements Count:</strong> ${section.requirements.length}</p>
`;

      if (section.requirements.length > 0) {
        section.requirements.forEach(req => {
          content += `
    <div class="requirement">
        <div class="requirement-header">${req.ref}</div>
        <div class="requirement-text">${req.text}</div>
        ${includeMetadata ? `
        <div class="metadata">
            ${req.pattern ? `<span><strong>Pattern:</strong> ${req.pattern}</span>` : ''}
            ${req.verification ? `<span><strong>Verification:</strong> ${req.verification}</span>` : ''}
            ${includeQaData && req.qaScore ? `<span><strong>QA Score:</strong> ${req.qaScore}</span>` : ''}
            ${includeQaData && req.qaVerdict ? `<span><strong>QA Verdict:</strong> ${req.qaVerdict}</span>` : ''}
        </div>
        ` : ''}
    </div>
`;
        });
      }
    });

    content += `
</body>
</html>
`;

    // Create and download the file
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName.replace(/[^a-z0-9]/gi, '_')}_export.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToPdf = async (data: typeof sections) => {
    // For PDF, we'll create an HTML version and let the browser handle PDF generation
    const content = await generateHtmlContent(data);
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(content);
      newWindow.document.close();
      setTimeout(() => {
        newWindow.print();
      }, 500);
    }
  };

  const exportToCsv = async (data: typeof sections) => {
    let csvContent = "Section,Requirement ID,Requirement Text,Pattern,Verification,QA Score,QA Verdict,Created At,Updated At\n";
    
    data.forEach(section => {
      section.requirements.forEach(req => {
        const row = [
          `"${section.name}"`,
          `"${req.ref}"`,
          `"${req.text.replace(/"/g, '""')}"`,
          `"${req.pattern || ''}"`,
          `"${req.verification || ''}"`,
          req.qaScore || '',
          `"${req.qaVerdict || ''}"`,
          `"${req.createdAt}"`,
          `"${req.updatedAt}"`
        ].join(',');
        csvContent += row + "\n";
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName.replace(/[^a-z0-9]/gi, '_')}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportToReqif = async (data: typeof sections) => {
    // Generate ReqIF XML format
    let reqifContent = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/ReqIF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="REQIF_${Date.now()}">
      <CREATION-TIME>${new Date().toISOString()}</CREATION-TIME>
      <REQ-IF-TOOL-ID>AIRGen</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <SOURCE-TOOL-ID>AIRGen Studio</SOURCE-TOOL-ID>
      <TITLE>${documentName}</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <DATATYPES>
        <DATATYPE-DEFINITION-STRING IDENTIFIER="STRING_TYPE" LONG-NAME="String">
          <MAX-LENGTH>1000</MAX-LENGTH>
        </DATATYPE-DEFINITION-STRING>
      </DATATYPES>
      <SPEC-TYPES>
        <SPEC-OBJECT-TYPE IDENTIFIER="REQUIREMENT_TYPE" LONG-NAME="Requirement">
          <SPEC-ATTRIBUTES>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="REQ_TEXT" LONG-NAME="Text">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>STRING_TYPE</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="REQ_PATTERN" LONG-NAME="Pattern">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>STRING_TYPE</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
            <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="REQ_VERIFICATION" LONG-NAME="Verification">
              <TYPE><DATATYPE-DEFINITION-STRING-REF>STRING_TYPE</DATATYPE-DEFINITION-STRING-REF></TYPE>
            </ATTRIBUTE-DEFINITION-STRING>
          </SPEC-ATTRIBUTES>
        </SPEC-OBJECT-TYPE>
      </SPEC-TYPES>
      <SPEC-OBJECTS>
`;

    data.forEach(section => {
      section.requirements.forEach(req => {
        reqifContent += `
        <SPEC-OBJECT IDENTIFIER="${req.id}" LONG-NAME="${req.ref}">
          <TYPE><SPEC-OBJECT-TYPE-REF>REQUIREMENT_TYPE</SPEC-OBJECT-TYPE-REF></TYPE>
          <VALUES>
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${req.text.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}">
              <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>REQ_TEXT</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            ${req.pattern ? `
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${req.pattern}">
              <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>REQ_PATTERN</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            ` : ''}
            ${req.verification ? `
            <ATTRIBUTE-VALUE-STRING THE-VALUE="${req.verification}">
              <DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>REQ_VERIFICATION</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION>
            </ATTRIBUTE-VALUE-STRING>
            ` : ''}
          </VALUES>
        </SPEC-OBJECT>
`;
      });
    });

    reqifContent += `
      </SPEC-OBJECTS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>
`;

    const blob = new Blob([reqifContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName.replace(/[^a-z0-9]/gi, '_')}_export.reqif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateHtmlContent = async (data: typeof sections) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${documentName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
        h2 { color: #374151; margin-top: 30px; page-break-before: auto; }
        .requirement { margin: 15px 0; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; page-break-inside: avoid; }
        .requirement-header { font-weight: bold; color: #1f2937; margin-bottom: 8px; }
        .requirement-text { margin: 8px 0; }
        .metadata { font-size: 12px; color: #6b7280; margin-top: 8px; }
        .metadata span { margin-right: 15px; }
        @media print { 
            body { margin: 20px; }
            .requirement { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <h1>${documentName}</h1>
    <p><strong>Project:</strong> ${project} | <strong>Tenant:</strong> ${tenant}</p>
    <p><strong>Exported:</strong> ${new Date().toLocaleString()}</p>
    ${data.map(section => `
        <h2>${section.name}</h2>
        ${section.description ? `<p><em>${section.description}</em></p>` : ''}
        ${section.requirements.map(req => `
            <div class="requirement">
                <div class="requirement-header">${req.ref}</div>
                <div class="requirement-text">${req.text}</div>
                ${includeMetadata ? `
                <div class="metadata">
                    ${req.pattern ? `<span><strong>Pattern:</strong> ${req.pattern}</span>` : ''}
                    ${req.verification ? `<span><strong>Verification:</strong> ${req.verification}</span>` : ''}
                    ${includeQaData && req.qaScore ? `<span><strong>QA Score:</strong> ${req.qaScore}</span>` : ''}
                </div>
                ` : ''}
            </div>
        `).join('')}
    `).join('')}
</body>
</html>`;
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button 
        onClick={handleExport}
        loading={isExporting}
        disabled={scope === "section" && !selectedSectionId}
      >
        Export {format.toUpperCase()}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Document"
      subtitle={`Export ${documentName} in various formats`}
      size="medium"
      footer={footer}
    >
      <div className="space-y-6">
        <Select
          label="Export Format"
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          options={formatOptions}
          help="Choose the output format for your export"
        />

        <Select
          label="Export Scope"
          value={scope}
          onChange={(e) => {
            setScope(e.target.value as ExportScope);
            if (e.target.value !== "section") {
              setSelectedSectionId("");
            }
          }}
          options={scopeOptions}
          help="Choose what to include in the export"
        />

        {scope === "section" && (
          <Select
            label="Select Section"
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            options={sections.map(section => ({
              value: section.id,
              label: `${section.name} (${section.requirements.length} requirements)`
            }))}
            placeholder="Choose a section to export"
            help="Select which section to export"
          />
        )}

        <div className="space-y-4">
          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>Export Options</h4>
          
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={includeMetadata}
              onChange={(e) => setIncludeMetadata(e.target.checked)}
            />
            Include requirement metadata (pattern, verification method)
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
            <input
              type="checkbox"
              checked={includeQaData}
              onChange={(e) => setIncludeQaData(e.target.checked)}
            />
            Include QA data (scores, verdicts, suggestions)
          </label>
        </div>

        <div style={{ 
          padding: "12px", 
          backgroundColor: "#f0f9ff", 
          border: "1px solid #bae6fd", 
          borderRadius: "6px",
          fontSize: "12px",
          color: "#0369a1"
        }}>
          <strong>Format Notes:</strong>
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            <li><strong>HTML:</strong> Web format that can be opened in browsers or imported into Word</li>
            <li><strong>PDF:</strong> Opens print dialog for PDF generation</li>
            <li><strong>CSV:</strong> Spreadsheet format for data analysis</li>
            <li><strong>ReqIF:</strong> Requirements Interchange Format for tool integration</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}