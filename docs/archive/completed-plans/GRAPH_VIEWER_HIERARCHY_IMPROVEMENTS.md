# Graph Viewer Hierarchy Improvements Plan

## Problem Statement

The graph viewer's auto-layout algorithms (especially Dagre) don't respect the semantic **parent-child hierarchy** of Neo4j relationships. All relationships are treated equally, resulting in:

1. **Poor hierarchical layout**: Parent nodes don't consistently appear above children
2. **No visual hierarchy distinction**: Containment relationships (HAS_SECTION, CONTAINS) look the same as peer relationships (SATISFIES, RELATED_TO)
3. **Confusing diagrams**: Users can't quickly understand structural hierarchy vs. trace relationships

## Current State Analysis

### Relationship Types in AIRGen

From `backend/src/routes/graph.ts`, we have these relationship types:

**Hierarchical (Parent → Child):**
- `OWNS` - Tenant owns Project
- `HAS_DOCUMENT` - Project has Document
- `HAS_SECTION` - Document has Section
- `CONTAINS` - Section contains Requirement/Info/SurrogateReference
- `HAS_LINKSET` - Project has DocumentLinkset
- `HAS_TRACE_LINK` - Project has TraceLink
- `HAS_CANDIDATE` - Project has RequirementCandidate
- `HAS_ARCHITECTURE_DIAGRAM` - Project has ArchitectureDiagram
- `HAS_ARCHITECTURE_BLOCK` - Project has ArchitectureBlock (definition)
- `HAS_BLOCK` - Diagram has Block (placed instance)
- `HAS_CONNECTOR` - Diagram has Connector

**Non-Hierarchical (Peer/Reference):**
- `SATISFIES` - Requirement satisfies another
- `DERIVES_FROM` - Requirement derives from another
- `RELATED_TO` - Requirement related to another
- `VERIFIES` - Requirement verifies another
- `DEPENDS_ON` - Requirement depends on another
- `LINKED_TO` - Document linked to Document
- `FROM_DOCUMENT` - Linkset references source Document
- `TO_DOCUMENT` - Linkset references target Document
- `FROM_REQUIREMENT` - TraceLink references source Requirement
- `TO_REQUIREMENT` - TraceLink references target Requirement
- `CONTAINS_LINK` - Linkset contains TraceLink
- `FROM_BLOCK` - Connector references source Block
- `TO_BLOCK` - Connector references target Block
- `LINKED_DOCUMENT` - Block linked to Document

### Current Layout Configuration (No Hierarchy Awareness)

```typescript
case 'dagre':
  return {
    ...baseConfig,
    name: 'dagre',
    rankDir: 'TB', // Top to bottom
    ranker: 'network-simplex',
    nodeSep: 50,
    edgeSep: 10,
    rankSep: 75
  };
```

**Issues:**
- No distinction between hierarchical and non-hierarchical edges
- Dagre treats all edges equally for ranking
- No edge weights to prioritize hierarchy
- No compound node support for true parent-child nesting

---

## Solution Design

### Approach 1: Edge Weight-Based Hierarchy (Recommended)

Use Cytoscape's Dagre **edge weights** to prioritize hierarchical relationships. Heavier edges will be strongly preferred for ranking.

**Advantages:**
- ✅ Simple implementation (no graph structure changes)
- ✅ Works with existing node/edge data
- ✅ Backward compatible
- ✅ Fast performance

**Disadvantages:**
- ⚠️ Not true parent-child nesting (visual only)
- ⚠️ Requires manual classification of relationship types

### Approach 2: Compound Nodes (True Hierarchy)

Use Cytoscape's **compound nodes** (parent-child node structure) for true containment.

**Advantages:**
- ✅ True hierarchical nesting (Document contains Sections, which contain Requirements)
- ✅ Collapsible/expandable parents
- ✅ Visual containment (children drawn inside parents)
- ✅ Semantic correctness

