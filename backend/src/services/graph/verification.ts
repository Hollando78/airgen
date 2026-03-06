import type { ManagedTransaction, Node as Neo4jNode } from "neo4j-driver";
import { createHash, randomBytes } from "node:crypto";
import { slugify } from "../workspace.js";
import { getSession } from "./driver.js";

// ── Types ──────────────────────────────────────────────────────

export type VerificationMethod = "Test" | "Analysis" | "Inspection" | "Demonstration";
export type ActivityStatus = "planned" | "in_progress" | "executed" | "passed" | "failed" | "blocked";
export type EvidenceVerdict = "pass" | "fail" | "inconclusive" | "not_applicable";
export type DocStatus = "draft" | "review" | "approved" | "superseded";
export type DocKind = "test_plan" | "test_procedure" | "test_report" | "analysis_report" | "inspection_checklist" | "demonstration_protocol";
export type EvidenceType = "test_result" | "analysis_report" | "inspection_record" | "demonstration_record";
export type LocatorType = "structured_section" | "pdf_page" | "docx_paragraph" | "xlsx_cell" | "external_url";

export type VerificationActivityRecord = {
  activityId: string;
  method: VerificationMethod;
  status: ActivityStatus;
  title: string;
  description?: string | null;
  requirementId: string;
  requirementRef?: string;
  tenant: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
};

export type VerificationEvidenceRecord = {
  evidenceId: string;
  type: EvidenceType;
  title: string;
  summary?: string | null;
  verdict: EvidenceVerdict;
  recordedAt: string;
  recordedBy: string;
  activityId: string;
  tenant: string;
  projectKey: string;
};

