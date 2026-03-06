import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createVerificationActivity,
  listVerificationActivities,
  updateVerificationActivity,
  addVerificationEvidence,
  listVerificationEvidence,
  createVerificationDocument,
  listVerificationDocuments,
  updateVerificationDocumentStatus,
  createDocumentRevision,
  listDocumentRevisions,
  createStableReference,
  runVerificationEngine,
  getVerificationMatrix,
} from "../services/graph.js";
import { verifyTenantAccessHook, verifyTenantAccessFromBodyHook } from "../lib/authorization.js";

export default async function registerVerificationRoutes(app: FastifyInstance): Promise<void> {

  // ── Activities ──────────────────────────────────────────────

  app.post("/verification/activities", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: { tags: ["verification"], summary: "Create a verification activity" },
  }, async (req, reply) => {
    const body = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      requirementId: z.string().min(1),
      method: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]),
      title: z.string().min(1),
      description: z.string().optional(),
    }).parse(req.body);

    try {
      const activity = await createVerificationActivity(body);
      return { activity };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) return reply.status(404).send({ error: msg });
      throw error;
    }
  });

  app.get("/verification/activities/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: { tags: ["verification"], summary: "List verification activities" },
  }, async (req) => {
    const params = z.object({ tenant: z.string(), project: z.string() }).parse(req.params);
    const query = z.object({
      status: z.enum(["planned", "in_progress", "executed", "passed", "failed", "blocked"]).optional(),
      method: z.enum(["Test", "Analysis", "Inspection", "Demonstration"]).optional(),
    }).parse(req.query);

    const activities = await listVerificationActivities(params.tenant, params.project, query);
    return { activities };
  });

  app.patch("/verification/activities/:activityId", {
    onRequest: [app.authenticate],
    schema: { tags: ["verification"], summary: "Update a verification activity" },
  }, async (req, reply) => {
    const { activityId } = z.object({ activityId: z.string() }).parse(req.params);
    const updates = z.object({
      status: z.enum(["planned", "in_progress", "executed", "passed", "failed", "blocked"]).optional(),
      title: z.string().optional(),
      description: z.string().optional(),
    }).parse(req.body);

    try {
      const activity = await updateVerificationActivity(activityId, updates);
      return { activity };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) return reply.status(404).send({ error: msg });
      throw error;
    }
  });

  // ── Evidence ────────────────────────────────────────────────

  app.post("/verification/evidence", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: { tags: ["verification"], summary: "Add verification evidence" },
  }, async (req, reply) => {
    const body = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      activityId: z.string().min(1),
      type: z.enum(["test_result", "analysis_report", "inspection_record", "demonstration_record"]),
      title: z.string().min(1),
      summary: z.string().optional(),
      verdict: z.enum(["pass", "fail", "inconclusive", "not_applicable"]),
      recordedBy: z.string().min(1),
    }).parse(req.body);

    try {
      const evidence = await addVerificationEvidence(body);
      return { evidence };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) return reply.status(404).send({ error: msg });
      throw error;
    }
  });

  app.get("/verification/evidence/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: { tags: ["verification"], summary: "List verification evidence" },
  }, async (req) => {
    const params = z.object({ tenant: z.string(), project: z.string() }).parse(req.params);
    const query = z.object({ activityId: z.string().optional() }).parse(req.query);

    const evidence = await listVerificationEvidence(params.tenant, params.project, query.activityId);
    return { evidence };
  });

  // ── Verification Documents ─────────────────────────────────

  app.post("/verification/documents", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessFromBodyHook],
    schema: { tags: ["verification"], summary: "Create a verification document" },
  }, async (req) => {
    const body = z.object({
      tenant: z.string().min(1),
      projectKey: z.string().min(1),
      name: z.string().min(1),
      kind: z.enum(["test_plan", "test_procedure", "test_report", "analysis_report", "inspection_checklist", "demonstration_protocol"]),
    }).parse(req.body);

    const document = await createVerificationDocument(body);
    return { document };
  });

  app.get("/verification/documents/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: { tags: ["verification"], summary: "List verification documents" },
  }, async (req) => {
    const params = z.object({ tenant: z.string(), project: z.string() }).parse(req.params);
    const documents = await listVerificationDocuments(params.tenant, params.project);
    return { documents };
  });

  app.patch("/verification/documents/:vdocId/status", {
    onRequest: [app.authenticate],
    schema: { tags: ["verification"], summary: "Update verification document status" },
  }, async (req, reply) => {
    const { vdocId } = z.object({ vdocId: z.string() }).parse(req.params);
    const { status } = z.object({
      status: z.enum(["draft", "review", "approved", "superseded"]),
    }).parse(req.body);

    try {
      const document = await updateVerificationDocumentStatus(vdocId, status);
      return { document };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) return reply.status(404).send({ error: msg });
      throw error;
    }
  });

  // ── Document Revisions ─────────────────────────────────────

  app.post("/verification/documents/:vdocId/revisions", {
    onRequest: [app.authenticate],
    schema: { tags: ["verification"], summary: "Create a document revision" },
  }, async (req, reply) => {
    const { vdocId } = z.object({ vdocId: z.string() }).parse(req.params);
    const body = z.object({
      revisionNumber: z.string().min(1),
      changeDescription: z.string().min(1),
      createdBy: z.string().min(1),
    }).parse(req.body);

    try {
      const revision = await createDocumentRevision({ vdocId, ...body });
      return { revision };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found") || msg.includes("Cannot create revision")) {
        return reply.status(400).send({ error: msg });
      }
      throw error;
    }
  });

  app.get("/verification/documents/:vdocId/revisions", {
    onRequest: [app.authenticate],
    schema: { tags: ["verification"], summary: "List document revisions" },
  }, async (req) => {
    const { vdocId } = z.object({ vdocId: z.string() }).parse(req.params);
    const revisions = await listDocumentRevisions(vdocId);
    return { revisions };
  });

  // ── Stable References ──────────────────────────────────────

  app.post("/verification/references", {
    onRequest: [app.authenticate],
    schema: { tags: ["verification"], summary: "Create a stable reference" },
  }, async (req, reply) => {
    const body = z.object({
      evidenceId: z.string().min(1),
      revisionId: z.string().min(1),
      locatorType: z.enum(["structured_section", "pdf_page", "docx_paragraph", "xlsx_cell", "external_url"]),
      locator: z.record(z.unknown()),
      excerptText: z.string().min(1),
    }).parse(req.body);

    try {
      const reference = await createStableReference(body);
      return { reference };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) return reply.status(404).send({ error: msg });
      throw error;
    }
  });

  // ── Engine & Matrix ────────────────────────────────────────

  app.get("/verification/engine/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: { tags: ["verification"], summary: "Run the verification engine" },
  }, async (req) => {
    const params = z.object({ tenant: z.string(), project: z.string() }).parse(req.params);
    const report = await runVerificationEngine(params.tenant, params.project);
    return { report };
  });

  app.get("/verification/matrix/:tenant/:project", {
    onRequest: [app.authenticate],
    preHandler: [verifyTenantAccessHook],
    schema: { tags: ["verification"], summary: "Get the verification matrix" },
  }, async (req) => {
    const params = z.object({ tenant: z.string(), project: z.string() }).parse(req.params);
    const matrix = await getVerificationMatrix(params.tenant, params.project);
    return { matrix };
  });
}