**Disadvantages:**
- ⚠️ Complex implementation (requires graph transformation)
- ⚠️ Performance impact with large graphs
- ⚠️ Not supported by all layouts (only some support compounds)

### Approach 3: Hybrid (Weight + Compounds for Key Hierarchies)

Use compound nodes for primary hierarchy (Tenant → Project → Document → Section) and edge weights for everything else.

**Advantages:**
- ✅ Best of both worlds
- ✅ Clear top-level structure
- ✅ Flexible for peer relationships

**Disadvantages:**
- ⚠️ Most complex implementation
- ⚠️ Requires careful design decisions

---

## Recommended Implementation: Approach 1 (Edge Weights)

### Step 1: Classify Relationship Types

Create a relationship type classifier:

```typescript
// frontend/src/routes/GraphViewerRoute.tsx

/**
 * Classify relationship types by their hierarchical nature
 */
const RELATIONSHIP_HIERARCHY = {
  // Strong hierarchy (weight: 100) - true containment/ownership
  strong: new Set([
    'OWNS',           // Tenant → Project
    'HAS_DOCUMENT',   // Project → Document
    'HAS_SECTION',    // Document → Section
    'CONTAINS',       // Section → Requirement/Info/SurrogateReference
    'HAS_BLOCK',      // Diagram → Block
    'HAS_CONNECTOR',  // Diagram → Connector
  ]),

  // Medium hierarchy (weight: 50) - ownership but not containment
  medium: new Set([
    'HAS_LINKSET',              // Project → DocumentLinkset
    'HAS_TRACE_LINK',           // Project → TraceLink
    'HAS_CANDIDATE',            // Project → RequirementCandidate
    'HAS_ARCHITECTURE_DIAGRAM', // Project → ArchitectureDiagram
    'HAS_ARCHITECTURE_BLOCK',   // Project → ArchitectureBlock (definition)
    'CONTAINS_LINK',            // Linkset → TraceLink
  ]),

  // Weak/No hierarchy (weight: 1) - peer relationships and references
  weak: new Set([
    'SATISFIES',
    'DERIVES_FROM',
    'RELATED_TO',
    'VERIFIES',
    'DEPENDS_ON',
    'LINKED_TO',
    'FROM_DOCUMENT',
    'TO_DOCUMENT',
    'FROM_REQUIREMENT',
    'TO_REQUIREMENT',
    'FROM_BLOCK',
    'TO_BLOCK',
    'LINKED_DOCUMENT',
  ]),
};

/**
 * Get hierarchical weight for a relationship type
 * Higher weight = stronger hierarchical preference in layout
 */
function getEdgeWeight(relationshipType: string): number {
  if (RELATIONSHIP_HIERARCHY.strong.has(relationshipType)) {
    return 100; // Strong hierarchy
  } else if (RELATIONSHIP_HIERARCHY.medium.has(relationshipType)) {
    return 50;  // Medium hierarchy
  } else {
    return 1;   // Weak/no hierarchy
  }
}

/**
 * Check if relationship is hierarchical (parent → child direction matters)
 */
function isHierarchicalEdge(relationshipType: string): boolean {
  return RELATIONSHIP_HIERARCHY.strong.has(relationshipType) ||
         RELATIONSHIP_HIERARCHY.medium.has(relationshipType);
}
```

### Step 2: Update Cytoscape Elements with Edge Data

```typescript
// Transform Neo4j data to Cytoscape format WITH edge metadata
const elements: ElementDefinition[] = graphData
  ? [
      // Nodes (unchanged)
      ...graphData.nodes.map((node: any) => ({
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          properties: node.properties
        }
      })),

      // Edges WITH weight and hierarchy metadata
      ...graphData.relationships.map((rel: any) => ({
        data: {
          id: rel.id,
          source: rel.source,
          target: rel.target,
          label: rel.type,
          properties: rel.properties,
          // NEW: Add edge metadata for layout
          weight: getEdgeWeight(rel.type),
          isHierarchical: isHierarchicalEdge(rel.type)
        }
      }))
    ]
  : [];
```