export type VerificationDocumentRecord = {
  vdocId: string;
  name: string;
  kind: DocKind;
  status: DocStatus;
  currentRevision: string;
  tenant: string;
  projectKey: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentRevisionRecord = {
  revisionId: string;
  revisionNumber: string;
  changeDescription: string;
  contentHash: string;
  vdocId: string;
  createdAt: string;
  createdBy: string;
};

export type StableReferenceRecord = {
  refId: string;
  locatorType: LocatorType;
  locator: Record<string, unknown>;
  excerptText: string;
  excerptHash: string;
  capturedAt: string;
  driftDetected: boolean;
  evidenceId: string;
  revisionId: string;
};

// ── Mappers ────────────────────────────────────────────────────

function mapActivity(node: Neo4jNode, reqRef?: string): VerificationActivityRecord {
  const p = node.properties as Record<string, unknown>;
  return {
    activityId: String(p.activityId),
    method: String(p.method) as VerificationMethod,
    status: String(p.status) as ActivityStatus,
    title: String(p.title),
    description: p.description ? String(p.description) : null,
    requirementId: String(p.requirementId),
    requirementRef: reqRef ?? (p.requirementRef ? String(p.requirementRef) : undefined),
    tenant: String(p.tenant),
    projectKey: String(p.projectKey),
    createdAt: String(p.createdAt),
    updatedAt: String(p.updatedAt),
  };
}

function mapEvidence(node: Neo4jNode): VerificationEvidenceRecord {
  const p = node.properties as Record<string, unknown>;
  return {
    evidenceId: String(p.evidenceId),
    type: String(p.type) as EvidenceType,
    title: String(p.title),
    summary: p.summary ? String(p.summary) : null,
    verdict: String(p.verdict) as EvidenceVerdict,
    recordedAt: String(p.recordedAt),
    recordedBy: String(p.recordedBy),
    activityId: String(p.activityId),
    tenant: String(p.tenant),
    projectKey: String(p.projectKey),
  };
}

function mapVDoc(node: Neo4jNode): VerificationDocumentRecord {
  const p = node.properties as Record<string, unknown>;
  return {
    vdocId: String(p.vdocId),
    name: String(p.name),
    kind: String(p.kind) as DocKind,
    status: String(p.status) as DocStatus,
    currentRevision: String(p.currentRevision),
    tenant: String(p.tenant),
    projectKey: String(p.projectKey),
    createdAt: String(p.createdAt),
    updatedAt: String(p.updatedAt),
  };
}

function mapRevision(node: Neo4jNode): DocumentRevisionRecord {
  const p = node.properties as Record<string, unknown>;
  return {
    revisionId: String(p.revisionId),
    revisionNumber: String(p.revisionNumber),
    changeDescription: String(p.changeDescription),
    contentHash: String(p.contentHash),
    vdocId: String(p.vdocId),
    createdAt: String(p.createdAt),
    createdBy: String(p.createdBy),
  };
}

function mapStableRef(node: Neo4jNode): StableReferenceRecord {
  const p = node.properties as Record<string, unknown>;
  return {
    refId: String(p.refId),
    locatorType: String(p.locatorType) as LocatorType,
    locator: typeof p.locator === "string" ? JSON.parse(p.locator as string) : (p.locator as Record<string, unknown>) ?? {},
    excerptText: String(p.excerptText),
    excerptHash: String(p.excerptHash),
    capturedAt: String(p.capturedAt),
    driftDetected: Boolean(p.driftDetected),
    evidenceId: String(p.evidenceId),
    revisionId: String(p.revisionId),
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function genId(): string {
  return `v-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

// ── Verification Activities ────────────────────────────────────

export async function createVerificationActivity(params: {
  tenant: string;
  projectKey: string;
  requirementId: string;
  method: VerificationMethod;
  title: string;
  description?: string;
}): Promise<VerificationActivityRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const activityId = genId();

  const session = getSession();
  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      const res = await tx.run(`
        MATCH (req:Requirement {id: $requirementId})
        CREATE (va:VerificationActivity {
          activityId: $activityId,
          method: $method,
          status: 'planned',
          title: $title,
          description: $description,
          requirementId: $requirementId,
          requirementRef: req.ref,
          tenant: $tenant,
          projectKey: $projectKey,
          createdAt: $now,
          updatedAt: $now
        })
        CREATE (va)-[:VERIFIES]->(req)
        RETURN va, req.ref AS reqRef
      `, {
        activityId,
        method: params.method,
        title: params.title,
        description: params.description ?? null,
        requirementId: params.requirementId,
        tenant: tenantSlug,
        projectKey: projectSlug,
        now,
      });

      if (res.records.length === 0) {
        throw new Error(`Requirement not found: ${params.requirementId}`);
      }

      return mapActivity(
        res.records[0].get("va") as Neo4jNode,
        String(res.records[0].get("reqRef")),
      );
    });
  } finally {
    await session.close();
  }
}

export async function listVerificationActivities(
  tenant: string,
  projectKey: string,
  filters?: { status?: ActivityStatus; method?: VerificationMethod },
): Promise<VerificationActivityRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const where: string[] = ["va.tenant = $tenant", "va.projectKey = $projectKey"];
  if (filters?.status) where.push("va.status = $status");
  if (filters?.method) where.push("va.method = $method");

  const session = getSession();
  try {
    const res = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (va:VerificationActivity)
        WHERE ${where.join(" AND ")}
        OPTIONAL MATCH (va)-[:VERIFIES]->(req:Requirement)
        RETURN va, req.ref AS reqRef
        ORDER BY va.createdAt DESC
      `, {
        tenant: tenantSlug,
        projectKey: projectSlug,
        status: filters?.status ?? null,
        method: filters?.method ?? null,
      });
    });
    return res.records.map(r =>
      mapActivity(r.get("va") as Neo4jNode, r.get("reqRef") ? String(r.get("reqRef")) : undefined),
    );
  } finally {
    await session.close();
  }
}

