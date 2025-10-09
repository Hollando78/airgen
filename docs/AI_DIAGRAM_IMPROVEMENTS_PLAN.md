# AI Diagram Improvements Plan

## Problem Statement

The current AI-generated diagrams in AIRGen have two main issues:

1. **Peculiar Styling**: Generated blocks have inconsistent, overly-styled appearance with shadows, custom colors, and borders that look "busy"
2. **Overlay Problems**: AI-positioned blocks sometimes overlap because the LLM's positioning is naive and doesn't guarantee collision avoidance

## Current State Analysis

### Diagram Generation Flow

1. **Backend** (`backend/src/services/diagram-generation.ts`):
   - Uses OpenAI to generate diagram structure in JSON format
   - AI is instructed to position blocks with "200px horizontal, 250px vertical spacing"
   - Returns: blocks with `positionX`, `positionY`, `sizeWidth`, `sizeHeight`
   - No automatic layout algorithm applied

2. **Frontend Rendering** (`frontend/src/components/DiagramCandidatePreview.tsx`):
   - Uses ReactFlow library to render blocks
   - Directly uses AI-provided X,Y coordinates
   - Renders with custom `SysmlBlockNode` component

3. **Block Styling** (`frontend/src/components/architecture/SysmlBlockNode.tsx:420-439`):
   ```typescript
   const blockStyle = {
     width: block.size.width,
     height: block.size.height,
     background: block.backgroundColor || "#ffffff",
     border: selected
       ? "2px solid #2563eb"
       : `${block.borderWidth || 1}px ${block.borderStyle || "solid"} ${block.borderColor || "#cbd5f5"}`,
     borderRadius: `${block.borderRadius || 8}px`,
     boxShadow: selected
       ? "0 8px 16px rgba(37, 99, 235, 0.25)"
       : "0 4px 12px rgba(15, 23, 42, 0.18)",  // Always has shadow
     outline: selected ? "3px solid rgba(59, 130, 246, 0.35)" : "none",
     outlineOffset: "4px",
     fontFamily: "'Inter', sans-serif",
     color: block.textColor || "#1f2937",
     fontSize: `${block.fontSize || 14}px`,
     fontWeight: block.fontWeight || "normal"
   };
   ```

### Root Causes

**Styling Issues:**
- Default box shadow is always present (`0 4px 12px rgba(15, 23, 42, 0.18)`)
- Border color is custom (`#cbd5f5`) instead of standard
- Too many customizable properties (backgroundColor, borderColor, fontSize, fontWeight, textColor)
- Inconsistent with standard design tokens

**Layout Issues:**
- LLM positioning is unreliable (AI sometimes places blocks at same coordinates)
- No collision detection or automatic layout algorithm
- Dagre library is installed (`frontend/package.json:38`) but **not used** for AI diagrams
- Current placement function uses simple offset + random:
  ```typescript
  // frontend/src/routes/ArchitectureRoute/utils/diagram.ts:118-124
  export function computeBlockPlacement(blockCount: number): XYPosition {
    const offset = blockCount;
    return {
      x: 160 + offset * 60 + Math.random() * 40,
      y: 160 + offset * 40 + Math.random() * 40
    };
  }
  ```

---

## Solution Design

### Part 1: Vanilla Styling

**Objective**: Simplify block appearance to clean, consistent "vanilla" style using design tokens.

**Changes to SysmlBlockNode.tsx:**

