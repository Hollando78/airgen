import { Command } from "commander";
import type { AirgenClient } from "../client.js";
import { output, printTable, isJsonMode, truncate } from "../output.js";

// ── Types ────────────────────────────────────────────────────

interface Activity {
  activityId: string;
  method: string;
  status: string;
  title: string;
  description?: string | null;
  requirementId: string;
  requirementRef?: string;
  createdAt: string;
}

interface Evidence {
  evidenceId: string;
  type: string;
  title: string;
  summary?: string | null;
  verdict: string;
  recordedAt: string;
  recordedBy: string;
  activityId: string;
}

interface VDoc {
  vdocId: string;
  name: string;
  kind: string;
  status: string;
  currentRevision: string;
  createdAt: string;
}

interface Revision {
  revisionId: string;
  revisionNumber: string;
  changeDescription: string;
  vdocId: string;
  createdAt: string;
  createdBy: string;
}

interface Finding {
  type: string;
  severity: string;
  requirementRef?: string;
  activityId?: string;
  evidenceId?: string;
  message: string;
}

interface Report {
  summary: {
    totalRequirements: number;
    verified: number;
    unverified: number;
    incomplete: number;
    driftedEvidence: number;
    coveragePercent: number;
  };
  findings: Finding[];
}

interface MatrixRow {
  requirementRef: string;
  requirementId: string;
  requirementText: string;
  activities: Array<{
    activityId: string;
    method: string;
    status: string;
    title: string;
    evidenceCount: number;
    hasPassingEvidence: boolean;
  }>;
}

const METHODS = ["Test", "Analysis", "Inspection", "Demonstration"] as const;
const ACTIVITY_STATUSES = ["planned", "in_progress", "executed", "passed", "failed", "blocked"] as const;
const EVIDENCE_TYPES = ["test_result", "analysis_report", "inspection_record", "demonstration_record"] as const;
const VERDICTS = ["pass", "fail", "inconclusive", "not_applicable"] as const;
const DOC_KINDS = ["test_plan", "test_procedure", "test_report", "analysis_report", "inspection_checklist", "demonstration_protocol"] as const;
const DOC_STATUSES = ["draft", "review", "approved", "superseded"] as const;

function severityIcon(s: string): string {
  switch (s) {
    case "error": return "[!]";
    case "warning": return "[~]";
    case "info": return "[i]";
    default: return "[ ]";
  }
}

function statusIcon(s: string): string {
  switch (s) {
    case "passed": return "[v]";
    case "failed": return "[x]";
    case "blocked": return "[!]";
    case "executed": return "[>]";
    case "in_progress": return "[~]";
    case "planned": return "[ ]";
    default: return "[-]";
  }
}

// ── Command registration ─────────────────────────────────────

