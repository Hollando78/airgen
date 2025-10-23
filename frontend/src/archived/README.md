# Archived Frontend Components

## SnapDraft (Archived: 2025-10-22)

### Archived Components
- `snapdraft/SnapDraftModal.tsx` - Modal UI for SnapDraft generation
- `snapdraft/useSnapDraftApi.ts` - React hook for SnapDraft API calls

### Why Archived
SnapDraft was producing visualizations that were "a worse version of the architecture diagram" due to a fundamental mismatch between AIRGen's conceptual data model (blocks, ports, protocols) and manufacturing-ready technical drawings (dimensions, tolerances, materials).

### Replacement
Replaced by **Imagine** - a quick visualization feature using Gemini 2.5 Flash Image that generates concept art and technical illustrations suitable for presentations and documentation.

### Future Plans
SnapDraft may be resurrected in the future for specialized technical diagrams like:
- Interface Control Drawings (ICDs)
- Deployment Diagrams
- Sequence Diagrams
- State Machine Diagrams