export async function updateVerificationActivity(
  activityId: string,
  updates: { status?: ActivityStatus; title?: string; description?: string },
): Promise<VerificationActivityRecord> {
  const now = new Date().toISOString();
  const sets: string[] = ["va.updatedAt = $now"];
  if (updates.status) sets.push("va.status = $status");
  if (updates.title) sets.push("va.title = $title");
  if (updates.description !== undefined) sets.push("va.description = $description");

  const session = getSession();
  try {
    const res = await session.executeWrite(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (va:VerificationActivity {activityId: $activityId})
        SET ${sets.join(", ")}
        RETURN va
      `, {
        activityId,
        now,
        status: updates.status ?? null,
        title: updates.title ?? null,
        description: updates.description ?? null,
      });
    });
    if (res.records.length === 0) throw new Error(`Activity not found: ${activityId}`);
    return mapActivity(res.records[0].get("va") as Neo4jNode);
  } finally {
    await session.close();
  }
}

// ── Verification Evidence ──────────────────────────────────────

export async function addVerificationEvidence(params: {
  tenant: string;
  projectKey: string;
  activityId: string;
  type: EvidenceType;
  title: string;
  summary?: string;
  verdict: EvidenceVerdict;
  recordedBy: string;
}): Promise<VerificationEvidenceRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const evidenceId = genId();

  const session = getSession();
  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      const res = await tx.run(`
        MATCH (va:VerificationActivity {activityId: $activityId})
        CREATE (ve:VerificationEvidence {
          evidenceId: $evidenceId,
          type: $type,
          title: $title,
          summary: $summary,
          verdict: $verdict,
          recordedAt: $now,
          recordedBy: $recordedBy,
          activityId: $activityId,
          tenant: $tenant,
          projectKey: $projectKey
        })
        CREATE (ve)-[:SUPPORTS]->(va)
        RETURN ve
      `, {
        evidenceId,
        activityId: params.activityId,
        type: params.type,
        title: params.title,
        summary: params.summary ?? null,
        verdict: params.verdict,
        recordedBy: params.recordedBy,
        tenant: tenantSlug,
        projectKey: projectSlug,
        now,
      });
      if (res.records.length === 0) throw new Error(`Activity not found: ${params.activityId}`);
      return mapEvidence(res.records[0].get("ve") as Neo4jNode);
    });
  } finally {
    await session.close();
  }
}

export async function listVerificationEvidence(
  tenant: string,
  projectKey: string,
  activityId?: string,
): Promise<VerificationEvidenceRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const where = ["ve.tenant = $tenant", "ve.projectKey = $projectKey"];
  if (activityId) where.push("ve.activityId = $activityId");

  const session = getSession();
  try {
    const res = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (ve:VerificationEvidence)
        WHERE ${where.join(" AND ")}
        RETURN ve ORDER BY ve.recordedAt DESC
      `, { tenant: tenantSlug, projectKey: projectSlug, activityId: activityId ?? null });
    });
    return res.records.map(r => mapEvidence(r.get("ve") as Neo4jNode));
  } finally {
    await session.close();
  }
}

// ── Verification Documents ─────────────────────────────────────

export async function createVerificationDocument(params: {
  tenant: string;
  projectKey: string;
  name: string;
  kind: DocKind;
}): Promise<VerificationDocumentRecord> {
  const tenantSlug = slugify(params.tenant);
  const projectSlug = slugify(params.projectKey);
  const now = new Date().toISOString();
  const vdocId = genId();
  const revisionId = genId();

  const session = getSession();
  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      const res = await tx.run(`
        MERGE (project:Project {slug: $projectKey, tenantSlug: $tenant})
        CREATE (vd:VerificationDocument {
          vdocId: $vdocId,
          name: $name,
          kind: $kind,
          status: 'draft',
          currentRevision: '0.1',
          tenant: $tenant,
          projectKey: $projectKey,
          createdAt: $now,
          updatedAt: $now
        })
        CREATE (rev:DocumentRevision {
          revisionId: $revisionId,
          revisionNumber: '0.1',
          changeDescription: 'Initial draft',
          contentHash: $contentHash,
          vdocId: $vdocId,
          createdAt: $now,
          createdBy: 'system'
        })
        CREATE (vd)-[:HAS_REVISION]->(rev)
        CREATE (project)-[:HAS_VERIFICATION_DOCUMENT]->(vd)
        RETURN vd
      `, {
        vdocId,
        revisionId,
        name: params.name,
        kind: params.kind,
        tenant: tenantSlug,
        projectKey: projectSlug,
        contentHash: sha256(`${params.name}:0.1:${now}`),
        now,
      });
      return mapVDoc(res.records[0].get("vd") as Neo4jNode);
    });
  } finally {
    await session.close();
  }
}

export async function listVerificationDocuments(
  tenant: string,
  projectKey: string,
): Promise<VerificationDocumentRecord[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const res = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (vd:VerificationDocument {tenant: $tenant, projectKey: $projectKey})
        RETURN vd ORDER BY vd.createdAt DESC
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });
    return res.records.map(r => mapVDoc(r.get("vd") as Neo4jNode));
  } finally {
    await session.close();
  }
}

