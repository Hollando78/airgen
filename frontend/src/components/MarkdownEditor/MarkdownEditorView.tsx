import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { useAutoSave } from "../../hooks/useAutoSave";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type * as Monaco from "monaco-editor";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Modal } from "../Modal/Modal";
import { MermaidRenderer } from "./MermaidRenderer";
import "./markdownEditor.css";

interface MarkdownEditorViewProps {
  tenant: string;
  project: string;
  documentSlug: string;
  documentName: string;
  onClose: () => void;
}

// Convert custom directives to HTML for preview
function preprocessMarkdown(markdown: string, tenant: string, project: string): string {
  let processed = markdown;

  // Convert :::requirement blocks
  processed = processed.replace(
    /:::requirement\{#([^\s}]+)(?:\s+title="([^"]*)")?\}\s*\n([\s\S]*?):::/g,
    (match, id, title, content) => {
      const titleText = title || id;
      return `<div class="requirement-block" data-id="${id}">
  <div class="requirement-header"><strong>${id}</strong>${title && title !== id ? ` - ${title}` : ''}</div>
  <div class="requirement-content">${content.trim()}</div>
</div>`;
    }
  );

  // Convert :::info blocks
  processed = processed.replace(
    /:::info(?:\s+([^\n]*))?\s*\n([\s\S]*?):::/g,
    (match, titleLine, content) => {
      return `<div class="info-block">ℹ️ ${content.trim()}</div>`;
    }
  );

  // Convert :::warning blocks
  processed = processed.replace(
    /:::warning(?:\s+([^\n]*))?\s*\n([\s\S]*?):::/g,
    (match, titleLine, content) => {
      return `<div class="warning-block">⚠️ ${content.trim()}</div>`;
    }
  );

  // Convert :::diagram blocks
  processed = processed.replace(
    /:::diagram\{(?:id|name)="([^"]+)"(?:\s+caption="([^"]*)")?\}\s*:::/g,
    (match, diagramId, caption) => {
      const thumbnailUrl = `/api/thumbnails/diagrams/${diagramId}?tenant=${tenant}&project=${project}`;
      const diagramRoutes: Record<string, string> = {
        "requirements-schema": "/requirements-schema",
        "architecture": "/architecture",
        "system-architecture": "/architecture"
      };
      const route = diagramRoutes[diagramId] || "#";

      return `<div class="diagram-block">
  <a href="${route}" target="_blank" class="diagram-link">
    <div class="diagram-preview">
      <img src="${thumbnailUrl}" alt="${diagramId} diagram preview" style="width: 100%; height: auto; border-radius: 4px; background: white;" />
    </div>
    <div class="diagram-info">
      <strong>📊 ${diagramId}</strong>${caption ? `<br/><em>${caption}</em>` : ''}
      <br/><span style="color: #3b82f6; font-size: 0.875rem;">Click to open in new window →</span>
    </div>
  </a>
</div>`;
    }
  );

  // Convert :::surrogate blocks
  processed = processed.replace(
    /:::surrogate\{slug="([^"]+)"(?:\s+(?:name|caption)="([^"]*)")?\}\s*:::/g,
    (match, slug, caption) => {
      const captionText = caption || slug;
      const thumbnailUrl = `/api/thumbnails/surrogates/${tenant}/${project}/${slug}`;

      return `<div class="surrogate-block">
  <div class="surrogate-preview">
    <img src="${thumbnailUrl}" alt="${captionText} preview" style="width: 100%; max-width: 400px; height: auto; border-radius: 4px;" />
  </div>
  <div class="surrogate-info" style="margin-top: 0.5rem; text-align: center;">
    <span style="color: #9333ea; font-size: 0.875rem;">${captionText}</span>
  </div>
</div>`;
    }
  );

  return processed;
}

