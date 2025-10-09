# Baseline Read-Only Project View - Implementation Plan

## Executive Summary

**Goal:** Enable users to view their entire project (requirements, documents, architecture, trace links) as it existed at any baseline snapshot, using the existing UI in read-only mode.

**Approach:** Extend existing routes and components to support a "baseline mode" that loads data from version snapshots instead of current state, while disabling all mutation operations.

**Effort Estimate:** 5-7 days for full implementation + 2-3 days for testing

**Key Benefits:**
- Reuses 95% of existing UI code
- Familiar navigation for users
- Full project context at any point in time
- Natural workflows (browse, search, filter - just can't edit)

---

## 1. Architecture Design

### 1.1 URL Structure

**Current URLs:**
```
/requirements
/documents
/documents/:documentSlug
/architecture
/trace-links
/graph-viewer
```

**New Baseline URLs:**
```
/baselines/:baselineRef/requirements
/baselines/:baselineRef/documents
/baselines/:baselineRef/documents/:documentSlug
/baselines/:baselineRef/architecture
/baselines/:baselineRef/trace-links
/baselines/:baselineRef/graph-viewer
```

**Navigation Flow:**
```
/baselines (list view)
  → Click "BL-REL-1.0" row
  → Navigate to /baselines/BL-REL-1.0/requirements
  → User can navigate to other tabs (documents, architecture)
  → URLs update: /baselines/BL-REL-1.0/documents
```

### 1.2 Data Flow Architecture

```
┌─────────────────────────────────────────────────┐
│           User clicks baseline row              │
└─────────────────────────────────┬───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────┐
│  Navigate to /baselines/:baselineRef/requirements│
└─────────────────────────────────┬───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────┐
│  Route detects baseline mode from URL           │
│  Sets context: { mode: "baseline", ref: "..." } │
└─────────────────────────────────┬───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────┐
│  Component queries baseline snapshot data        │
│  GET /api/baselines/:tenant/:project/:ref        │
└─────────────────────────────────┬───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────┐
│  Extract relevant entity versions:               │
│  - requirementVersions[]                         │
│  - documentVersions[]                            │
│  - diagramVersions[]                             │
│  - traceLinkVersions[]                           │
└─────────────────────────────────┬───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────┐
│  Render existing UI components with:             │
│  - Snapshot data instead of current data         │
│  - readOnly={true} flag                          │
│  - All edit operations disabled                  │
└──────────────────────────────────────────────────┘
```

### 1.3 Context Provider Design

**New Context: `BaselineViewContext`**

```typescript
// frontend/src/contexts/BaselineViewContext.tsx

type BaselineViewMode = "current" | "baseline";

type BaselineViewContextValue = {
  mode: BaselineViewMode;
  baselineRef: string | null;
  baseline: BaselineSnapshot | null;
  isLoading: boolean;
  error: Error | null;
  exitBaselineView: () => void;
};

export function BaselineViewProvider({ children }) {
  const { baselineRef } = useParams();
  const navigate = useNavigate();

  const mode: BaselineViewMode = baselineRef ? "baseline" : "current";

  const baselineQuery = useQuery({
    queryKey: ["baseline-snapshot", tenant, project, baselineRef],
    queryFn: () => api.getBaselineDetails(tenant, project, baselineRef!),
    enabled: mode === "baseline"
  });

  const exitBaselineView = () => {
    // Navigate back to current view
    const currentPath = location.pathname.replace(`/baselines/${baselineRef}`, "");
    navigate(currentPath);
  };

  return (
    <BaselineViewContext.Provider value={{
      mode,
      baselineRef,
      baseline: baselineQuery.data,
      isLoading: baselineQuery.isLoading,
      error: baselineQuery.error,
      exitBaselineView
    }}>
      {children}
    </BaselineViewContext.Provider>
  );
}
```

---

## 2. Backend Changes

### 2.1 API Endpoint Enhancement

**Current Endpoint:**
```typescript
GET /api/baselines/:tenant/:project/:baselineRef
// Returns: { baseline: BaselineRecord, versions: {...} }
```

**Enhancement Needed:**
Add structured version data extraction for each entity type:

```typescript
// backend/src/services/graph/requirement-baselines.ts

export async function getBaselineDetails(
  tenant: string,
  projectKey: string,
  baselineRef: string
): Promise<BaselineSnapshot> {
  const session = getSession();

  try {
    // Get baseline metadata
    const baseline = await getBaseline(tenant, projectKey, baselineRef);

    // Get all version snapshots
    const requirementVersions = await getBaselineRequirementVersions(session, baseline.id);
    const documentVersions = await getBaselineDocumentVersions(session, baseline.id);
    const sectionVersions = await getBaselineSectionVersions(session, baseline.id);
    const diagramVersions = await getBaselineDiagramVersions(session, baseline.id);
    const blockVersions = await getBaselineBlockVersions(session, baseline.id);
    const connectorVersions = await getBaselineConnectorVersions(session, baseline.id);
    const traceLinkVersions = await getBaselineTraceLinkVersions(session, baseline.id);
    const linksetVersions = await getBaselineLinksetVersions(session, baseline.id);
    const infoVersions = await getBaselineInfoVersions(session, baseline.id);
    const surrogateVersions = await getBaselineSurrogateVersions(session, baseline.id);

    return {
      baseline,
      requirementVersions,
      documentVersions,
      sectionVersions,
      diagramVersions,
      blockVersions,
      connectorVersions,
      traceLinkVersions,
      linksetVersions,
      infoVersions,
      surrogateVersions
    };
  } finally {
    await session.close();
  }
}
```

### 2.2 Version Query Functions

**Pattern for each entity type:**

```typescript
async function getBaselineRequirementVersions(
  session: Session,
  baselineId: string
): Promise<RequirementVersionRecord[]> {
  const result = await session.run(`
    MATCH (baseline:Baseline {id: $baselineId})
    MATCH (baseline)-[:SNAPSHOT_REQUIREMENT_VERSION]->(reqVer:RequirementVersion)
    RETURN reqVer
    ORDER BY reqVer.versionNumber ASC
  `, { baselineId });

  return result.records.map(record =>
    mapRequirementVersion(record.get("reqVer"))
  );
}
```

**Apply same pattern for:**
- Documents → `getBaselineDocumentVersions()`
- Sections → `getBaselineSectionVersions()`
- Diagrams → `getBaselineDiagramVersions()`
- Blocks → `getBaselineBlockVersions()`
- Connectors → `getBaselineConnectorVersions()`
- Trace Links → `getBaselineTraceLinkVersions()`
- Linksets → `getBaselineLinksetVersions()`
- Infos → `getBaselineInfoVersions()`
- Surrogates → `getBaselineSurrogateVersions()`

### 2.3 Type Definitions

```typescript
// backend/src/services/workspace.ts

export type BaselineSnapshot = {
  baseline: BaselineRecord;
  requirementVersions: RequirementVersionRecord[];
  documentVersions: DocumentVersionRecord[];
  sectionVersions: DocumentSectionVersionRecord[];
  diagramVersions: DiagramVersionRecord[];
  blockVersions: BlockVersionRecord[];
  connectorVersions: ConnectorVersionRecord[];
  traceLinkVersions: TraceLinkVersionRecord[];
  linksetVersions: LinksetVersionRecord[];
  infoVersions: InfoVersionRecord[];
  surrogateVersions: SurrogateVersionRecord[];
};
```

---

## 3. Frontend Implementation

### 3.1 Routing Changes

**File: `frontend/src/DevAppRoutes.tsx` and `ProductionAppRoutes.tsx`**

```typescript
// Add baseline routes that mirror existing routes
<Routes>
  {/* Existing routes */}
  <Route path="/requirements" element={<RequirementsRoute />} />
  <Route path="/documents" element={<DocumentsRoute />} />
  <Route path="/documents/:documentSlug" element={<DocumentDetailRoute />} />
  <Route path="/architecture" element={<ArchitectureRoute />} />
  <Route path="/trace-links" element={<TraceLinksRoute />} />
  <Route path="/graph-viewer" element={<GraphViewerRoute />} />

  {/* NEW: Baseline routes */}
  <Route path="/baselines/:baselineRef/*" element={
    <BaselineViewProvider>
      <Routes>
        <Route path="requirements" element={<RequirementsRoute />} />
        <Route path="documents" element={<DocumentsRoute />} />
        <Route path="documents/:documentSlug" element={<DocumentDetailRoute />} />
        <Route path="architecture" element={<ArchitectureRoute />} />
        <Route path="trace-links" element={<TraceLinksRoute />} />
        <Route path="graph-viewer" element={<GraphViewerRoute />} />
        <Route index element={<Navigate to="requirements" replace />} />
      </Routes>
    </BaselineViewProvider>
  } />
</Routes>
```

### 3.2 Component Modifications

#### 3.2.1 RequirementsRoute

**File: `frontend/src/routes/RequirementsRoute.tsx`**

```typescript
export function RequirementsRoute() {
  const api = useApiClient();
  const { state } = useTenantProject();
  const { mode, baseline, isLoading: baselineLoading } = useBaselineView();

  // Data loading - conditional based on mode
  const requirementsQuery = useQuery({
    queryKey: mode === "baseline"
      ? ["baseline-requirements", baseline?.baseline.ref]
      : ["requirements", state.tenant, state.project],
    queryFn: async () => {
      if (mode === "baseline" && baseline) {
        // Convert version records to requirement records for display
        return baseline.requirementVersions.map(convertVersionToRequirement);
      }
      return api.listRequirements(state.tenant!, state.project!);
    },
    enabled: Boolean(state.tenant && state.project) &&
             (mode === "current" || Boolean(baseline))
  });

  const readOnly = mode === "baseline";

  return (
    <div>
      {mode === "baseline" && <BaselineBanner />}

      <RequirementsTable
        requirements={requirementsQuery.data}
        readOnly={readOnly}
        onEdit={readOnly ? undefined : handleEdit}
        onCreate={readOnly ? undefined : handleCreate}
        onDelete={readOnly ? undefined : handleDelete}
      />
    </div>
  );
}
```

#### 3.2.2 DocumentsRoute

**File: `frontend/src/routes/DocumentsRoute.tsx`**

```typescript
export function DocumentsRoute() {
  const { mode, baseline } = useBaselineView();

  const documentsQuery = useQuery({
    queryKey: mode === "baseline"
      ? ["baseline-documents", baseline?.baseline.ref]
      : ["documents", tenant, project],
    queryFn: async () => {
      if (mode === "baseline" && baseline) {
        return baseline.documentVersions.map(convertVersionToDocument);
      }
      return api.listDocuments(tenant!, project!);
    },
    enabled: Boolean(tenant && project) &&
             (mode === "current" || Boolean(baseline))
  });

  const readOnly = mode === "baseline";

  return (
    <div>
      {mode === "baseline" && <BaselineBanner />}

      <DocumentsList
        documents={documentsQuery.data}
        readOnly={readOnly}
        onUpload={readOnly ? undefined : handleUpload}
        onDelete={readOnly ? undefined : handleDelete}
      />
    </div>
  );
}
```

#### 3.2.3 ArchitectureRoute

**File: `frontend/src/routes/ArchitectureRoute.tsx`**

```typescript
export function ArchitectureRoute() {
  const { mode, baseline } = useBaselineView();

  const diagramsQuery = useQuery({
    queryKey: mode === "baseline"
      ? ["baseline-diagrams", baseline?.baseline.ref]
      : ["diagrams", tenant, project],
    queryFn: async () => {
      if (mode === "baseline" && baseline) {
        return {
          diagrams: baseline.diagramVersions.map(convertVersionToDiagram),
          blocks: baseline.blockVersions.map(convertVersionToBlock),
          connectors: baseline.connectorVersions.map(convertVersionToConnector)
        };
      }
      return api.getArchitecture(tenant!, project!);
    }
  });

  const readOnly = mode === "baseline";

  return (
    <div>
      {mode === "baseline" && <BaselineBanner />}

      <DiagramCanvas
        diagrams={diagramsQuery.data?.diagrams}
        blocks={diagramsQuery.data?.blocks}
        connectors={diagramsQuery.data?.connectors}
        readOnly={readOnly}
        onUpdateBlock={readOnly ? undefined : handleUpdateBlock}
        onCreateConnector={readOnly ? undefined : handleCreateConnector}
      />
    </div>
  );
}
```

### 3.3 Navigation Updates

**File: `frontend/src/components/AppLayout.tsx`**

Update navigation links to maintain baseline context:

```typescript
export function AppLayout({ children }) {
  const { mode, baselineRef } = useBaselineView();
  const location = useLocation();

  const getNavLink = (path: string) => {
    if (mode === "baseline") {
      return `/baselines/${baselineRef}${path}`;
    }
    return path;
  };

  return (
    <div className="app-layout">
      <nav>
        <NavLink to={getNavLink("/requirements")}>Requirements</NavLink>
        <NavLink to={getNavLink("/documents")}>Documents</NavLink>
        <NavLink to={getNavLink("/architecture")}>Architecture</NavLink>
        <NavLink to={getNavLink("/trace-links")}>Trace Links</NavLink>
        <NavLink to={getNavLink("/graph-viewer")}>Graph Viewer</NavLink>
      </nav>
      {children}
    </div>
  );
}
```

### 3.4 Baseline Banner Component

**File: `frontend/src/components/BaselineBanner.tsx` (NEW)**

```typescript
import { useBaselineView } from "../contexts/BaselineViewContext";

export function BaselineBanner() {
  const { baseline, exitBaselineView } = useBaselineView();

  if (!baseline) return null;

  return (
    <div className="baseline-banner">
      <div className="baseline-info">
        <span className="icon">📸</span>
        <div>
          <strong>Viewing Baseline: {baseline.baseline.ref}</strong>
          {baseline.baseline.label && <span> - {baseline.baseline.label}</span>}
          <div className="baseline-meta">
            Created {new Date(baseline.baseline.createdAt).toLocaleDateString()}
            {baseline.baseline.author && ` by ${baseline.baseline.author}`}
          </div>
        </div>
      </div>
      <div className="baseline-actions">
        <button onClick={exitBaselineView} className="btn-secondary">
          Exit Baseline View
        </button>
      </div>
    </div>
  );
}
```

**Styling: `frontend/src/index.css`**

```css
.baseline-banner {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px;
  margin-bottom: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.baseline-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.baseline-info .icon {
  font-size: 2rem;
}

.baseline-meta {
  font-size: 0.875rem;
  opacity: 0.9;
  margin-top: 0.25rem;
}

.baseline-actions .btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.baseline-actions .btn-secondary:hover {
  background: rgba(255, 255, 255, 0.3);
}
```

### 3.5 Version-to-Entity Conversion Utilities

**File: `frontend/src/lib/baseline-utils.ts` (NEW)**

```typescript
import type {
  RequirementVersionRecord,
  RequirementRecord,
  DocumentVersionRecord,
  DocumentRecord
} from "../types";

export function convertVersionToRequirement(
  version: RequirementVersionRecord
): RequirementRecord {
  return {
    id: version.requirementId,
    ref: version.ref || `${version.requirementId}-v${version.versionNumber}`,
    text: version.text,
    pattern: version.pattern,
    verification: version.verification,
    rationale: version.rationale,
    complianceStatus: version.complianceStatus,
    complianceRationale: version.complianceRationale,
    qaScore: version.qaScore,
    qaVerdict: version.qaVerdict,
    suggestions: version.suggestions,
    tags: version.tags,
    attributes: version.attributes,
    createdAt: version.timestamp,
    updatedAt: version.timestamp,
    // Baseline-specific metadata
    _baselineVersion: version.versionNumber,
    _baselineChangedBy: version.changedBy
  };
}

export function convertVersionToDocument(
  version: DocumentVersionRecord
): DocumentRecord {
  return {
    id: version.documentId,
    slug: version.slug,
    name: version.name,
    description: version.description,
    shortCode: version.shortCode,
    kind: version.kind,
    createdAt: version.timestamp,
    updatedAt: version.timestamp,
    _baselineVersion: version.versionNumber
  };
}

// Similar converters for:
// - convertVersionToDiagram()
// - convertVersionToBlock()
// - convertVersionToConnector()
// - convertVersionToTraceLink()
// - convertVersionToLinkset()
```

### 3.6 Read-Only Mode Implementation

**Pattern for all components:**

```typescript
// Requirements Table
export function RequirementsTable({
  requirements,
  readOnly = false,
  onEdit,
  onDelete,
  onCreate
}) {
  return (
    <div>
      <div className="table-header">
        <h2>Requirements</h2>
        {!readOnly && (
          <button onClick={onCreate}>Create Requirement</button>
        )}
      </div>

      <table>
        <tbody>
          {requirements.map(req => (
            <RequirementRow
              key={req.id}
              requirement={req}
              readOnly={readOnly}
              onEdit={readOnly ? undefined : () => onEdit(req)}
              onDelete={readOnly ? undefined : () => onDelete(req)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Disable inline editing:**

```typescript
// In RequirementRow.tsx
function RequirementRow({ requirement, readOnly, onEdit, onDelete }) {
  const [editingField, setEditingField] = useState<string | null>(null);

  const handleDoubleClick = (field: string) => {
    if (readOnly) return; // Don't allow editing in baseline mode
    setEditingField(field);
  };

  return (
    <tr>
      <td onDoubleClick={() => handleDoubleClick('text')}>
        {editingField === 'text' && !readOnly ? (
          <input value={requirement.text} onChange={...} />
        ) : (
          requirement.text
        )}
      </td>
      <td>
        {!readOnly && (
          <button onClick={() => onDelete(requirement)}>Delete</button>
        )}
      </td>
    </tr>
  );
}
```

---

## 4. User Experience Enhancements

### 4.1 Baseline Entry Points

**From Baselines List:**

```typescript
// In BaselinesRoute.tsx
<tr key={baseline.ref} onClick={() => navigate(`/baselines/${baseline.ref}/requirements`)}>
  <td>{baseline.ref}</td>
  <td>{baseline.label}</td>
  <td>{formatDate(baseline.createdAt)}</td>
</tr>
```

**Add "View Baseline" button:**

```typescript
<tr key={baseline.ref}>
  <td>{baseline.ref}</td>
  <td>{baseline.label}</td>
  <td>
    <button onClick={() => navigate(`/baselines/${baseline.ref}/requirements`)}>
      View Baseline
    </button>
  </td>
</tr>
```

### 4.2 Comparison Workflow

**"Compare with Current" button in baseline view:**

```typescript
// In BaselineBanner.tsx
<button onClick={() => {
  window.open(`/requirements`, '_blank'); // Current view in new tab
}}>
  Compare with Current
</button>
```

**Side-by-side comparison:**
- User opens baseline in one tab: `/baselines/BL-REL-1.0/requirements`
- Opens current in another tab: `/requirements`
- Can compare visually side-by-side

### 4.3 Visual Indicators

**Show version metadata in tables:**

```typescript
// In baseline mode, show version info
{mode === "baseline" && (
  <td className="version-info">
    v{requirement._baselineVersion}
    <span className="changed-by">by {requirement._baselineChangedBy}</span>
  </td>
)}
```

**Greyed-out edit buttons:**

```css
.read-only-mode button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.read-only-mode input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Test baseline context:**

```typescript
// frontend/src/contexts/__tests__/BaselineViewContext.test.tsx

describe("BaselineViewContext", () => {
  it("should detect baseline mode from URL", () => {
    const { result } = renderHook(() => useBaselineView(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/baselines/BL-REL-1.0/requirements"]}>
          <BaselineViewProvider>{children}</BaselineViewProvider>
        </MemoryRouter>
      )
    });

    expect(result.current.mode).toBe("baseline");
    expect(result.current.baselineRef).toBe("BL-REL-1.0");
  });

  it("should load baseline data in baseline mode", async () => {
    // Mock API response
    mockApi.getBaselineDetails.mockResolvedValue({
      baseline: { ref: "BL-REL-1.0" },
      requirementVersions: [...]
    });

    const { result } = renderHook(() => useBaselineView(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/baselines/BL-REL-1.0/requirements"]}>
          <BaselineViewProvider>{children}</BaselineViewProvider>
        </MemoryRouter>
      )
    });

    await waitFor(() => {
      expect(result.current.baseline).toBeDefined();
      expect(result.current.baseline.baseline.ref).toBe("BL-REL-1.0");
    });
  });
});
```

**Test read-only enforcement:**

```typescript
// frontend/src/routes/__tests__/RequirementsRoute.test.tsx

describe("RequirementsRoute - Baseline Mode", () => {
  it("should disable edit operations in baseline mode", () => {
    render(
      <BaselineViewContext.Provider value={{
        mode: "baseline",
        baseline: mockBaseline
      }}>
        <RequirementsRoute />
      </BaselineViewContext.Provider>
    );

    // Create button should not exist
    expect(screen.queryByText("Create Requirement")).not.toBeInTheDocument();

    // Edit buttons should be disabled
    const editButtons = screen.getAllByRole("button", { name: /edit/i });
    editButtons.forEach(btn => expect(btn).toBeDisabled());
  });
});
```

### 5.2 Integration Tests

**Test navigation flow:**

```typescript
describe("Baseline Navigation Flow", () => {
  it("should navigate from baseline list to requirements view", async () => {
    const { user } = render(<App />, {
      initialRoute: "/baselines"
    });

    // Click on baseline row
    await user.click(screen.getByText("BL-REL-1.0"));

    // Should navigate to baseline requirements view
    expect(window.location.pathname).toBe("/baselines/BL-REL-1.0/requirements");

    // Should show baseline banner
    expect(screen.getByText(/Viewing Baseline: BL-REL-1.0/)).toBeInTheDocument();

    // Should load baseline data
    await waitFor(() => {
      expect(screen.getByText("System shall respond within 100ms")).toBeInTheDocument();
    });
  });

  it("should maintain baseline context across tabs", async () => {
    const { user } = render(<App />, {
      initialRoute: "/baselines/BL-REL-1.0/requirements"
    });

    // Click on Documents tab
    await user.click(screen.getByText("Documents"));

    // Should navigate to baseline documents view
    expect(window.location.pathname).toBe("/baselines/BL-REL-1.0/documents");

    // Should still show baseline banner
    expect(screen.getByText(/Viewing Baseline: BL-REL-1.0/)).toBeInTheDocument();
  });
});
```

### 5.3 E2E Tests (Playwright)

```typescript
// e2e/baseline-view.spec.ts

test("should view baseline snapshot and exit", async ({ page }) => {
  await page.goto("/baselines");

  // Click on baseline
  await page.click('tr:has-text("BL-REL-1.0")');

  // Should show baseline view
  await expect(page.locator(".baseline-banner")).toContainText("Viewing Baseline: BL-REL-1.0");

  // Should show requirements from baseline
  await expect(page.locator("table")).toContainText("System shall respond within 100ms");

  // Edit buttons should be disabled
  const editButton = page.locator('button:has-text("Edit")').first();
  await expect(editButton).toBeDisabled();

  // Exit baseline view
  await page.click('button:has-text("Exit Baseline View")');

  // Should return to current requirements view
  await expect(page).toHaveURL("/requirements");
  await expect(page.locator(".baseline-banner")).not.toBeVisible();
});

test("should navigate between baseline tabs", async ({ page }) => {
  await page.goto("/baselines/BL-REL-1.0/requirements");

  // Navigate to documents
  await page.click('a:has-text("Documents")');
  await expect(page).toHaveURL("/baselines/BL-REL-1.0/documents");

  // Navigate to architecture
  await page.click('a:has-text("Architecture")');
  await expect(page).toHaveURL("/baselines/BL-REL-1.0/architecture");

  // Baseline banner should persist
  await expect(page.locator(".baseline-banner")).toBeVisible();
});
```

---

## 6. Migration & Compatibility

### 6.1 Backward Compatibility

**Existing baselines work without changes:**
- Old baselines already have version snapshots (from existing implementation)
- No database migration required
- New UI simply queries existing data differently

**Existing routes unaffected:**
- `/requirements` continues to work as before
- No changes to current project view
- Baseline routes are additive only

### 6.2 Data Migration (If Needed)

**If old baselines lack complete version data:**

```typescript
// backend/src/scripts/backfill-baseline-snapshots.ts

async function backfillBaselineSnapshots() {
  const baselines = await getAllBaselines();

  for (const baseline of baselines) {
    // Check if baseline has complete snapshots
    const hasCompleteData = await checkBaselineCompleteness(baseline.id);

    if (!hasCompleteData) {
      console.log(`Backfilling baseline ${baseline.ref}...`);

      // Recreate snapshots from version history at baseline creation time
      await recreateBaselineSnapshots(baseline);
    }
  }
}
```

---

## 7. Performance Considerations

### 7.1 Data Loading Optimization

**Issue:** Large baselines might have thousands of version records

**Solution: Lazy loading**

```typescript
// Load baseline metadata first, entity versions on-demand
const baselineQuery = useQuery({
  queryKey: ["baseline-metadata", baselineRef],
  queryFn: () => api.getBaselineMetadata(baselineRef), // Lightweight
});

const requirementVersionsQuery = useQuery({
  queryKey: ["baseline-requirement-versions", baselineRef],
  queryFn: () => api.getBaselineRequirementVersions(baselineRef),
  enabled: baselineQuery.isSuccess && currentTab === "requirements"
});
```

**Pagination for large datasets:**

```typescript
// Load requirements in batches
const requirementsQuery = useQuery({
  queryKey: ["baseline-requirements", baselineRef, page],
  queryFn: () => api.getBaselineRequirementVersions(baselineRef, {
    page,
    limit: 100
  })
});
```

### 7.2 Caching Strategy

```typescript
// Cache baseline data aggressively (it never changes)
const baselineQuery = useQuery({
  queryKey: ["baseline-snapshot", baselineRef],
  queryFn: () => api.getBaselineDetails(tenant, project, baselineRef),
  staleTime: Infinity, // Baseline data never goes stale
  cacheTime: 1000 * 60 * 60 // Keep in cache for 1 hour
});
```

---

## 8. Implementation Timeline

### Day 1-2: Backend Foundation
- ✅ Enhance `getBaselineDetails()` to return structured version data
- ✅ Add version extraction functions for all entity types
- ✅ Update API response types
- ✅ Add backend tests

### Day 3-4: Context & Routing
- ✅ Create `BaselineViewContext` provider
- ✅ Add baseline routes to app routing
- ✅ Create `BaselineBanner` component
- ✅ Implement `exitBaselineView()` navigation

### Day 5-6: Component Integration
- ✅ Update `RequirementsRoute` for baseline mode
- ✅ Update `DocumentsRoute` for baseline mode
- ✅ Update `ArchitectureRoute` for baseline mode
- ✅ Update `TraceLinksRoute` for baseline mode
- ✅ Create version-to-entity conversion utilities

### Day 7: Testing & Polish
- ✅ Write unit tests for context and components
- ✅ Write integration tests for navigation flow
- ✅ E2E tests for baseline viewing
- ✅ UI polish and responsive design
- ✅ Documentation updates

---

## 9. Success Criteria

### Functional Requirements
- ✅ User can click a baseline and view frozen project state
- ✅ All tabs (Requirements, Documents, Architecture, Trace Links) work in baseline mode
- ✅ Navigation maintains baseline context across tabs
- ✅ All edit operations are disabled in baseline mode
- ✅ User can exit baseline view and return to current project
- ✅ Baseline banner clearly indicates read-only mode

### Non-Functional Requirements
- ✅ Page load time < 2 seconds for baselines with <1000 requirements
- ✅ No breaking changes to existing functionality
- ✅ 95%+ test coverage for new code
- ✅ Works in all supported browsers (Chrome, Firefox, Safari, Edge)

### User Experience
- ✅ Intuitive navigation - users immediately understand they're in baseline mode
- ✅ Familiar interface - existing UI patterns maintained
- ✅ Clear visual differentiation between current and baseline views
- ✅ Easy to compare current vs. baseline (side-by-side tabs)

---

## 10. Future Enhancements (Post-MVP)

### Phase 2 Features
- **Detailed Diff View**: Click "Compare" to see field-by-field changes
- **Export to PDF**: Generate baseline report for customers
- **Baseline Annotations**: Add comments to baseline requirements
- **Baseline Sharing**: Generate read-only links for stakeholders

### Phase 3 Features
- **Baseline Restoration**: Roll back entire project to baseline state
- **Selective Rollback**: Restore individual requirements from baseline
- **Baseline Merge**: Merge changes from one baseline to another
- **Custom Baseline Views**: Save filtered/sorted views of baseline data

---

## 11. Risks & Mitigation

### Risk 1: Large Baselines Performance
**Impact:** Slow loading for baselines with 10,000+ requirements

**Mitigation:**
- Implement pagination (load 100 requirements at a time)
- Add lazy loading for non-visible tabs
- Consider virtual scrolling for large tables

### Risk 2: User Confusion
**Impact:** Users accidentally try to edit in baseline mode

**Mitigation:**
- Prominent baseline banner with color coding
- Disable all edit operations visibly (greyed out buttons)
- Toast notification if user attempts forbidden action
- "Exit Baseline View" button always visible

### Risk 3: Stale Data
**Impact:** Baseline view shows outdated data if baseline is modified

**Mitigation:**
- Baselines are immutable - can't be modified after creation
- Add timestamp check to detect data inconsistencies
- Refresh data if baseline is accessed after long period

---

## 12. Rollout Plan

### Phase 1: Internal Testing (1 week)
- Deploy to staging environment
- Team testing with real baseline data
- Collect feedback and fix bugs

### Phase 2: Beta Users (1-2 weeks)
- Enable for select customers
- Monitor usage analytics
- Gather user feedback

### Phase 3: General Availability
- Enable for all users
- Announce feature in release notes
- Provide documentation and training

---

## Appendix A: API Contract

### GET /api/baselines/:tenant/:project/:baselineRef

**Response:**
```json
{
  "baseline": {
    "id": "uuid",
    "ref": "BL-REL-1.0",
    "label": "Release 1.0",
    "author": "John Doe",
    "createdAt": "2025-01-15T10:00:00Z"
  },
  "requirementVersions": [
    {
      "versionId": "uuid",
      "requirementId": "req-uuid",
      "versionNumber": 1,
      "timestamp": "2025-01-15T10:00:00Z",
      "changedBy": "john@example.com",
      "changeType": "created",
      "ref": "SRD-001",
      "text": "System shall respond within 100ms",
      "pattern": "event",
      "verification": "Test",
      "qaScore": 85.5,
      "contentHash": "abc123..."
    }
  ],
  "documentVersions": [...],
  "diagramVersions": [...],
  "traceLinkVersions": [...]
}
```

---

## Appendix B: File Changes Checklist

### Backend Files to Create
- ✅ No new files needed (enhance existing)

### Backend Files to Modify
- ✅ `backend/src/services/graph/requirement-baselines.ts`
  - Enhance `getBaselineDetails()`
  - Add version extraction functions
- ✅ `backend/src/services/workspace.ts`
  - Add `BaselineSnapshot` type

### Frontend Files to Create
- ✅ `frontend/src/contexts/BaselineViewContext.tsx`
- ✅ `frontend/src/components/BaselineBanner.tsx`
- ✅ `frontend/src/lib/baseline-utils.ts`
- ✅ `frontend/src/hooks/useBaselineView.ts`

### Frontend Files to Modify
- ✅ `frontend/src/DevAppRoutes.tsx`
- ✅ `frontend/src/ProductionAppRoutes.tsx`
- ✅ `frontend/src/routes/RequirementsRoute.tsx`
- ✅ `frontend/src/routes/DocumentsRoute.tsx`
- ✅ `frontend/src/routes/ArchitectureRoute.tsx`
- ✅ `frontend/src/routes/TraceLinksRoute.tsx`
- ✅ `frontend/src/routes/GraphViewerRoute.tsx`
- ✅ `frontend/src/components/AppLayout.tsx`
- ✅ `frontend/src/index.css`

### Test Files to Create
- ✅ `frontend/src/contexts/__tests__/BaselineViewContext.test.tsx`
- ✅ `frontend/src/routes/__tests__/RequirementsRoute.baseline.test.tsx`
- ✅ `e2e/baseline-view.spec.ts`

---

**This plan provides a complete roadmap for implementing full read-only baseline project views.**