export async function updateVerificationDocumentStatus(
  vdocId: string,
  status: DocStatus,
): Promise<VerificationDocumentRecord> {
  const now = new Date().toISOString();
  const session = getSession();
  try {
    const res = await session.executeWrite(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (vd:VerificationDocument {vdocId: $vdocId})
        SET vd.status = $status, vd.updatedAt = $now
        RETURN vd
      `, { vdocId, status, now });
    });
    if (res.records.length === 0) throw new Error(`Document not found: ${vdocId}`);
    return mapVDoc(res.records[0].get("vd") as Neo4jNode);
  } finally {
    await session.close();
  }
}

export async function createDocumentRevision(params: {
  vdocId: string;
  revisionNumber: string;
  changeDescription: string;
  createdBy: string;
}): Promise<DocumentRevisionRecord> {
  const now = new Date().toISOString();
  const revisionId = genId();

  const session = getSession();
  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      // Check doc is not approved
      const docCheck = await tx.run(`
        MATCH (vd:VerificationDocument {vdocId: $vdocId})
        RETURN vd.status AS status
      `, { vdocId: params.vdocId });

      if (docCheck.records.length === 0) throw new Error(`Document not found: ${params.vdocId}`);
      const currentStatus = String(docCheck.records[0].get("status"));
      if (currentStatus === "approved") {
        throw new Error("Cannot create revision on approved document. Change status to draft or review first.");
      }

      const res = await tx.run(`
        MATCH (vd:VerificationDocument {vdocId: $vdocId})
        CREATE (rev:DocumentRevision {
          revisionId: $revisionId,
          revisionNumber: $revisionNumber,
          changeDescription: $changeDescription,
          contentHash: $contentHash,
          vdocId: $vdocId,
          createdAt: $now,
          createdBy: $createdBy
        })
        CREATE (vd)-[:HAS_REVISION]->(rev)
        SET vd.currentRevision = $revisionNumber, vd.updatedAt = $now
        RETURN rev
      `, {
        vdocId: params.vdocId,
        revisionId,
        revisionNumber: params.revisionNumber,
        changeDescription: params.changeDescription,
        contentHash: sha256(`${params.vdocId}:${params.revisionNumber}:${now}`),
        createdBy: params.createdBy,
        now,
      });

      return mapRevision(res.records[0].get("rev") as Neo4jNode);
    });
  } finally {
    await session.close();
  }
}

export async function listDocumentRevisions(vdocId: string): Promise<DocumentRevisionRecord[]> {
  const session = getSession();
  try {
    const res = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (vd:VerificationDocument {vdocId: $vdocId})-[:HAS_REVISION]->(rev:DocumentRevision)
        RETURN rev ORDER BY rev.createdAt DESC
      `, { vdocId });
    });
    return res.records.map(r => mapRevision(r.get("rev") as Neo4jNode));
  } finally {
    await session.close();
  }
}

// ── Stable References ──────────────────────────────────────────

export async function createStableReference(params: {
  evidenceId: string;
  revisionId: string;
  locatorType: LocatorType;
  locator: Record<string, unknown>;
  excerptText: string;
}): Promise<StableReferenceRecord> {
  const now = new Date().toISOString();
  const refId = genId();
  const excerptHash = sha256(params.excerptText);

  const session = getSession();
  try {
    return await session.executeWrite(async (tx: ManagedTransaction) => {
      const res = await tx.run(`
        MATCH (ve:VerificationEvidence {evidenceId: $evidenceId})
        MATCH (rev:DocumentRevision {revisionId: $revisionId})
        CREATE (sr:StableReference {
          refId: $refId,
          locatorType: $locatorType,
          locator: $locator,
          excerptText: $excerptText,
          excerptHash: $excerptHash,
          capturedAt: $now,
          driftDetected: false,
          evidenceId: $evidenceId,
          revisionId: $revisionId
        })
        CREATE (ve)-[:HAS_REFERENCE]->(sr)
        CREATE (sr)-[:REFERENCES]->(rev)
        RETURN sr
      `, {
        refId,
        evidenceId: params.evidenceId,
        revisionId: params.revisionId,
        locatorType: params.locatorType,
        locator: JSON.stringify(params.locator),
        excerptText: params.excerptText,
        excerptHash,
        now,
      });
      if (res.records.length === 0) throw new Error("Evidence or revision not found");
      return mapStableRef(res.records[0].get("sr") as Neo4jNode);
    });
  } finally {
    await session.close();
  }
}

// ── Verification Engine ────────────────────────────────────────

export type VerificationFinding = {
  type: string;
  severity: "error" | "warning" | "info";
  requirementRef?: string;
  requirementId?: string;
  activityId?: string;
  evidenceId?: string;
  message: string;
};

export type VerificationReport = {
  tenant: string;
  projectKey: string;
  summary: {
    totalRequirements: number;
    verified: number;
    unverified: number;
    incomplete: number;
    driftedEvidence: number;
    coveragePercent: number;
  };
  findings: VerificationFinding[];
};

