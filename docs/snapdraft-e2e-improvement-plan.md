# SnapDraft End-to-End Improvement Plan

## 1. Goals
- Raise the consistency and manufacturability of technical drawings produced by SnapDraft.
- Increase determinism and observability of the generation pipeline to simplify triage.
- Reduce iteration cycles for users by surfacing missing-spec guidance before generation.

## 2. Current Limitations
- **Context fidelity:** Source documents and requirements are injected verbatim, so key measurements, tolerances, and materials remain buried and sometimes omitted due to token pressure.
- **Prompt resilience:** The generator prompt relies on prose instructions without schema enforcement or exemplars, leading to sporadic missing fields and validation failures.
- **Quality assurance:** We accept the first valid JSON that passes Zod, even if geometry is incomplete or assumptions are extreme; no automated structural audit exists.
- **Mode analysis opacity:** The decision to fall back to visualization lacks explicit evidence and telemetry, making it hard to tune thresholds or explain outcomes to users.
- **Frontend guidance:** Users cannot see what facts will reach the LLM, nor the specific gaps the analyzer found, which limits their ability to augment context before regenerating.
- **Token usage:** Full diagram and document payloads bloat prompts, potentially truncating critical technical data.

## 3. Proposed Enhancements

### 3.1 Context Fact Extraction
- Implement a preprocessing step (`backend/src/services/snapdraft/context-builder.ts`) that sends documents/requirements through a “fact extractor” (e.g., GPT-4o-mini with structured output) to capture:
  - Explicit dimensions (value, unit, feature, tolerance).
  - Material specifications and finishes.
  - Manufacturing constraints and acceptance criteria.
  - Open questions or ambiguities.
- Cache extracted facts alongside the raw content in the SnapDraft context object (e.g., `context.extractedFacts`) for reuse across analyze/generate calls.
- Provide a local heuristic fall-back (regex for units/material keywords) when LLM extraction fails, ensuring minimum structured data.

### 3.2 Prompt Hardening
- Move to JSON schema–based function calling for the generation request and reference the schema ID in the `response_format` field.
- Embed a concise, high-quality, few-shot example demonstrating a complete drawing spec, covering both successes and warning patterns.
- Add an explicit checklist in the prompt reminding the model to populate every schema section, referencing `extractedFacts` directly (e.g., “Use these verified dimensions: …”).
- Reduce prompt size by summarizing diagrams into textual relationship statements (see §3.4) before injection.

### 3.3 Post-Generation QA Loop
- After JSON validation, run an automated QA pass:
  - Deterministic geometry checks (zero-length lines, missing outline layer, unsorted entities).
  - Coverage checks against extracted facts (all critical dimensions represented, material noted).
  - Tolerance sanity validation (e.g., tolerance magnitude vs dimension).
- If issues are repairable, issue a corrective follow-up prompt (“Revise previous spec; add missing tolerances for X”); otherwise return structured warnings to the client.
- Persist QA results in `snapdraft_generation_logs` for observability.

### 3.4 Mode Analysis Improvements
- Ahead of the LLM call, compute simple metrics: count of numeric measurements, presence of tolerance keywords, explicit materials, number of diagrams selected.
- Feed these metrics plus extracted facts into the analyzer prompt, improving grounding and reducing hallucination risk.
- Record these metrics alongside final decisions for analytics dashboards, enabling threshold tuning.
- Add a retry strategy when the analyzer response is malformed or inconsistent (e.g., enforce schema parsing with automatic clarification prompt).

### 3.5 Frontend Experience Enhancements
- In `SnapDraftModal`, display the extracted fact table and highlight missing essentials (tolerances/material/critical dimensions).
- Surface `analysisResult.issues` prominently with recommended user actions (“Attach PCB fabrication spec to proceed with technical drawing”).
- Allow users to mark facts as authoritative or edit inferred values; propagate overrides back to the request payload.
- Provide QA warnings post-generation (e.g., “Added default ±0.1 mm tolerance—verify before manufacturing”).

### 3.6 Observability & Telemetry
- Expand `snapdraft_generation_logs` to include:
  - Prompt token counts and cost estimates.
  - Mode decision metrics and QA outcomes.
  - User overrides captured in the modal.
- Add structured logging for every LLM interaction (request hash, latency, retry count) to simplify incident analysis.

## 4. Implementation Roadmap

### Phase 1 – Foundations (Week 1)
1. Add structured fact extraction module and persist results in the context object.
2. Introduce heuristic fall-backs and unit tests covering extraction edge cases.
3. Update analyzer prompt to consume structured facts; add logging for derived metrics.

### Phase 2 – Prompt & QA Hardening (Weeks 2–3)
1. Implement JSON schema function-calling wrapper and embed few-shot exemplars.
2. Build QA module with geometry, coverage, and tolerance checks; integrate retry logic.
3. Extend `snapdraft_generation_logs` schema to capture QA telemetry and LLM call metadata.

### Phase 3 – Frontend Feedback Loop (Week 4)
1. Display extracted facts and analyzer issues in the modal; add user override controls.
2. Surface QA warnings in the results step and expose downloadable JSON audit summary.
3. Instrument React Query caches to refetch affected views (documents/history) after overrides.

### Phase 4 – Optimization & Analytics (Week 5+)
1. Summarize diagrams into textual relationship snippets to reduce prompt length; benchmark token savings.
2. Ship dashboard panels (Grafana/Metabase) for mode distribution, QA failure reasons, token costs.
3. Conduct usability study with power users; capture qualitative feedback and iterate.

## 5. Risks & Mitigations
- **LLM extraction drift:** Monitor extraction accuracy via sampled audits; add regression tests with recorded fixtures.
- **Cost increases:** Track token usage per stage; apply caching and model downgrades (e.g., 4o-mini) where precision allows.
- **User overload:** Keep UI additions collapsible and default to summarized views to avoid overwhelming casual users.
- **Timeline slip:** Tackle phases sequentially with feature flags to keep releases incremental and reversible.

## 6. Success Metrics
- ≥20% increase in technical drawing acceptance without manual edits (measure via QA logs).
- ≥30% reduction in visualization fallbacks caused by missing tolerances/materials.
- User satisfaction ≥4/5 in post-release survey regarding clarity of AI-generated drawings.
- Stable or reduced average LLM cost per generation due to prompt compaction and retries driven by QA rather than human re-runs.