### Step 3: Configure Dagre to Use Edge Weights

```typescript
// Update layout configuration to use edge weights
const getLayoutConfig = (layoutName: string) => {
  const baseConfig = {
    fit: true,
    padding: 30,
    animate: true,
    animationDuration: 500
  };

  switch (layoutName) {
    case 'dagre':
      return {
        ...baseConfig,
        name: 'dagre',
        rankDir: 'TB', // Top to bottom
        ranker: 'network-simplex',
        nodeSep: 50,
        edgeSep: 10,
        rankSep: 100,  // Increased for better hierarchy separation
        // NEW: Use edge weights for ranking
        ranker: 'tight-tree',  // Better for hierarchies than network-simplex
        edgeWeight: (edge: any) => {
          // Use the weight from edge data
          return edge.data('weight') || 1;
        }
      };

    case 'fcose':
      return {
        ...baseConfig,
        name: 'fcose',
        quality: 'default',
        randomize: false,
        animate: 'end',
        nodeSeparation: 75,
        idealEdgeLength: (edge: any) => {
          // Hierarchical edges should be shorter (pull parents/children closer)
          const isHier = edge.data('isHierarchical');
          return isHier ? 80 : 150;
        },
        edgeElasticity: (edge: any) => {
          // Hierarchical edges should be stiffer (stronger pull)
          const isHier = edge.data('isHierarchical');
          return isHier ? 0.8 : 0.45;
        },
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 2500,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0
      };

    // ... other layouts
  }
};
```

### Step 4: Visual Distinction for Hierarchical Edges

Update the stylesheet to visually differentiate hierarchical edges:

```typescript
// Add to stylesheet array
const stylesheet = [
  // ... existing node styles

  // Default edge style (non-hierarchical)
  {
    selector: "edge",
    style: {
      width: 2,
      "line-color": "#94a3b8",
      "target-arrow-color": "#94a3b8",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": "10px",
      color: "#64748b",
      "text-rotation": "autorotate",
      "text-margin-y": -10
    }
  },

  // NEW: Hierarchical edges (stronger, darker)
  {
    selector: "edge[isHierarchical]",
    style: {
      width: 3,
      "line-color": "#334155",  // Darker
      "target-arrow-color": "#334155",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "font-weight": "600",
      "font-size": "11px",
      color: "#1e293b"
    }
  },

  // Strong hierarchy edges (OWNS, HAS_DOCUMENT, HAS_SECTION, CONTAINS)
  {
    selector: "edge[weight >= 100]",
    style: {
      width: 4,
      "line-color": "#1e40af",  // Blue (strong structure)
      "target-arrow-color": "#1e40af",
      "target-arrow-shape": "triangle",
      "font-weight": "700",
      color: "#1e293b"
    }
  },

  // Medium hierarchy edges
  {
    selector: "edge[weight >= 50][weight < 100]",
    style: {
      width: 3,
      "line-color": "#4b5563",  // Dark gray
      "target-arrow-color": "#4b5563",
      "target-arrow-shape": "triangle"
    }
  },

  // Peer relationship edges (SATISFIES, RELATED_TO, etc.)
  {
    selector: "edge[weight < 50]",
    style: {
      width: 2,
      "line-color": "#94a3b8",  // Light gray
      "target-arrow-color": "#94a3b8",
      "target-arrow-shape": "triangle",
      "line-style": "dashed"  // Dashed to show non-hierarchy
    }
  },

  // ... existing selected edge styles
];
```

---

## Implementation Plan

### Phase 1: Add Edge Metadata (1-2 hours)

**Step 1.1**: Add relationship classifier
- [ ] Create `RELATIONSHIP_HIERARCHY` constant with classification
- [ ] Create `getEdgeWeight()` function
- [ ] Create `isHierarchicalEdge()` function

**Step 1.2**: Update element transformation
- [ ] Add `weight` to edge data
- [ ] Add `isHierarchical` to edge data
- [ ] Test with console.log to verify weights are correct