export async function runVerificationEngine(
  tenant: string,
  projectKey: string,
): Promise<VerificationReport> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);
  const findings: VerificationFinding[] = [];

  const session = getSession();
  try {
    // 1. Find unverified requirements
    const unverifiedRes = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (req:Requirement {tenant: $tenant, projectKey: $projectKey})
        WHERE NOT (req)<-[:VERIFIES]-(:VerificationActivity)
          AND NOT coalesce(req.deleted, false)
        RETURN req.ref AS ref, req.id AS id
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });
    for (const r of unverifiedRes.records) {
      findings.push({
        type: "unverified",
        severity: "error",
        requirementRef: String(r.get("ref")),
        requirementId: String(r.get("id")),
        message: `Requirement ${r.get("ref")} has no verification activity assigned.`,
      });
    }

    // 2. Find activities marked passed but with no evidence
    const missingEvidenceRes = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (va:VerificationActivity {tenant: $tenant, projectKey: $projectKey, status: 'passed'})
        WHERE NOT (va)<-[:SUPPORTS]-(:VerificationEvidence)
        OPTIONAL MATCH (va)-[:VERIFIES]->(req:Requirement)
        RETURN va.activityId AS actId, va.title AS title, req.ref AS reqRef
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });
    for (const r of missingEvidenceRes.records) {
      findings.push({
        type: "missing_evidence",
        severity: "error",
        activityId: String(r.get("actId")),
        requirementRef: r.get("reqRef") ? String(r.get("reqRef")) : undefined,
        message: `Activity "${r.get("title")}" is passed but has no supporting evidence.`,
      });
    }

    // 3. Find verdict conflicts (activity passed but evidence says fail)
    const conflictRes = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (ve:VerificationEvidence {tenant: $tenant, projectKey: $projectKey})-[:SUPPORTS]->(va:VerificationActivity {status: 'passed'})
        WHERE ve.verdict IN ['fail', 'inconclusive']
        OPTIONAL MATCH (va)-[:VERIFIES]->(req:Requirement)
        RETURN va.activityId AS actId, ve.evidenceId AS evId, ve.verdict AS verdict, req.ref AS reqRef
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });
    for (const r of conflictRes.records) {
      findings.push({
        type: "verdict_conflict",
        severity: "error",
        activityId: String(r.get("actId")),
        evidenceId: String(r.get("evId")),
        requirementRef: r.get("reqRef") ? String(r.get("reqRef")) : undefined,
        message: `Activity passed but evidence verdict is "${r.get("verdict")}".`,
      });
    }

    // 4. Find evidence without source references
    const noRefRes = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (ve:VerificationEvidence {tenant: $tenant, projectKey: $projectKey})
        WHERE NOT (ve)-[:HAS_REFERENCE]->(:StableReference)
        RETURN ve.evidenceId AS evId, ve.title AS title
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });
    for (const r of noRefRes.records) {
      findings.push({
        type: "evidence_without_reference",
        severity: "warning",
        evidenceId: String(r.get("evId")),
        message: `Evidence "${r.get("title")}" has no source reference linked.`,
      });
    }

    // 5. Find drifted stable references
    const driftRes = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (sr:StableReference {driftDetected: true})<-[:HAS_REFERENCE]-(ve:VerificationEvidence {tenant: $tenant, projectKey: $projectKey})
        OPTIONAL MATCH (ve)-[:SUPPORTS]->(va:VerificationActivity)-[:VERIFIES]->(req:Requirement)
        RETURN sr.refId AS refId, ve.evidenceId AS evId, va.activityId AS actId, req.ref AS reqRef
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });
    for (const r of driftRes.records) {
      findings.push({
        type: "drift_detected",
        severity: "error",
        evidenceId: String(r.get("evId")),
        activityId: r.get("actId") ? String(r.get("actId")) : undefined,
        requirementRef: r.get("reqRef") ? String(r.get("reqRef")) : undefined,
        message: `Source content has changed since evidence was captured. Verification may be invalidated.`,
      });
    }

    // 6. Find verification status mismatches (impl says verified but no passed activity)
    const mismatchRes = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (req:Requirement {tenant: $tenant, projectKey: $projectKey})
        WHERE req.implementationStatus = 'verified'
          AND NOT (req)<-[:VERIFIES]-(:VerificationActivity {status: 'passed'})
        RETURN req.ref AS ref, req.id AS id
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });
    for (const r of mismatchRes.records) {
      findings.push({
        type: "status_mismatch",
        severity: "warning",
        requirementRef: String(r.get("ref")),
        requirementId: String(r.get("id")),
        message: `Requirement ${r.get("ref")} marked as verified but has no passed verification activity.`,
      });
    }

    // Summary counts
    const countRes = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (req:Requirement {tenant: $tenant, projectKey: $projectKey})
        WHERE NOT coalesce(req.deleted, false)
        WITH count(req) AS total
        OPTIONAL MATCH (va:VerificationActivity {tenant: $tenant, projectKey: $projectKey, status: 'passed'})-[:VERIFIES]->(vReq:Requirement)
        WITH total, count(DISTINCT vReq) AS verified
        OPTIONAL MATCH (va2:VerificationActivity {tenant: $tenant, projectKey: $projectKey})-[:VERIFIES]->(iReq:Requirement)
        WHERE va2.status IN ['planned', 'in_progress', 'executed']
          AND NOT (iReq)<-[:VERIFIES]-(:VerificationActivity {status: 'passed'})
        WITH total, verified, count(DISTINCT iReq) AS incomplete
        RETURN total, verified, incomplete
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });

    const total = countRes.records[0]?.get("total")?.toNumber?.() ?? countRes.records[0]?.get("total") ?? 0;
    const verified = countRes.records[0]?.get("verified")?.toNumber?.() ?? countRes.records[0]?.get("verified") ?? 0;
    const incomplete = countRes.records[0]?.get("incomplete")?.toNumber?.() ?? countRes.records[0]?.get("incomplete") ?? 0;
    const driftCount = driftRes.records.length;

    return {
      tenant: tenantSlug,
      projectKey: projectSlug,
      summary: {
        totalRequirements: total as number,
        verified: verified as number,
        unverified: unverifiedRes.records.length,
        incomplete: incomplete as number,
        driftedEvidence: driftCount,
        coveragePercent: total > 0 ? Math.round(((verified as number) / (total as number)) * 100) : 0,
      },
      findings,
    };
  } finally {
    await session.close();
  }
}

