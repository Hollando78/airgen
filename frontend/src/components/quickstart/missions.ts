import {
  LayoutDashboard,
  ListChecks,
  FileText,
  Box,
  GitBranch,
  Layers,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type MissionId =
  | "select-workspace"
  | "explore-requirements"
  | "manage-document"
  | "create-architecture"
  | "establish-trace-link"
  | "create-baseline"
  | "use-airgen-chat";

export interface MissionDefinition {
  id: MissionId;
  title: string;
  description: string;
  icon: LucideIcon;
  targetRoute: string;
  pageHintText: string;
  autoCompleteOnRoute: boolean;
}

export const MISSIONS: MissionDefinition[] = [
  {
    id: "select-workspace",
    title: "Select Your Workspace",
    description:
      "Choose a tenant and project to unlock all AIRGen features.",
    icon: LayoutDashboard,
    targetRoute: "/dashboard",
    pageHintText:
      "Start here \u2014 select a tenant and project from the workspace selector to access requirements, documents, and architecture.",
    autoCompleteOnRoute: true,
  },
  {
    id: "explore-requirements",
    title: "View or Create a Requirement",
    description:
      "Navigate to Requirements to view, create, or edit engineering requirements.",
    icon: ListChecks,
    targetRoute: "/requirements",
    pageHintText:
      "Create requirements individually or use AIRGen to draft them with AI assistance. Each requirement can be scored for quality.",
    autoCompleteOnRoute: true,
  },
  {
    id: "manage-document",
    title: "Upload or Create a Document",
    description:
      "Manage structured documents, surrogate files, and AI-generated content.",
    icon: FileText,
    targetRoute: "/documents",
    pageHintText:
      "Upload existing documents or create new structured documents. Documents can contain requirements that link to your requirements registry.",
    autoCompleteOnRoute: true,
  },
  {
    id: "create-architecture",
    title: "Create an Architecture Diagram",
    description:
      "Build system architecture diagrams with components, interfaces, and connections.",
    icon: Box,
    targetRoute: "/architecture",
    pageHintText:
      "Design your system architecture visually. Add components, define interfaces, and establish connections between system elements.",
    autoCompleteOnRoute: true,
  },
  {
    id: "establish-trace-link",
    title: "Establish a Trace Link",
    description:
      "Create traceability links between requirements to ensure complete coverage.",
    icon: GitBranch,
    targetRoute: "/links",
    pageHintText:
      "Trace links connect requirements to each other (derives, satisfies, refines, etc.) enabling full traceability across your project.",
    autoCompleteOnRoute: true,
  },
  {
    id: "create-baseline",
    title: "Create a Baseline",
    description:
      "Snapshot your requirements at a point in time for formal reviews and audits.",
    icon: Layers,
    targetRoute: "/baselines",
    pageHintText:
      "Baselines freeze your requirements at a point in time. Use them for reviews, audits, and tracking changes between milestones.",
    autoCompleteOnRoute: true,
  },
  {
    id: "use-airgen-chat",
    title: "Chat with AIRGen",
    description:
      "Use AI-powered chat to ask questions about your requirements and get intelligent answers.",
    icon: Sparkles,
    targetRoute: "/ask-airgen",
    pageHintText:
      "Ask AIRGen anything about your project \u2014 requirements analysis, coverage gaps, impact assessment, or compliance questions.",
    autoCompleteOnRoute: true,
  },
];

export const ROUTE_MISSION_MAP: Record<string, MissionId> =
  Object.fromEntries(
    MISSIONS.filter((m) => m.autoCompleteOnRoute).map((m) => [
      m.targetRoute,
      m.id,
    ])
  );

export const MISSION_BY_ID: Record<MissionId, MissionDefinition> =
  Object.fromEntries(MISSIONS.map((m) => [m.id, m])) as Record<
    MissionId,
    MissionDefinition
  >;