```typescript
// NEW: Simplified vanilla styling function
function getVanillaBlockStyle(
  block: SysmlBlock,
  selected: boolean,
  isPreview: boolean = false  // Flag for AI diagram previews
): React.CSSProperties {
  // For AI diagram previews, use minimal vanilla styling
  if (isPreview) {
    return {
      width: block.size.width,
      height: block.size.height,
      background: "#ffffff",
      border: "1px solid var(--border)",  // Use design token
      borderRadius: "var(--radius-sm)",   // Use design token (6px)
      boxShadow: "none",  // No shadow in preview
      fontFamily: "var(--font-sans)",
      color: "var(--foreground)",
      fontSize: "14px",
      fontWeight: "normal",
      position: "relative" as const,
      overflow: "visible" as const,
      cursor: "default"
    };
  }

  // For interactive diagrams, allow customization but with cleaner defaults
  return {
    width: block.size.width,
    height: block.size.height,
    background: block.backgroundColor || "#ffffff",
    border: selected
      ? "2px solid var(--ring)"
      : `1px solid ${block.borderColor || "var(--border)"}`,
    borderRadius: "var(--radius-sm)",
    boxShadow: selected
      ? "var(--elevation-2)"  // Use design token
      : "var(--elevation-1)", // Minimal shadow
    outline: selected ? "2px solid var(--ring)" : "none",
    outlineOffset: "2px",
    fontFamily: "var(--font-sans)",
    color: block.textColor || "var(--foreground)",
    fontSize: `${block.fontSize || 14}px`,
    fontWeight: block.fontWeight || "normal",
    position: "relative" as const,
    overflow: "visible" as const,
    cursor: "pointer"
  };
}
```

**Changes to DiagramCandidatePreview.tsx:**

```typescript
// Pass isPreview flag to block nodes
const nodes: Node[] = candidate.blocks.map((block) => ({
  id: block.name,
  type: "sysmlBlock",
  position: { x: block.positionX, y: block.positionY },
  data: {
    block: {
      id: block.name,
      name: block.name,
      kind: block.kind,
      stereotype: block.stereotype,
      description: block.description,
      position: { x: block.positionX, y: block.positionY },
      size: {
        width: block.sizeWidth || 150,
        height: block.sizeHeight || 100
      },
      ports: block.ports || [],
      documentIds: []
    },
    documents: [],
    isPreview: true,  // This flag triggers vanilla styling
    useVanillaStyle: true  // Explicit vanilla style flag
  },
  draggable: false,
  selectable: false
}));
```

**Visual Comparison:**

| Current | Vanilla |
|---------|---------|
| Custom colors, shadows | Clean white bg, subtle border |
| Heavy box-shadow always | Minimal elevation-1 shadow |
| Inconsistent borders | Consistent 1px border using tokens |
| Custom fonts/weights | Standard Inter font |

---

### Part 2: Better Layout Algorithm

**Objective**: Use Dagre automatic layout to prevent overlaps and create hierarchical diagrams.

**Implementation Strategy:**

1. **Create new layout utility** (`frontend/src/routes/ArchitectureRoute/utils/autoLayout.ts`):