// ── Verification Matrix ────────────────────────────────────────

export type MatrixRow = {
  requirementRef: string;
  requirementId: string;
  requirementText: string;
  activities: Array<{
    activityId: string;
    method: VerificationMethod;
    status: ActivityStatus;
    title: string;
    evidenceCount: number;
    hasPassingEvidence: boolean;
  }>;
};

export async function getVerificationMatrix(
  tenant: string,
  projectKey: string,
): Promise<MatrixRow[]> {
  const tenantSlug = slugify(tenant);
  const projectSlug = slugify(projectKey);

  const session = getSession();
  try {
    const res = await session.executeRead(async (tx: ManagedTransaction) => {
      return tx.run(`
        MATCH (req:Requirement {tenant: $tenant, projectKey: $projectKey})
        WHERE NOT coalesce(req.deleted, false)
        OPTIONAL MATCH (va:VerificationActivity)-[:VERIFIES]->(req)
        OPTIONAL MATCH (ve:VerificationEvidence)-[:SUPPORTS]->(va)
        WITH req, va,
             count(ve) AS evCount,
             CASE WHEN any(e IN collect(ve.verdict) WHERE e = 'pass') THEN true ELSE false END AS hasPass
        ORDER BY req.ref, va.createdAt
        WITH req, collect(CASE WHEN va IS NOT NULL THEN {
          activityId: va.activityId,
          method: va.method,
          status: va.status,
          title: va.title,
          evidenceCount: evCount,
          hasPassingEvidence: hasPass
        } ELSE null END) AS activities
        RETURN req.ref AS ref, req.id AS id, req.text AS text,
               [a IN activities WHERE a IS NOT NULL] AS activities
        ORDER BY req.ref
      `, { tenant: tenantSlug, projectKey: projectSlug });
    });

    return res.records.map(r => ({
      requirementRef: String(r.get("ref")),
      requirementId: String(r.get("id")),
      requirementText: String(r.get("text")),
      activities: (r.get("activities") as Array<Record<string, unknown>>).map(a => ({
        activityId: String(a.activityId),
        method: String(a.method) as VerificationMethod,
        status: String(a.status) as ActivityStatus,
        title: String(a.title),
        evidenceCount: typeof a.evidenceCount === 'object' && a.evidenceCount !== null && 'toNumber' in (a.evidenceCount as object)
          ? (a.evidenceCount as { toNumber: () => number }).toNumber()
          : Number(a.evidenceCount),
        hasPassingEvidence: Boolean(a.hasPassingEvidence),
      })),
    }));
  } finally {
    await session.close();
  }
}
