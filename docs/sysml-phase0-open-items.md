# SysML Phase 0 – Open Items Tracker

**Status:** Draft  
**Purpose:** Aggregate outstanding work required to complete Phase 0 of `/root/MBSE_INTEGRATION_PLAN.md`.  
**Last Updated:** 2025-10-26

---

## Architecture & Schema

- [ ] Review `docs/sysml-schema.md` with SysML SMEs; confirm label names vs. `sysml-modeler`.
- [ ] Produce ERD + sequence diagrams (target path: `docs/sysml-diagrams/`).
- [x] Implement `backend/scripts/migrate-add-sysml.ts` to create constraints and seed viewpoints (Phase 0 constraints + demo seeds; expand for full schema in later phases).
- [ ] Prototype read API returning new schema (`backend/src/services/graph/sysml/blocks.ts` placeholder; packages + element read endpoints live, block/interface/port metadata mapped, diagram read endpoints live, block relationships enabled; remaining: other element types, diagram layout snapshots, relationship validations).

## Security & Compliance

- [ ] Validate mitigations listed in `docs/security/sysml-threat-model.md`.
- [x] Add rate-limit configuration for `/sysml` namespace in Fastify setup.
- [ ] Extend activity logging to capture SysML mutations; confirm retention.

## Developer Enablement

- [x] Add `infra/docker-compose.sysml.yml` for local Neo4j/Redis + seeds (Phase 0 scaffold running Neo4j + Redis only).
- [x] Create seed script (`backend/src/scripts/seed-sysml-fixtures.ts`).
- [x] Scaffold backend route handler + placeholder tests to keep build green (routes + tests in `backend/src/routes/sysml.ts` and `backend/src/routes/__tests__/sysml.test.ts`).
- [x] Deliver initial SysML frontend workspace at `/sysml-models` (packages/elements/diagrams CRUD, seeded data path).
- [ ] Expand unit/integration coverage for element/diagram creation workflows once write APIs stabilize.
- [ ] Publish Postman collection or Bruno workspace for new API endpoints.

## Testing Foundations

- [ ] Extend Vitest integration harness with SysML container image.
- [ ] Add Playwright `@sysml` tag and baseline scenario (feature flag guard).
- [ ] Ensure CI pipeline downloads Neo4j plugins required for new constraints.

## Coordination

- [ ] Schedule Architecture Summit recap; capture sign-off notes in this repo.
- [ ] Align with traceability team on relationship naming (`SATISFIES` vs. `SATISFIES_SYSML`).
- [ ] Communicate feature flag rollout plan to customer success.

---

> Update this tracker at the end of each Phase 0 working session. Once all items are checked, Phase 0 exit criteria in `/root/MBSE_INTEGRATION_PLAN.md` should be ready for review.