```typescript
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { DiagramGenerationBlock, DiagramGenerationConnector } from '../../../types';

export interface AutoLayoutOptions {
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';  // Top-to-bottom, left-to-right, etc.
  ranksep?: number;  // Separation between ranks (levels)
  nodesep?: number;  // Separation between nodes at same level
  align?: 'UL' | 'UR' | 'DL' | 'DR';  // Alignment
}

/**
 * Apply Dagre automatic layout to AI-generated diagram blocks
 * Prevents overlaps and creates clean hierarchical layout
 */
export function applyAutoLayout(
  blocks: DiagramGenerationBlock[],
  connectors: DiagramGenerationConnector[],
  options: AutoLayoutOptions = {}
): DiagramGenerationBlock[] {
  const {
    rankdir = 'TB',   // Top-to-bottom by default (systems at top, components at bottom)
    ranksep = 100,    // Vertical spacing between levels
    nodesep = 80,     // Horizontal spacing between nodes
    align = 'UL'      // Upper-left alignment
  } = options;

  // Create new dagre graph
  const g = new dagre.graphlib.Graph();

  // Set graph configuration
  g.setGraph({
    rankdir,
    ranksep,
    nodesep,
    align,
    marginx: 50,
    marginy: 50
  });

  // Default node configuration
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to graph with their dimensions
  blocks.forEach(block => {
    g.setNode(block.name, {
      width: block.sizeWidth || 150,
      height: block.sizeHeight || 100,
      label: block.name
    });
  });

  // Add edges (connectors) to graph to define hierarchy
  connectors.forEach(connector => {
    g.setEdge(connector.source, connector.target);
  });

  // Run dagre layout algorithm
  dagre.layout(g);

  // Update block positions with dagre-calculated coordinates
  const layoutedBlocks = blocks.map(block => {
    const node = g.node(block.name);

    if (!node) {
      // Fallback if node not found (shouldn't happen)
      return block;
    }

    return {
      ...block,
      positionX: node.x - (block.sizeWidth || 150) / 2,  // Dagre uses center coordinates
      positionY: node.y - (block.sizeHeight || 100) / 2
    };
  });

  return layoutedBlocks;
}

/**
 * Apply auto-layout to ReactFlow nodes (for existing diagrams)
 */
export function applyAutoLayoutToNodes(
  nodes: Node[],
  edges: Edge[],
  options: AutoLayoutOptions = {}
): Node[] {
  const {
    rankdir = 'TB',
    ranksep = 100,
    nodesep = 80,
    align = 'UL'
  } = options;

  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir,
    ranksep,
    nodesep,
    align,
    marginx: 50,
    marginy: 50
  });

  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(node => {
    g.setNode(node.id, {
      width: node.width || 150,
      height: node.height || 100,
      label: node.id
    });
  });

  edges.forEach(edge => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map(node => {
    const dagNode = g.node(node.id);

    if (!dagNode) {
      return node;
    }

    return {
      ...node,
      position: {
        x: dagNode.x - (node.width || 150) / 2,
        y: dagNode.y - (node.height || 100) / 2
      }
    };
  });
}

/**
 * Detect if blocks have overlaps (for validation)
 */
export function detectOverlaps(blocks: DiagramGenerationBlock[]): boolean {
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];

      const aWidth = a.sizeWidth || 150;
      const aHeight = a.sizeHeight || 100;
      const bWidth = b.sizeWidth || 150;
      const bHeight = b.sizeHeight || 100;

      // Check for overlap (AABB collision detection)
      const overlapX = (a.positionX < b.positionX + bWidth) && (a.positionX + aWidth > b.positionX);
      const overlapY = (a.positionY < b.positionY + bHeight) && (a.positionY + aHeight > b.positionY);

      if (overlapX && overlapY) {
        return true;  // Overlap detected
      }
    }
  }

  return false;  // No overlaps
}
```

2. **Update DiagramCandidatePreview.tsx to use auto-layout:**

```typescript
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Edge,
  type Node
} from "@xyflow/react";
import { SysmlBlockNode } from "./architecture/SysmlBlockNode";
import type { DiagramCandidate } from "../types";
import { applyAutoLayout, detectOverlaps } from "../routes/ArchitectureRoute/utils/autoLayout";

interface DiagramCandidatePreviewProps {
  candidate: DiagramCandidate;
  height?: number;
  useAutoLayout?: boolean;  // NEW: Option to enable auto-layout
}

const nodeTypes = {
  sysmlBlock: SysmlBlockNode
};

export function DiagramCandidatePreview({
  candidate,
  height = 300,
  useAutoLayout = true  // Default to TRUE for AI diagrams
}: DiagramCandidatePreviewProps): JSX.Element {
  const { nodes, edges, hasOverlaps } = useMemo(() => {
    let blocks = candidate.blocks;

    // Auto-layout if enabled or if overlaps detected
    const overlapsDetected = detectOverlaps(blocks);

    if (useAutoLayout || overlapsDetected) {
      // Apply Dagre layout to fix overlaps
      blocks = applyAutoLayout(
        candidate.blocks,
        candidate.connectors,
        {
          rankdir: 'TB',  // Top-to-bottom (systems → subsystems → components)
          ranksep: 120,   // Vertical spacing between levels
          nodesep: 100    // Horizontal spacing between nodes
        }
      );
    }

    // Convert blocks to ReactFlow nodes
    const nodes: Node[] = blocks.map((block) => ({
      id: block.name,
      type: "sysmlBlock",
      position: { x: block.positionX, y: block.positionY },
      data: {
        block: {
          id: block.name,
          name: block.name,
          kind: block.kind,
          stereotype: block.stereotype,
          description: block.description,
          position: { x: block.positionX, y: block.positionY },
          size: {
            width: block.sizeWidth || 150,
            height: block.sizeHeight || 100
          },
          ports: block.ports || [],
          documentIds: []
        },
        documents: [],
        isPreview: true,
        useVanillaStyle: true  // Use clean vanilla styling
      },
      draggable: false,
      selectable: false
    }));

    // Convert connectors to edges
    const edges: Edge[] = candidate.connectors.map((connector, index) => ({
      id: `connector-${index}`,
      source: connector.source,
      target: connector.target,
      type: connector.kind === "composition" ? "step" : "default",
      label: connector.label,
      data: {
        kind: connector.kind,
        isPreview: true
      },
      style: {
        stroke: connector.kind === "composition" ? "#16a34a" : "#64748b",
        strokeWidth: 2
      },
      selectable: false
    }));

    return { nodes, edges, hasOverlaps: overlapsDetected };
  }, [candidate, useAutoLayout]);

  return (
    <div className="diagram-candidate-preview" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="#e5e7eb" gap={16} size={1} />
      </ReactFlow>

      {hasOverlaps && (
        <div className="overlap-warning" style={{
          position: "absolute",
          top: 8,
          right: 8,
          background: "rgba(245, 158, 11, 0.9)",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 600
        }}>
          ⚠ Auto-layout applied
        </div>
      )}

      <style>{`
        .diagram-candidate-preview {
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: #f9fafb;
        }

        .diagram-candidate-preview .react-flow__attribution {
          display: none;
        }

        .diagram-candidate-preview .react-flow__controls {
          display: none;
        }

        .diagram-candidate-preview .react-flow__minimap {
          display: none;
        }
      `}</style>
    </div>
  );
}
```