**Step 1.3**: Test data flow
- [ ] Verify edge weights appear in Cytoscape inspector
- [ ] Confirm hierarchical classification is correct

### Phase 2: Update Layouts (2-3 hours)

**Step 2.1**: Configure Dagre for hierarchy
- [ ] Change ranker to `'tight-tree'` (better for hierarchies)
- [ ] Add `edgeWeight` function to use metadata
- [ ] Increase `rankSep` to 100px for better level separation
- [ ] Test with various node type filters

**Step 2.2**: Configure fCoSE for hierarchy
- [ ] Add `idealEdgeLength` function (shorter for hierarchical edges)
- [ ] Add `edgeElasticity` function (stiffer for hierarchical edges)
- [ ] Test and tune parameters

**Step 2.3**: Test all layouts
- [ ] Test Dagre with full graph
- [ ] Test fCoSE with full graph
- [ ] Test breadthfirst (should auto-respect direction)
- [ ] Document which layouts work best for hierarchy

### Phase 3: Visual Styling (1 hour)

**Step 3.1**: Update stylesheet
- [ ] Add `edge[isHierarchical]` selector
- [ ] Add `edge[weight >= 100]` selector (strong hierarchy)
- [ ] Add `edge[weight >= 50]` selector (medium hierarchy)
- [ ] Add `edge[weight < 50]` selector (peer relationships)
- [ ] Test color contrast and readability

**Step 3.2**: Add legend
- [ ] Update legend to show hierarchy levels
- [ ] Add visual examples of edge types
- [ ] Document relationship types

### Phase 4: User Controls (2 hours)

**Step 4.1**: Add hierarchy filter
- [ ] Add checkbox: "Show only hierarchical relationships"
- [ ] Filter out weak edges when checked
- [ ] Update layout when filter changes

**Step 4.2**: Add layout presets
- [ ] "Structural View" - Show only strong hierarchy (weight >= 100)
- [ ] "Full Hierarchy" - Show strong + medium (weight >= 50)
- [ ] "All Relationships" - Show everything (default)
- [ ] Save preset with view

**Step 4.3**: Add "Simplify" button
- [ ] Button to hide all weak relationships
- [ ] Button to show only Document→Section→Requirement chain
- [ ] Quick access to common views

### Phase 5: Testing & Polish (1-2 hours)

**Step 5.1**: Test with real data
- [ ] Test with small project (10-20 nodes)
- [ ] Test with medium project (50-100 nodes)
- [ ] Test with large project (200+ nodes)
- [ ] Identify performance issues

**Step 5.2**: Documentation
- [ ] Update user docs with hierarchy explanation
- [ ] Add relationship type reference
- [ ] Create visual examples

**Step 5.3**: Edge cases
- [ ] Cyclic hierarchies (should be impossible, but check)
- [ ] Disconnected subgraphs
- [ ] Very deep hierarchies (5+ levels)

---

## Expected Results

### Before (Current State)

```
[Diagram showing flat, chaotic layout where:
- Document and Section nodes at same level
- Requirement nodes scattered
- SATISFIES edges look same as CONTAINS edges
- No clear top-to-bottom hierarchy]
```

### After (With Edge Weights)

```
Level 0:  Tenant ──┐
                   │
Level 1:          Project ──┬── Document ──┬── Section ──┬── Requirement
                            │              │            │
                            ├── LinkSet    ├── Section  ├── Info
                            │              │            │
                            └── Diagram    └── Section  └── Requirement
                                                         ───┐
                                                            │ (dashed, weak)
                                                            ▼
                                                         Requirement
                                                         (SATISFIES)
```

**Visual Characteristics:**
- **Thick blue lines** = Strong hierarchy (CONTAINS, HAS_SECTION)
- **Medium gray lines** = Medium hierarchy (HAS_LINKSET)
- **Thin dashed lines** = Peer relationships (SATISFIES, RELATED_TO)
- **Clear levels** = Documents at level 1, Sections at level 2, Requirements at level 3

