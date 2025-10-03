import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../lib/client";
import { useAutoSave } from "../../hooks/useAutoSave";
import MDEditor from "@uiw/react-md-editor";
import rehypeSanitize from "rehype-sanitize";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { Modal } from "../Modal/Modal";
import "./markdownEditor.css";

interface MarkdownEditorViewProps {
  tenant: string;
  project: string;
  documentSlug: string;
  documentName: string;
  onClose: () => void;
}

// Remark plugin to convert directive syntax to HTML
function remarkDirectiveToHtml() {
  return (tree: any) => {
    visit(tree, (node) => {
      if (
        node.type === "containerDirective" ||
        node.type === "leafDirective" ||
        node.type === "textDirective"
      ) {
        const data = node.data || (node.data = {});
        const attributes = node.attributes || {};
        const tagName = node.name;

        if (tagName === "requirement") {
          // Extract ID and title from attributes
          const id = Object.keys(attributes).find(key => key.startsWith("#"))?.slice(1) || "";
          const title = attributes.title || id;

          // Convert to HTML
          data.hName = "div";
          data.hProperties = {
            className: ["requirement-block"],
            "data-id": id,
            "data-title": title
          };

          // Add requirement header
          node.children = [
            {
              type: "paragraph",
              data: {
                hName: "div",
                hProperties: { className: ["requirement-header"] }
              },
              children: [
                {
                  type: "html",
                  value: `<strong>${id}</strong>${title && title !== id ? ` - ${title}` : ""}`
                }
              ]
            },
            {
              type: "paragraph",
              data: {
                hName: "div",
                hProperties: { className: ["requirement-content"] }
              },
              children: node.children || []
            }
          ];
        } else if (tagName === "info") {
          data.hName = "div";
          data.hProperties = { className: ["info-block"] };
        } else if (tagName === "warning") {
          data.hName = "div";
          data.hProperties = { className: ["warning-block"] };
        } else if (tagName === "diagram") {
          // Diagram reference - render as clickable image with screenshot
          const id = attributes.id || attributes.name || "";
          const caption = attributes.caption || "";

          // Map diagram IDs to routes and thumbnail URLs
          const diagramRoutes: Record<string, string> = {
            "requirements-schema": "/requirements-schema",
            "architecture": "/architecture",
            "system-architecture": "/architecture"
          };

          const route = diagramRoutes[id] || "#";

          // Thumbnail URL will be served from thumbnail API
          const thumbnailUrl = `/api/thumbnails/diagrams/${id}?tenant=hollando&project=main-battle-tank`;

          data.hName = "div";
          data.hProperties = {
            className: ["diagram-block"],
            "data-diagram-id": id
          };

          node.children = [
            {
              type: "paragraph",
              data: {
                hName: "div",
                hProperties: { className: ["diagram-content"] }
              },
              children: [
                {
                  type: "html",
                  value: `
                    <a href="${route}" target="_blank" class="diagram-link" onclick="event.preventDefault(); window.open('${route}', '_blank', 'width=1200,height=800');">
                      <div class="diagram-preview">
                        <img
                          src="${thumbnailUrl}"
                          alt="${id} diagram preview"
                          style="width: 100%; height: auto; border-radius: 4px; background: white;"
                          onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                        />
                        <svg width="100%" height="200" viewBox="0 0 400 200" style="background: white; border-radius: 4px; display: none;">
                          <rect x="50" y="40" width="100" height="60" fill="#e0f2fe" stroke="#3b82f6" stroke-width="2" rx="4"/>
                          <text x="100" y="75" text-anchor="middle" fill="#1e40af" font-size="12" font-weight="bold">Diagram</text>
                          <rect x="250" y="40" width="100" height="60" fill="#f0f9ff" stroke="#60a5fa" stroke-width="2" rx="4"/>
                          <text x="300" y="75" text-anchor="middle" fill="#1e40af" font-size="12">Component</text>
                          <line x1="150" y1="70" x2="250" y2="70" stroke="#3b82f6" stroke-width="2" marker-end="url(#arrowblue)"/>
                          <defs>
                            <marker id="arrowblue" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                              <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
                            </marker>
                          </defs>
                        </svg>
                      </div>
                      <div class="diagram-info">
                        <strong>📊 ${id}</strong>
                        ${caption ? `<br/><em>${caption}</em>` : ""}
                        <br/><span style="color: #3b82f6; font-size: 0.875rem;">Click to open in new window →</span>
                      </div>
                    </a>
                  `
                }
              ]
            }
          ];
        } else if (tagName === "surrogate") {
          // Surrogate document reference with thumbnail
          const slug = attributes.slug || "";
          const name = attributes.name || slug;
          const caption = attributes.caption || "Surrogate Document";
          const thumbnailUrl = `/api/thumbnails/surrogates/hollando/main-battle-tank/${slug}`;

          data.hName = "div";
          data.hProperties = { className: ["surrogate-block"], "data-slug": slug };

          node.children = [
            {
              type: "paragraph",
              data: {
                hName: "div",
                hProperties: { className: ["surrogate-content"] }
              },
              children: [
                {
                  type: "html",
                  value: `
                    <div class="surrogate-preview">
                      <img
                        src="${thumbnailUrl}"
                        alt="${name} preview"
                        style="width: 100%; max-width: 400px; height: auto; border-radius: 4px;"
                      />
                    </div>
                    <div class="surrogate-info" style="margin-top: 0.5rem; text-align: center;">
                      <span style="color: #9333ea; font-size: 0.875rem;">${caption}</span>
                    </div>
                  `
                }
              ]
            }
          ];
        } else {
          // Default: render as div with class
          data.hName = "div";
          data.hProperties = { className: [`directive-${tagName}`] };
        }
      }
    });
  };
}

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

  const autosaveKey = `airgen:draft:${tenant}:${project}:${documentSlug}`;

  // Load document content
  const { data: documentData, isLoading } = useQuery({
    queryKey: ["markdown-content", tenant, project, documentSlug],
    queryFn: () => api.getMarkdownContent(tenant, project, documentSlug),
    staleTime: 0
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
    }
  }, [documentData]);

  // Auto-save to localStorage
  const { clearDraft, loadDraft } = useAutoSave({
    key: autosaveKey,
    content,
    debounceMs: 1000
  });

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
    onSuccess: (data) => {
      setIsDirty(false);
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["markdown-content", tenant, project, documentSlug] });
      queryClient.invalidateQueries({ queryKey: ["requirements", tenant, project] });
      queryClient.invalidateQueries({ queryKey: ["sections", tenant, project, documentSlug] });

      if (data.validation) {
        setValidationErrors(data.validation.errors || []);
      }
    },
    onError: (error: any) => {
      setNotification({ type: "error", message: `Save failed: ${error.message}` });
    }
  });

  // Validation mutation (real-time)
  const validateMutation = useMutation({
    mutationFn: (contentToValidate: string) =>
      api.validateMarkdown(tenant, project, documentSlug, contentToValidate),
    onSuccess: (data) => {
      const errors = [
        ...(data.validation.errors || []),
        ...(data.validation.warnings || [])
      ];
      setValidationErrors(errors);
    }
  });

  // Debounced validation
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (content && content.trim()) {
        validateMutation.mutate(content);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [content]);

  const handleSave = () => {
    saveMutation.mutate(false);
  };

  const handlePublish = () => {
    setShowPublishConfirm(true);
  };

  const insertTemplate = (template: string) => {
    const textarea = document.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      // Store scroll position and cursor position in refs
      scrollPositionRef.current = textarea.scrollTop;
      cursorPositionRef.current = start + template.length;

      const newContent = content.substring(0, start) + template + content.substring(end);
      setContent(newContent);
      setIsDirty(true);
    }
    setShowInsertMenu(false);
  };

  // Effect to restore scroll and cursor position after content update
  useEffect(() => {
    if (scrollPositionRef.current !== null && cursorPositionRef.current !== null) {
      const textarea = document.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement;
      if (textarea) {
        textarea.scrollTop = scrollPositionRef.current;
        textarea.setSelectionRange(cursorPositionRef.current, cursorPositionRef.current);
        scrollPositionRef.current = null;
        cursorPositionRef.current = null;
      }
    }
  }, [content]);

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
    <div className="markdown-editor-view">
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

        <div className={`markdown-editor-container ${showAssetBrowser ? 'with-sidebar' : ''}`} data-color-mode="light">
          <MDEditor
            value={content}
            onChange={handleContentChange}
            height="calc(100vh - 200px)"
            preview={showPreview ? "live" : "edit"}
          previewOptions={{
            remarkPlugins: [remarkGfm, remarkDirective, remarkDirectiveToHtml],
            rehypePlugins: [[rehypeSanitize]]
          }}
          textareaProps={{
            placeholder: `# Document Title

## Section 1

:::requirement{#REQ-001 title="Requirement Title"}
When [trigger], the system shall [response] within [constraint].

**Pattern:** event
**Verification:** Test
:::

## Section 2

:::info
Information block for notes and guidance.
:::
`
          }}
        />
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

      {/* Publish Confirmation Modal */}
      <Modal
        isOpen={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        title="Publish Document"
        size="small"
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
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Publishing..." : "Publish"}
            </button>
          </>
        }
      >
        <p>This will validate and save the document to the database.</p>
        <p>Are you sure you want to publish?</p>
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