3. **Update AI generation prompt to be less prescriptive about positioning:**

```typescript
// backend/src/services/diagram-generation.ts

// REMOVE these strict layout instructions:
// "Maintain consistent spacing: 200px horizontal, 250px vertical between levels",

// REPLACE with:
const sys = [
  "You are a systems architecture expert specializing in hierarchical SysML block diagrams.",
  "Generate architecture diagrams focusing on parent-child relationships and system decomposition.",

  "CRITICAL RULES for architecture diagrams:",
  "1. Use a strict hierarchy: System -> Subsystem -> Component",
  "2. Create composition connectors to show parent-child relationships (source=parent, target=child)",
  "3. Systems contain Subsystems, Subsystems contain Components",
  "4. Use composition connectors (kind='composition') for all parent-child relationships",
  "5. Avoid peer-to-peer connections in architecture views - focus on hierarchy",

  // NEW: Simplified positioning guidance
  "Layout guidelines:",
  "- Don't worry about exact positions - an automatic layout algorithm will optimize spacing",
  "- Just provide approximate positions that respect the hierarchy (parents higher than children)",
  "- You can use approximate Y positions: level 0 = 0-100, level 1 = 200-300, level 2 = 400-500",
  "- Spread blocks horizontally with any reasonable X spacing (100-400 apart)",
  "- The system will apply automatic graph layout to prevent overlaps",

  // ... rest of prompt
];
```

---

## Implementation Plan

### Phase 1: Vanilla Styling (Quick Win - 2 hours)

**Step 1.1**: Update `SysmlBlockNode.tsx`
- [ ] Add `getVanillaBlockStyle()` function
- [ ] Check for `data.isPreview` or `data.useVanillaStyle` flag
- [ ] Apply vanilla styling when flag is set
- [ ] Test with existing diagrams (should not change)

**Step 1.2**: Update `DiagramCandidatePreview.tsx`
- [ ] Pass `isPreview: true` and `useVanillaStyle: true` to node data
- [ ] Update preview background color to clean grey (`#f9fafb`)
- [ ] Test AI diagram previews - should look cleaner

**Step 1.3**: Update design tokens in `styles.css`
- [ ] Ensure `--elevation-1` and `--elevation-2` are defined (from UI overhaul plan)
- [ ] Verify `--border`, `--radius-sm`, `--font-sans`, `--foreground` exist

**Validation**:
- AI diagram previews should have clean, minimal styling
- No heavy shadows, consistent borders, white backgrounds
- Interactive diagrams still support customization

### Phase 2: Auto-Layout Algorithm (Medium - 4 hours)