---

## Alternative: Compound Nodes (Future Enhancement)

For a **future version**, implement true compound node hierarchy:

### Compound Node Structure

```typescript
// Transform flat nodes to compound structure
const elements = transformToCompoundNodes(graphData);

function transformToCompoundNodes(graphData: any): ElementDefinition[] {
  const elements: ElementDefinition[] = [];

  // 1. Add Tenant as root compound node
  const tenant = graphData.nodes.find((n: any) => n.type === 'Tenant');
  elements.push({
    data: {
      id: tenant.id,
      label: tenant.label,
      type: tenant.type
    }
  });

  // 2. Add Projects as children of Tenant
  const projects = graphData.nodes.filter((n: any) => n.type === 'Project');
  projects.forEach((project: any) => {
    elements.push({
      data: {
        id: project.id,
        label: project.label,
        type: project.type,
        parent: tenant.id  // Compound parent
      }
    });
  });

  // 3. Add Documents as children of Projects
  const documents = graphData.nodes.filter((n: any) => n.type === 'Document');
  documents.forEach((doc: any) => {
    const parentProject = findParentViaRelationship(doc.id, 'HAS_DOCUMENT', graphData.relationships);
    elements.push({
      data: {
        id: doc.id,
        label: doc.label,
        type: doc.type,
        parent: parentProject  // Compound parent
      }
    });
  });

  // 4. Add Sections as children of Documents
  // ... and so on

  return elements;
}
```

**Compound Node Styling:**

```typescript
{
  selector: 'node[type="Tenant"]',
  style: {
    'background-color': '#f3f4f6',
    'background-opacity': 0.3,
    'border-width': 3,
    'border-color': '#8b5cf6',
    'compound-sizing-wrt-labels': 'include',
    'padding': '20px'
  }
},
{
  selector: 'node[type="Project"]',
  style: {
    'background-color': '#eff6ff',
    'background-opacity': 0.3,
    'border-width': 2,
    'border-color': '#06b6d4',
    'padding': '15px'
  }
}
```

**Note:** Compound nodes require significant refactoring and aren't supported by all layouts. Recommended as Phase 2 after edge weights are working.

---

## Performance Considerations

### Edge Weight Approach
- **Minimal overhead**: Just adds two properties to edge data
- **No graph transformation**: Works with existing flat structure
- **Fast layout**: Dagre performance is O(n log n) regardless of weights

### Compound Node Approach (Future)
- **Higher overhead**: Requires graph transformation on every data load
- **Layout complexity**: Compound nodes add nesting calculations
- **Memory impact**: Larger graph structure in memory

**Recommendation**: Start with edge weights (Phase 1), evaluate compound nodes later if needed.

---

## Testing Checklist

### Functional Tests
- [ ] Edge weights correctly assigned based on relationship type
- [ ] Hierarchical edges appear thicker and darker
- [ ] Dagre layout shows clear top-to-bottom hierarchy
- [ ] fCoSE layout clusters hierarchical relationships
- [ ] Filtering hierarchical edges works correctly
- [ ] Layout presets apply correct settings

### Visual Tests
- [ ] Document → Section → Requirement chain is vertical
- [ ] SATISFIES/RELATED_TO edges are dashed and light
- [ ] Strong hierarchy edges are thick and blue
- [ ] Legend accurately shows edge types
- [ ] Dark mode works correctly

### Performance Tests
- [ ] 50 nodes + 100 edges: Layout completes in <500ms
- [ ] 200 nodes + 400 edges: Layout completes in <2s
- [ ] 500 nodes + 1000 edges: Layout completes in <5s
- [ ] No memory leaks on repeated layout applications

### Edge Cases
- [ ] Graph with no hierarchical edges (all peer relationships)
- [ ] Graph with only hierarchical edges (pure tree)
- [ ] Disconnected components layout separately
- [ ] Very deep hierarchy (10+ levels) doesn't overflow

