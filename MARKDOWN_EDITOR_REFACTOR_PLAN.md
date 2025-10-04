# Markdown Editor Refactor Plan

## Objectives
- Make Neo4j the authoritative source for structured documents.
- Support ephemeral markdown drafts without persisting published content to disk.
- Guarantee 1:1 round-trip fidelity between markdown and graph data.
- Improve validation and publish performance for large documents.
- Extend the graph schema to safely capture all data needed for regeneration.

## Current Issues
- Backend route `backend/src/routes/markdown-api.ts` reads and writes long-lived markdown files in the workspace, conflicting with the single-source-of-truth goal.
- Draft saves hit the same route as publishes, writing files on every autosave cycle.
- Publish logic performs dozens of sequential Neo4j operations, causing high latency.
- Validation re-parses markdown and runs QA on every keystroke, hammering the API.
- Graph schema lacks entities to store non-requirement markdown blocks or drafts, preventing lossless regeneration.

## Proposed Architecture
1. **Draft Storage in Neo4j**
   - Introduce `(:DocumentDraft {id, tenant, projectKey, documentSlug, content, authorId, updatedAt})` linked via `(:Document)-[:HAS_DRAFT]->(:DocumentDraft)`.
   - Update `PUT /api/markdown/.../content` to upsert draft nodes when `validate=false`; return draft metadata instead of touching disk.

2. **Transactional Publish Endpoint**
   - Replace the current PUT handler with two explicit modes (`draft` vs `publish`) or new endpoints.
   - On publish, run validation, diff, and graph mutations inside a single managed transaction to ensure atomic updates.
   - After successful publish, delete any associated `DocumentDraft` nodes.

3. **Markdown ↔ Graph Fidelity Layer**
   - Extend parser and schema to capture all block types:
     - Add `DocumentContentBlock` nodes with `order`, `type`, and serialized payload for plain text, diagram references, surrogates, etc.
     - Preserve requirement order via an `order` property rather than relying on `ref` sorting.
   - Implement a generator that rebuilds markdown from graph data to guarantee round-trip equality.

4. **Performance Optimisations**
   - Adjust frontend validation cadence (e.g., debounce to 2–3 seconds, manual validate button, or local linting before network calls).
   - Return diff metadata from the backend validate response so the frontend can skip extra `listRequirements`/`listSections` calls.
   - Move QA scoring to publish-time or explicit validations to reduce load during typing.

5. **Removal of Filesystem Dependence**
   - Delete workspace document writes and reads; always generate editor content from Neo4j using the new generator.
   - Provide a fallback migration that converts existing `.md` files into draft nodes on first load to avoid data loss.

## Work Breakdown
1. **Schema Updates**
   - Create/adjust Neo4j constraints and indexes for `DocumentDraft` and `DocumentContentBlock`.
   - Write migration scripts to populate new nodes from existing graph data or legacy markdown files.

2. **Backend Services**
   - Refactor markdown routes to use draft storage and transactional publish logic.
   - Extract markdown parsing/generation and diffing into reusable service modules.
   - Add tests covering draft save, publish, and round-trip regeneration.

3. **Frontend Changes**
   - Update `MarkdownEditorView` to call separate draft and publish endpoints, handle draft metadata, and tune validation frequency.
   - Display publish diff summaries using data returned from the backend instead of client-side calculations.

4. **Performance & Observability**
   - Benchmark large-document publish times before/after refactor.
   - Add logging/metrics for validation duration, publish transaction time, and diff size.

5. **Documentation & Rollout**
   - Update developer guides to describe the new workflow and schema.
   - Provide migration instructions for existing environments (including draft seeding from disk files).
   - Plan a staged rollout with feature flags if needed.

## Open Questions
- Should drafts be immutable versions (audit trail) or a single mutable record per document?
- Do we need to store rendered HTML alongside markdown for fast previews, or is on-the-fly rendering acceptable?
- How should conflicts be handled if two users edit the same document concurrently (locking vs merge)?

## Success Criteria
- No markdown files remain in the workspace after publish; deleting the workspace directory does not lose committed content.
- editor → publish → regenerate cycle yields identical markdown for unchanged docs.
- Draft saves complete in under 150 ms, publishes in under 1 s for 200-requirement documents.
- Schema changes pass validation with Neo4j indexes in place and no orphaned nodes.