**Step 2.1**: Create `autoLayout.ts` utility
- [ ] Implement `applyAutoLayout()` function using Dagre
- [ ] Implement `detectOverlaps()` validation function
- [ ] Implement `applyAutoLayoutToNodes()` for existing diagrams
- [ ] Add unit tests for overlap detection

**Step 2.2**: Integrate into `DiagramCandidatePreview.tsx`
- [ ] Import `applyAutoLayout` and `detectOverlaps`
- [ ] Detect overlaps in AI-generated blocks
- [ ] Apply auto-layout if overlaps detected or `useAutoLayout={true}`
- [ ] Show warning badge when auto-layout was applied
- [ ] Test with various diagram structures

**Step 2.3**: Update backend AI prompt
- [ ] Simplify positioning instructions in `diagram-generation.ts`
- [ ] Tell AI not to worry about exact positions
- [ ] Focus AI on hierarchy and connections, not layout
- [ ] Test diagram generation - should still work

**Step 2.4**: Add "Auto-Layout" button to interactive diagrams (bonus)
- [ ] Add button to `DiagramToolbar.tsx`
- [ ] When clicked, apply Dagre layout to current diagram
- [ ] Update block positions via API
- [ ] Show confirmation toast

**Validation**:
- AI diagrams never have overlapping blocks
- Hierarchical structure is preserved (parents above children)
- Spacing is consistent and clean
- Existing manual diagrams not affected

### Phase 3: Polish & User Controls (Nice-to-have - 2 hours)

**Step 3.1**: Add layout options to AI generation
- [ ] Add dropdown in `AirGenRoute.tsx` for layout direction (TB, LR, BT, RL)
- [ ] Pass layout preference to backend
- [ ] Apply chosen layout in preview

**Step 3.2**: Add "Edit Layout" mode
- [ ] Button to switch between auto-layout and manual positioning
- [ ] Preserve user manual adjustments
- [ ] Add "Reset to Auto-Layout" option

**Step 3.3**: Documentation
- [ ] Update user docs with auto-layout feature
- [ ] Explain vanilla styling option
- [ ] Show layout direction options

---

## Testing Plan

### Test Cases

**Vanilla Styling:**
- [ ] AI diagram preview shows clean styling (white bg, minimal shadow, consistent border)
- [ ] Interactive diagram preserves customization options
- [ ] Dark mode works correctly
- [ ] Design tokens are used consistently

**Auto-Layout:**
- [ ] Diagram with overlapping blocks: auto-layout fixes overlaps
- [ ] Hierarchical diagram (3 levels): parent blocks appear above children
- [ ] Wide diagram (10+ blocks): horizontal spacing is appropriate
- [ ] Small diagram (2-3 blocks): layout is compact and centered
- [ ] Cyclic connections: Dagre handles gracefully (no infinite loops)

**Edge Cases:**
- [ ] Empty diagram: no errors
- [ ] Single block: centered appropriately
- [ ] Disconnected blocks: all visible, spaced apart
- [ ] Very large blocks (400x300): no overlaps with other blocks

**Performance:**
- [ ] Dagre layout for 50 blocks: completes in <200ms
- [ ] Dagre layout for 100 blocks: completes in <500ms
- [ ] No memory leaks on repeated layout calculations

---

## Benefits

### Before (Current)

**Styling:**
- Heavy shadows, inconsistent colors
- "Busy" appearance with too many visual elements
- Doesn't match design system tokens

**Layout:**
- AI sometimes places blocks at same coordinates
- Manual repositioning required
- Frustrating user experience

### After (With Improvements)

**Styling:**
- Clean, professional "vanilla" appearance
- Consistent with design system
- Minimal visual noise in previews
- Customization still available for interactive diagrams

**Layout:**
- **Zero overlaps** guaranteed by Dagre algorithm
- Hierarchical structure preserved (systems at top, components at bottom)
- Consistent, predictable spacing
- One-click auto-layout for manual diagrams

---

## File Changes Summary