---

## Documentation Updates

### User Guide

Add section: **"Understanding Graph Hierarchy"**

```markdown
## Graph Hierarchy in AIRGen

AIRGen's graph viewer distinguishes between **hierarchical** and **peer** relationships:

### Hierarchical Relationships (Thick, Dark Lines)
These show **containment** or **ownership**:
- OWNS: Tenant owns Project
- HAS_DOCUMENT: Project contains Document
- HAS_SECTION: Document contains Section
- CONTAINS: Section contains Requirement/Info

**Visual**: Thick blue lines with solid arrows

### Peer Relationships (Thin, Dashed Lines)
These show **references** or **traces**:
- SATISFIES: Requirement satisfies another
- RELATED_TO: Requirement related to another
- LINKED_TO: Document linked to Document

**Visual**: Thin gray dashed lines

### Layout Tips
- **Dagre layout**: Best for hierarchical views (automatically arranges top-to-bottom)
- **fCoSE layout**: Best for clustered views (groups related nodes)
- **Breadth-First**: Best for exploring from a root node
```

### Developer Guide

Add section: **"Customizing Edge Weights"**

```typescript
// To add a new hierarchical relationship type:

// 1. Add to classification
const RELATIONSHIP_HIERARCHY = {
  strong: new Set([
    'OWNS',
    'HAS_DOCUMENT',
    'YOUR_NEW_TYPE',  // Add here for strong hierarchy
  ]),
  // ...
};

// 2. Edge weight is automatically assigned
// 3. Visual styling is automatically applied
// 4. Layout algorithms automatically respect it
```

---

## Future Enhancements

1. **Compound Nodes (Phase 2)**
   - True parent-child nesting for Documents/Sections/Requirements
   - Collapsible/expandable nodes
   - Visual containment

2. **Semantic Zoom**
   - Collapse deep hierarchies into summary nodes
   - "Show Details" button to expand
   - Preserve context while zooming

3. **Layout Templates**
   - "Requirements Traceability" view
   - "Document Structure" view
   - "Architecture Overview" view
   - One-click presets

4. **Edge Bundling**
   - Bundle multiple weak edges between same nodes
   - Reduce visual clutter
   - Expandable bundles

5. **Path Highlighting with Hierarchy Awareness**
   - "Show path respecting hierarchy" option
   - Prefer hierarchical paths over peer paths
   - Highlight structural context

---

## Success Metrics

**Before:**
- Users struggle to find Document → Section → Requirement chains
- Peer relationships (SATISFIES) visually indistinguishable from hierarchy
- Dagre layout produces flat, chaotic arrangements
- User feedback: "Graph is confusing and hard to navigate"

**After (Target):**
- Clear visual hierarchy in Dagre layout (>90% parent-above-child)
- Instant recognition of structural vs. trace relationships
- Users can quickly collapse to "structure only" view
- User feedback: "Graph clearly shows document structure"
- Layout time: <1s for 100 nodes (same as before - no performance degradation)

---

## Implementation Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Edge Metadata | 2 hours | None |
| Phase 2: Update Layouts | 3 hours | Phase 1 |
| Phase 3: Visual Styling | 1 hour | Phase 1 |
| Phase 4: User Controls | 2 hours | Phases 1-3 |
| Phase 5: Testing & Polish | 2 hours | All |
| **Total** | **10 hours** | **~1.5 days** |

---

## Conclusion

The graph viewer can significantly improve hierarchy visualization by:
1. **Classifying** relationship types (hierarchical vs. peer)
2. **Weighting** edges to prioritize hierarchy in layouts
3. **Styling** hierarchical edges distinctly (thick, dark, solid)
4. **Configuring** layout algorithms to respect edge weights

This is a **high-impact, low-effort** improvement that makes the graph much more intuitive without requiring architectural changes.

The edge weight approach is recommended for Phase 1. Compound nodes can be evaluated later if deeper nesting is needed.