// Custom components for ReactMarkdown to handle mermaid diagrams
const markdownComponents: Components = {
  code: ({ node, inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';

    // Render mermaid diagrams
    if (!inline && language === 'mermaid') {
      return <MermaidRenderer chart={String(children).trim()} />;
    }

    // Regular code blocks
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};

export function MarkdownEditorView({
  tenant,
  project,
  documentSlug,
  documentName,
  onClose
}: MarkdownEditorViewProps) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  const [draftToRecover, setDraftToRecover] = useState<{ content: string; timestamp: Date } | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showAssetBrowser, setShowAssetBrowser] = useState(false);

  const scrollPositionRef = useRef<number | null>(null);
  const cursorPositionRef = useRef<number | null>(null);
  const lastValidatedContentRef = useRef<string>("");
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const autosaveKey = `airgen:draft:${tenant}:${project}:${documentSlug}`;

  // Load document content
  const { data: documentData, isLoading } = useQuery({
    queryKey: ["markdown-content", tenant, project, documentSlug],
    queryFn: () => api.getMarkdownContent(tenant, project, documentSlug),
    staleTime: 0,
    refetchOnMount: true
  });

  // Load diagrams for asset browser
  const { data: diagramsData } = useQuery({
    queryKey: ["architecture-diagrams", tenant, project],
    queryFn: () => api.listArchitectureDiagrams(tenant, project),
    enabled: showAssetBrowser
  });

  // Load documents (includes surrogates) for asset browser
  const { data: documentsData } = useQuery({
    queryKey: ["documents", tenant, project],
    queryFn: () => api.listDocuments(tenant, project),
    enabled: showAssetBrowser
  });

  // Filter surrogates from documents
  const surrogatesData = documentsData ? {
    surrogates: documentsData.documents.filter((doc: any) => doc.kind === 'surrogate')
  } : { surrogates: [] };

  // Initialize content
  useEffect(() => {
    if (documentData?.content) {
      setContent(documentData.content);
      setIsDirty(false);
      lastValidatedContentRef.current = documentData.content;
      setValidationErrors([]);

      if (documentData.draft) {
        setNotification({ type: "success", message: "Loaded latest saved draft." });
      }
    }
  }, [documentData]);

  // Auto-save to localStorage
  const { clearDraft, loadDraft } = useAutoSave({
    key: autosaveKey,
    content,
    debounceMs: 1000
  });

  useEffect(() => {
    if (!notification) {
      return;
    }

    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Check for draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.content !== documentData?.content) {
      setDraftToRecover(draft);
      setShowDraftRecovery(true);
    }
  }, [documentData, loadDraft]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (validate: boolean) =>
      api.saveMarkdownContent(tenant, project, documentSlug, content, validate),
    onSuccess: (data, wasPublish) => {
      setIsDirty(false);
      clearDraft();
      lastValidatedContentRef.current = content;
      queryClient.invalidateQueries({ queryKey: ["markdown-content", tenant, project, documentSlug] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });

      if (data.validation) {
        const errors = [
          ...(data.validation.errors || []),
          ...(data.validation.warnings || [])
        ];
        setValidationErrors(errors);
      }

      setNotification({
        type: "success",
        message: wasPublish ? "Document published successfully." : "Draft saved to server."
      });
    },
    onError: (error: any) => {
      setNotification({ type: "error", message: `Save failed: ${error.message}` });
    }
  });

  // Validation mutation (real-time)
  const validateMutation = useMutation({
    mutationFn: (contentToValidate: string) =>
      api.validateMarkdown(tenant, project, documentSlug, contentToValidate),
    onSuccess: (data, variables) => {
      const errors = [
        ...(data.validation.errors || []),
        ...(data.validation.warnings || [])
      ];
      setValidationErrors(errors);
      lastValidatedContentRef.current = variables;
    }
  });

  const { mutate: triggerValidation, isPending: isValidationPending } = validateMutation;

  // Debounced validation (lightweight cadence)
  useEffect(() => {
    if (!content.trim()) {
      setValidationErrors([]);
      lastValidatedContentRef.current = "";
      return;
    }

    if (isValidationPending) {
      return;
    }

    if (content === lastValidatedContentRef.current) {
      return;
    }

    const timeout = setTimeout(() => {
      triggerValidation(content);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [content, triggerValidation, isValidationPending]);

  const handleSave = () => {
    saveMutation.mutate(false);
  };

  const handlePublish = () => {
    setShowPublishConfirm(true);
  };

  const insertTemplate = (template: string) => {
    if (!editorRef.current) {
      return;
    }

    const editor = editorRef.current;
    const selection = editor.getSelection();

    if (selection) {
      // Insert text at cursor position using Monaco API
      editor.executeEdits("insert-template", [
        {
          range: selection,
          text: template,
          forceMoveMarkers: true
        }
      ]);

      // Move cursor to end of inserted text
      const endPosition = {
        lineNumber: selection.startLineNumber,
        column: selection.startColumn + template.length
      };
      editor.setPosition(endPosition);
      editor.focus();
    }

    setShowInsertMenu(false);
  };

  const insertTemplates = {
    heading1: '# Heading 1\n\n',
    heading2: '## Heading 2\n\n',
    heading3: '### Heading 3\n\n',
    requirement: `:::requirement{#REQ-001 title="Requirement Title"}
When [trigger], the system shall [response] within [constraint].

**Pattern:** event
**Verification:** Test
:::

`,
    diagram: `:::diagram{id="diagram-id"}
:::

`,
    surrogate: `:::surrogate{slug="surrogate-slug" caption="Caption"}
:::

`,
    image: `![Image Description](image-url)

`,
    table: `| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |

`,
    bulletList: `- Item 1
- Item 2
- Item 3

`,
    numberedList: `1. First item
2. Second item
3. Third item

`,
    blockquote: `> This is a blockquote
> It can span multiple lines

`,
    codeBlock: `\`\`\`javascript
// Your code here
\`\`\`

`,
    infoBox: `:::info
Important information or note
:::

`,
    warningBox: `:::warning
Warning message
:::

`
  };

  const insertDiagram = (diagramId: string, diagramName: string) => {
    const template = `:::diagram{id="${diagramId}"}
:::

`;
    insertTemplate(template);
    setShowAssetBrowser(false);
  };

  const insertSurrogate = (surrogateSlug: string, surrogateName: string) => {
    const template = `:::surrogate{slug="${surrogateSlug}" caption="${surrogateName}"}
:::

`;
    insertTemplate(template);
    setShowAssetBrowser(false);
  };

  const confirmPublish = () => {
    setShowPublishConfirm(false);
    saveMutation.mutate(true);
  };

  const handleContentChange = (value?: string) => {
    setContent(value || "");
    setIsDirty(true);
  };

  if (isLoading) {
    return <div className="markdown-editor-loading">Loading document...</div>;
  }

  return (
    <div className="markdown-editor-view" data-color-mode="light">
      <div className="markdown-editor-header">
        <div className="markdown-editor-title">
          <h2>Edit: {documentName}</h2>
          {isDirty && <span className="unsaved-indicator">● Unsaved changes</span>}
        </div>
        <div className="markdown-editor-actions">
          <button
            className="markdown-editor-button"
            onClick={() => setShowAssetBrowser(!showAssetBrowser)}
          >
            📂 {showAssetBrowser ? "Hide" : "Show"} Assets
          </button>
          <button
            className="markdown-editor-button"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
          <button
            className="markdown-editor-button"
            onClick={handleSave}
            disabled={saveMutation.isPending || !isDirty}
          >
            {saveMutation.isPending ? "Saving..." : "Save Draft"}
          </button>
          <button
            className="markdown-editor-button primary"
            onClick={handlePublish}
            disabled={saveMutation.isPending}
          >
            Publish
          </button>
          <button className="markdown-editor-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="markdown-validation-panel">
          <h3>Validation Issues ({validationErrors.length})</h3>
          <ul>
            {validationErrors.map((error, i) => (
              <li key={i} className={`validation-${error.severity}`}>
                <strong>Line {error.line}:</strong> {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="markdown-insert-toolbar">
        <button
          className="insert-menu-toggle"
          onClick={() => setShowInsertMenu(!showInsertMenu)}
        >
          ➕ Insert Element
        </button>

        {showInsertMenu && (
          <div className="insert-menu-dropdown">
            <div className="insert-menu-section">
              <h4>Headings</h4>
              <button onClick={() => insertTemplate(insertTemplates.heading1)}>📝 Heading 1</button>
              <button onClick={() => insertTemplate(insertTemplates.heading2)}>📝 Heading 2</button>
              <button onClick={() => insertTemplate(insertTemplates.heading3)}>📝 Heading 3</button>
            </div>

            <div className="insert-menu-section">
              <h4>AIRGen Elements</h4>
              <button onClick={() => insertTemplate(insertTemplates.requirement)}>📋 Requirement</button>
              <button onClick={() => insertTemplate(insertTemplates.diagram)}>🔷 Diagram</button>
              <button onClick={() => insertTemplate(insertTemplates.surrogate)}>📄 Surrogate</button>
            </div>

            <div className="insert-menu-section">
              <h4>Content</h4>
              <button onClick={() => insertTemplate(insertTemplates.image)}>🖼️ Image</button>
              <button onClick={() => insertTemplate(insertTemplates.table)}>📊 Table</button>
              <button onClick={() => insertTemplate(insertTemplates.codeBlock)}>💻 Code Block</button>
            </div>

            <div className="insert-menu-section">
              <h4>Lists & Blocks</h4>
              <button onClick={() => insertTemplate(insertTemplates.bulletList)}>• Bullet List</button>
              <button onClick={() => insertTemplate(insertTemplates.numberedList)}>🔢 Numbered List</button>
              <button onClick={() => insertTemplate(insertTemplates.blockquote)}>💬 Quote</button>
              <button onClick={() => insertTemplate(insertTemplates.infoBox)}>ℹ️ Info Box</button>
              <button onClick={() => insertTemplate(insertTemplates.warningBox)}>⚠️ Warning Box</button>
            </div>
          </div>
        )}
      </div>

      <div className="markdown-editor-main-content">
        {showAssetBrowser && (
          <div className="markdown-asset-browser">
            <div className="asset-browser-header">
              <h3>📂 Available Assets</h3>
            </div>

            <div className="asset-browser-section">
              <h4>🔷 Diagrams</h4>
              <div className="asset-list">
                {diagramsData?.diagrams?.map((diagram: any) => (
                  <div
                    key={diagram.id}
                    className="asset-item"
                    onClick={() => insertDiagram(diagram.id, diagram.name)}
                  >
                    <div className="asset-thumbnail">
                      <img
                        src={`/api/thumbnails/diagrams/${diagram.id}?tenant=${tenant}&project=${project}`}
                        alt={diagram.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f0f9ff" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%233b82f6">🔷</text></svg>';
                        }}
                      />
                    </div>
                    <div className="asset-info">
                      <div className="asset-name">{diagram.name}</div>
                      <div className="asset-id">{diagram.id}</div>
                    </div>
                  </div>
                ))}
                {(!diagramsData?.diagrams || diagramsData.diagrams.length === 0) && (
                  <div className="asset-empty">No diagrams available</div>
                )}
              </div>
            </div>

            <div className="asset-browser-section">
              <h4>📄 Surrogates</h4>
              <div className="asset-list">
                {surrogatesData?.surrogates?.map((surrogate: any) => (
                  <div
                    key={surrogate.slug}
                    className="asset-item"
                    onClick={() => insertSurrogate(surrogate.slug, surrogate.name)}
                  >
                    <div className="asset-thumbnail">
                      <img
                        src={`/api/thumbnails/surrogates/${tenant}/${project}/${surrogate.slug}`}
                        alt={surrogate.name}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23faf5ff" width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23a855f7">📄</text></svg>';
                        }}
                      />
                    </div>
                    <div className="asset-info">
                      <div className="asset-name">{surrogate.name}</div>
                      <div className="asset-id">{surrogate.slug}</div>
                    </div>
                  </div>
                ))}
                {(!surrogatesData?.surrogates || surrogatesData.surrogates.length === 0) && (
                  <div className="asset-empty">No surrogates available</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`markdown-editor-split-view ${showAssetBrowser ? 'with-sidebar' : ''}`}>
          <div className="markdown-editor-pane">
            <Editor
              height="100%"
              defaultLanguage="markdown"
              language="markdown"
              value={content}
              onChange={(value) => handleContentChange(value || "")}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              theme="vs"
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: "on",
                rulers: [80, 120],
                wordWrap: "on",
                wrappingIndent: "same",
                automaticLayout: true,
                scrollBeyondLastLine: true,
                renderWhitespace: "selection",
                bracketPairColorization: { enabled: true },
                suggest: {
                  showWords: true,
                  showSnippets: true
                },
                quickSuggestions: {
                  other: true,
                  comments: true,
                  strings: true
                },
                parameterHints: { enabled: true },
                folding: true,
                foldingStrategy: "indentation",
                showFoldingControls: "always",
                links: true,
                colorDecorators: true,
                mouseWheelZoom: true,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on"
              }}
            />
          </div>
          {showPreview && (
            <div className="markdown-preview-pane">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={markdownComponents}
              >
                {preprocessMarkdown(content, tenant, project)}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      <div className="markdown-editor-footer">
        <div className="markdown-editor-stats">
          <span>Characters: {content.length}</span>
          <span>Lines: {content.split("\n").length}</span>
        </div>
        <div className="markdown-editor-help">
          <a
            href="https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
            target="_blank"
            rel="noopener noreferrer"
          >
            Markdown Guide
          </a>
        </div>
      </div>

      {/* Draft Recovery Modal */}
      <Modal
        isOpen={showDraftRecovery}
        onClose={() => setShowDraftRecovery(false)}
        title="Unsaved Draft Found"
        size="small"
        footer={
          <>
            <button
              className="button button--secondary"
              onClick={() => {
                setShowDraftRecovery(false);
                clearDraft();
              }}
            >
              Discard Draft
            </button>
            <button
              className="button button--primary"
              onClick={() => {
                if (draftToRecover) {
                  setContent(draftToRecover.content);
                  setIsDirty(true);
                }
                setShowDraftRecovery(false);
              }}
            >
              Restore Draft
            </button>
          </>
        }
      >
        <p>
          Found unsaved changes from{" "}
          <strong>{draftToRecover?.timestamp.toLocaleString()}</strong>.
        </p>
        <p>Would you like to restore your draft?</p>
      </Modal>

      <Modal
        isOpen={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        title="Publish Document"
        footer={
          <>
            <button
              className="button button--secondary"
              onClick={() => setShowPublishConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="button button--primary"
              onClick={confirmPublish}
              disabled={saveMutation.isPending || validationErrors.some(error => error.severity === 'error')}
            >
              {saveMutation.isPending ? "Publishing..." : "Publish"}
            </button>
          </>
        }
      >
        <p>
          Publishing validates your markdown and synchronizes updates with Neo4j.
        </p>
        {validationErrors.length > 0 ? (
          <div style={{ marginTop: '12px' }}>
            <p style={{ marginBottom: '8px' }}>
              Current validation results:
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
              {validationErrors.slice(0, 5).map((error, idx) => (
                <li key={idx} style={{ color: error.severity === 'error' ? '#dc3545' : '#856404' }}>
                  <strong>Line {error.line}:</strong> {error.message}
                </li>
              ))}
              {validationErrors.length > 5 && (
                <li style={{ color: '#6c757d' }}>…and {validationErrors.length - 5} more issue(s)</li>
              )}
            </ul>
            {validationErrors.some(error => error.severity === 'error') && (
              <p style={{ color: '#dc3545', marginTop: '12px' }}>
                Resolve blocking errors before publishing.
              </p>
            )}
          </div>
        ) : (
          <p style={{ marginTop: '12px', color: '#198754' }}>No validation issues detected in the latest check.</p>
        )}
      </Modal>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`markdown-editor-notification markdown-editor-notification--${notification.type}`}
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            padding: "12px 20px",
            borderRadius: "4px",
            backgroundColor: notification.type === "error" ? "#dc3545" : "#28a745",
            color: "white",
            zIndex: 10000,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
          }}
        >
          {notification.message}
          <button
            onClick={() => setNotification(null)}
            style={{
              marginLeft: "12px",
              background: "none",
              border: "none",
              color: "white",
              cursor: "pointer",
              fontSize: "18px"
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