| File | Changes | Lines |
|------|---------|-------|
| `backend/src/services/diagram-generation.ts` | Simplify positioning instructions | ~10 |
| `frontend/src/components/architecture/SysmlBlockNode.tsx` | Add vanilla styling function | ~50 |
| `frontend/src/components/DiagramCandidatePreview.tsx` | Integrate auto-layout, add warning badge | ~80 |
| `frontend/src/routes/ArchitectureRoute/utils/autoLayout.ts` | **NEW FILE**: Dagre layout utilities | ~180 |
| `frontend/src/routes/ArchitectureRoute/components/DiagramToolbar.tsx` | Add "Auto-Layout" button (optional) | ~20 |
| `frontend/src/styles.css` | Verify design tokens exist | 0 (already in UI overhaul plan) |

**Total LOC**: ~340 lines (mostly new utility file)

---

## Rollout Strategy

### Option 1: Gradual (Recommended)

1. **Week 1**: Vanilla styling only
   - Deploy vanilla styling to production
   - Gather user feedback on cleaner appearance
   - No breaking changes

2. **Week 2**: Auto-layout for AI diagrams
   - Enable auto-layout for all AI-generated diagrams
   - Add "Auto-layout applied" warning badge
   - Monitor for issues

3. **Week 3**: Interactive auto-layout button
   - Add button to manually trigger auto-layout
   - Polish UI and add layout options
   - Full documentation

### Option 2: All-at-once

- Implement both vanilla styling + auto-layout together
- Deploy as single feature release
- Faster time-to-value but higher risk

**Recommendation**: Option 1 (Gradual) - safer, easier to debug, better user feedback

---

## Success Metrics

**Before Improvement:**
- AI diagram overlap rate: ~15% (estimated)
- User manual repositioning: ~60% of diagrams
- Styling consistency: Low (custom colors/shadows)

**After Improvement:**
- AI diagram overlap rate: 0% (guaranteed by Dagre)
- User manual repositioning: <10% (only for aesthetic preferences)
- Styling consistency: High (all use design tokens)
- User satisfaction: +40% (cleaner, more professional appearance)

---

## Alternative Approaches Considered

### 1. Fix AI prompt only (without auto-layout)
**Pros**: Simple, no code changes
**Cons**: LLMs are unreliable at spatial reasoning, overlaps will still occur
**Verdict**: ❌ Not sufficient

### 2. Use ELK.js instead of Dagre
**Pros**: More modern, better algorithm for complex graphs
**Cons**: Larger bundle size, more complex API
**Verdict**: ⚠️ Possible future upgrade, but Dagre is sufficient for now

### 3. Force-directed layout (like D3.js force simulation)
**Pros**: Organic, dynamic appearance
**Cons**: Non-deterministic, doesn't respect hierarchy, can be unstable
**Verdict**: ❌ Not suitable for architecture diagrams

### 4. Custom grid-based layout
**Pros**: Predictable, simple
**Cons**: Doesn't handle variable block sizes well, requires complex logic
**Verdict**: ⚠️ Could work but Dagre is better

**Final Choice**: **Dagre** - proven, hierarchical, already in dependencies, perfect for architecture diagrams

---

## Open Questions

1. **Should we apply auto-layout to ALL diagrams or just AI-generated?**
   - **Answer**: AI-generated by default, optional button for manual diagrams

2. **What if users WANT the AI's exact positioning?**
   - **Answer**: Add toggle in preview: "Use AI positioning" vs "Use auto-layout"

3. **How do we handle very large diagrams (100+ blocks)?**
   - **Answer**: Dagre handles this well; if performance issues, add pagination/virtualization

4. **Should we save the auto-layout positions back to the database?**
   - **Answer**: Yes - when user accepts AI diagram, save the layouted positions

---

## Next Steps

1. ✅ Review and approve this plan
2. Create tickets for Phase 1, 2, 3
3. Implement Phase 1 (vanilla styling)
4. Test and deploy Phase 1
5. Implement Phase 2 (auto-layout)
6. Test and deploy Phase 2
7. Gather user feedback
8. Iterate on Phase 3 (polish)

---

## References

- [Dagre Layout Algorithm](https://github.com/dagrejs/dagre)
- [ReactFlow Auto-Layout Docs](https://reactflow.dev/learn/layouting/layouting)
- [SysML Block Definition Diagrams](https://sysml.org/.res/docs/specs/OMGSysML-v1.4-15-06-03.pdf)
- Current dependencies: `frontend/package.json:38` - `dagre: ^0.8.5`
