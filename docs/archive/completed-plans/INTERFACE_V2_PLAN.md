# Interface Studio v2 Plan

## Goals
- Eliminate UI jitter around diagram canvas interactions by isolating ReactFlow updates, memoising derived data, and debouncing writes.
- Preserve business requirements documented in Interface scope and lifecycle (tenant/project scoping, auto-naming, document reuse, per-diagram viewport state, floating pop-outs) while making the experience more predictable.
- Set a foundation for future extensions (collaboration, richer styling) by modularising the workspace shell.

## Key Changes
1. **State Layer Refresh**
   - Introduce `useInterfaceWorkspaceState`, wrapping the existing architecture hooks but exposing stable memoised nodes/edges payloads for ReactFlow.
   - Move viewport persistence, selection state, and connect-mode toggles into a reducer to avoid cascading re-renders across the workspace shell.
   - Debounce block/connector mutation calls and ensure optimistic updates are batch-scheduled.
2. **UI Composition**
   - Replace the monolithic workspace export with a `InterfaceWorkspaceV2` container that orchestrates shell, canvas, inspector, and palette panes while reusing existing shared components.
   - Ensure dialogs (create/rename/clear) use Radix-powered primitives so we can eliminate `window.confirm` flows and keep portal rendering predictable.
3. **Canvas Behaviour**
   - Layer new memoised selection + viewport helpers over the existing `DiagramCanvas` so ReactFlow instance churn is minimised.
   - Provide selection syncing hooks that only notify when IDs change.
   - Persist connector label drags and port hide/offset overrides per diagram so reused blocks and connectors can adapt to their context without mutating the library definitions; surface hidden-port counts inside the block shell to keep reviewers aware of suppressed handles.
4. **Sidepanes**
   - Block/Connector/Port detail panels become controlled components receiving `selectedEntity` props to avoid redundant lookups.
   - Palette emphasises reuse vs preset creation with quick actions bar.
5. **User Feedback**
   - Standardise toast usage for async flows and convert destructive actions to modal confirmations.

## Compatibility & Migration
- Existing InterfaceRoute continues to mount the workspace but via new components.
- Legacy exports kept temporarily (`export { InterfaceWorkspaceV1 as InterfaceWorkspace }`) to ease adoption by other routes if needed.
- Styles reuse existing CSS classes; future iterations can revisit global stylesheets once Tailwind migration lands.

## Risks & Mitigations
- **Increased bundle size**: monitor and tree-shake unused V1 logic during cleanup.
- **State drift during refactor**: reduce by writing helper selectors and centralising architecture updates.
- **Popup positioning regressions**: preserve Block/Connector styling popup behaviour with dedicated wrappers.

## Deliverables
- New hooks under `frontend/src/routes/InterfaceRoute/hooks/`.
- Updated workspace container at `frontend/src/routes/InterfaceRoute/InterfaceWorkspaceV2.tsx`.
- Updated route entry to mount V2 workspace.
- Unit-level coverage for reducer logic (if feasible with existing tooling).