export function registerVerifyCommands(program: Command, client: AirgenClient) {
  const cmd = program.command("verify").description("Verification management");

  // ── Activities ──────────────────────────────────────────

  const act = cmd.command("activities").alias("act").description("Verification activities");

  act
    .command("list")
    .description("List verification activities")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("--status <s>", "Filter by status")
    .option("--method <m>", "Filter by method")
    .action(async (tenant: string, project: string, opts: { status?: string; method?: string }) => {
      const query: Record<string, string | undefined> = {};
      if (opts.status) query.status = opts.status;
      if (opts.method) query.method = opts.method;

      const data = await client.get<{ activities: Activity[] }>(
        `/verification/activities/${tenant}/${project}`, query,
      );
      const activities = data.activities ?? [];

      if (isJsonMode()) {
        output(activities);
      } else {
        printTable(
          ["ID", "Method", "Status", "Title", "Req Ref"],
          activities.map(a => [
            a.activityId,
            a.method,
            statusIcon(a.status) + " " + a.status,
            truncate(a.title, 40),
            a.requirementRef ?? "",
          ]),
        );
      }
    });

  act
    .command("create")
    .description("Create a verification activity")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project key")
    .argument("<requirement-id>", "Requirement ID")
    .requiredOption("--method <m>", `Method: ${METHODS.join(", ")}`)
    .requiredOption("--title <t>", "Activity title")
    .option("--description <d>", "Description")
    .action(async (tenant: string, project: string, requirementId: string, opts: {
      method: string; title: string; description?: string;
    }) => {
      if (!METHODS.includes(opts.method as typeof METHODS[number])) {
        console.error(`Invalid method. Must be one of: ${METHODS.join(", ")}`);
        process.exit(1);
      }

      const data = await client.post<{ activity: Activity }>("/verification/activities", {
        tenant,
        projectKey: project,
        requirementId,
        method: opts.method,
        title: opts.title,
        description: opts.description,
      });

      if (isJsonMode()) {
        output(data.activity);
      } else {
        console.log(`Activity created: ${data.activity.activityId}`);
      }
    });

  act
    .command("update")
    .description("Update a verification activity")
    .argument("<activity-id>", "Activity ID")
    .option("--status <s>", `Status: ${ACTIVITY_STATUSES.join(", ")}`)
    .option("--title <t>", "Title")
    .option("--description <d>", "Description")
    .action(async (activityId: string, opts: { status?: string; title?: string; description?: string }) => {
      const data = await client.patch<{ activity: Activity }>(
        `/verification/activities/${activityId}`, opts,
      );

      if (isJsonMode()) {
        output(data.activity);
      } else {
        console.log(`Activity updated: ${data.activity.activityId} (${data.activity.status})`);
      }
    });

  // ── Evidence ────────────────────────────────────────────

  const ev = cmd.command("evidence").alias("ev").description("Verification evidence");

  ev
    .command("list")
    .description("List verification evidence")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .option("--activity <id>", "Filter by activity ID")
    .action(async (tenant: string, project: string, opts: { activity?: string }) => {
      const query: Record<string, string | undefined> = {};
      if (opts.activity) query.activityId = opts.activity;

      const data = await client.get<{ evidence: Evidence[] }>(
        `/verification/evidence/${tenant}/${project}`, query,
      );
      const evidence = data.evidence ?? [];

      if (isJsonMode()) {
        output(evidence);
      } else {
        printTable(
          ["ID", "Type", "Verdict", "Title", "Recorded By"],
          evidence.map(e => [
            e.evidenceId,
            e.type,
            e.verdict,
            truncate(e.title, 40),
            e.recordedBy,
          ]),
        );
      }
    });

  ev
    .command("add")
    .description("Add verification evidence to an activity")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project key")
    .argument("<activity-id>", "Activity ID")
    .requiredOption("--type <t>", `Type: ${EVIDENCE_TYPES.join(", ")}`)
    .requiredOption("--title <t>", "Evidence title")
    .requiredOption("--verdict <v>", `Verdict: ${VERDICTS.join(", ")}`)
    .requiredOption("--recorded-by <name>", "Who recorded this evidence")
    .option("--summary <s>", "Summary text")
    .action(async (tenant: string, project: string, activityId: string, opts: {
      type: string; title: string; verdict: string; recordedBy: string; summary?: string;
    }) => {
      const data = await client.post<{ evidence: Evidence }>("/verification/evidence", {
        tenant,
        projectKey: project,
        activityId,
        type: opts.type,
        title: opts.title,
        verdict: opts.verdict,
        recordedBy: opts.recordedBy,
        summary: opts.summary,
      });

      if (isJsonMode()) {
        output(data.evidence);
      } else {
        console.log(`Evidence added: ${data.evidence.evidenceId} (${data.evidence.verdict})`);
      }
    });

  // ── Verification Documents ─────────────────────────────

  const docs = cmd.command("documents").alias("docs").description("Verification documents");

  docs
    .command("list")
    .description("List verification documents")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get<{ documents: VDoc[] }>(
        `/verification/documents/${tenant}/${project}`,
      );
      const documents = data.documents ?? [];

      if (isJsonMode()) {
        output(documents);
      } else {
        printTable(
          ["ID", "Name", "Kind", "Status", "Rev"],
          documents.map(d => [
            d.vdocId,
            truncate(d.name, 40),
            d.kind,
            d.status,
            d.currentRevision,
          ]),
        );
      }
    });

  docs
    .command("create")
    .description("Create a verification document")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project key")
    .requiredOption("--name <n>", "Document name")
    .requiredOption("--kind <k>", `Kind: ${DOC_KINDS.join(", ")}`)
    .action(async (tenant: string, project: string, opts: { name: string; kind: string }) => {
      if (!DOC_KINDS.includes(opts.kind as typeof DOC_KINDS[number])) {
        console.error(`Invalid kind. Must be one of: ${DOC_KINDS.join(", ")}`);
        process.exit(1);
      }

      const data = await client.post<{ document: VDoc }>("/verification/documents", {
        tenant,
        projectKey: project,
        name: opts.name,
        kind: opts.kind,
      });

      if (isJsonMode()) {
        output(data.document);
      } else {
        console.log(`Document created: ${data.document.vdocId}`);
      }
    });

  docs
    .command("status")
    .description("Update verification document status")
    .argument("<vdoc-id>", "Document ID")
    .requiredOption("--status <s>", `Status: ${DOC_STATUSES.join(", ")}`)
    .action(async (vdocId: string, opts: { status: string }) => {
      if (!DOC_STATUSES.includes(opts.status as typeof DOC_STATUSES[number])) {
        console.error(`Invalid status. Must be one of: ${DOC_STATUSES.join(", ")}`);
        process.exit(1);
      }

      const data = await client.patch<{ document: VDoc }>(
        `/verification/documents/${vdocId}/status`, { status: opts.status },
      );

      if (isJsonMode()) {
        output(data.document);
      } else {
        console.log(`Document status updated to ${data.document.status}.`);
      }
    });

  // ── Revisions ──────────────────────────────────────────

  docs
    .command("revisions")
    .description("List revisions for a verification document")
    .argument("<vdoc-id>", "Document ID")
    .action(async (vdocId: string) => {
      const data = await client.get<{ revisions: Revision[] }>(
        `/verification/documents/${vdocId}/revisions`,
      );
      const revisions = data.revisions ?? [];

      if (isJsonMode()) {
        output(revisions);
      } else {
        printTable(
          ["Rev ID", "Number", "Change", "By", "Date"],
          revisions.map(r => [
            r.revisionId,
            r.revisionNumber,
            truncate(r.changeDescription, 40),
            r.createdBy,
            r.createdAt.split("T")[0],
          ]),
        );
      }
    });

  docs
    .command("revise")
    .description("Create a new revision of a verification document")
    .argument("<vdoc-id>", "Document ID")
    .requiredOption("--rev <n>", "Revision number (e.g. 0.2, 1.0)")
    .requiredOption("--change <desc>", "Change description")
    .requiredOption("--by <name>", "Created by")
    .action(async (vdocId: string, opts: { rev: string; change: string; by: string }) => {
      const data = await client.post<{ revision: Revision }>(
        `/verification/documents/${vdocId}/revisions`, {
          revisionNumber: opts.rev,
          changeDescription: opts.change,
          createdBy: opts.by,
        },
      );

      if (isJsonMode()) {
        output(data.revision);
      } else {
        console.log(`Revision created: ${data.revision.revisionId} (${data.revision.revisionNumber})`);
      }
    });

  // ── Engine ─────────────────────────────────────────────

  cmd
    .command("run")
    .description("Run the verification engine — check for gaps, conflicts, and drift")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get<{ report: Report }>(
        `/verification/engine/${tenant}/${project}`,
      );
      const report = data.report;

      if (isJsonMode()) {
        output(report);
        return;
      }

      const s = report.summary;
      console.log(`Verification Report\n`);
      console.log(`Coverage: ${s.coveragePercent}%  (${s.verified}/${s.totalRequirements} verified)`);
      console.log(`Unverified: ${s.unverified}  |  Incomplete: ${s.incomplete}  |  Drifted: ${s.driftedEvidence}\n`);

      if (report.findings.length === 0) {
        console.log("No findings. All clear.");
      } else {
        printTable(
          ["Severity", "Type", "Req", "Message"],
          report.findings.map(f => [
            severityIcon(f.severity) + " " + f.severity,
            f.type,
            f.requirementRef ?? "",
            truncate(f.message, 60),
          ]),
        );
        console.log(`\n${report.findings.length} finding(s) total.`);
      }
    });

  // ── Matrix ─────────────────────────────────────────────

  cmd
    .command("matrix")
    .description("Show the verification cross-reference matrix")
    .argument("<tenant>", "Tenant slug")
    .argument("<project>", "Project slug")
    .action(async (tenant: string, project: string) => {
      const data = await client.get<{ matrix: MatrixRow[] }>(
        `/verification/matrix/${tenant}/${project}`,
      );
      const matrix = data.matrix ?? [];

      if (isJsonMode()) {
        output(matrix);
        return;
      }

      if (matrix.length === 0) {
        console.log("No requirements found.");
        return;
      }

      console.log("Verification Matrix\n");
      for (const row of matrix) {
        const actSummary = row.activities.length === 0
          ? "  (no activities)"
          : row.activities.map(a =>
              `  ${statusIcon(a.status)} ${a.method}: ${a.title} (${a.evidenceCount} evidence${a.hasPassingEvidence ? ", PASS" : ""})`
            ).join("\n");
        console.log(`${row.requirementRef}  ${truncate(row.requirementText, 60)}`);
        console.log(actSummary);
        console.log();
      }
    });
}
