import type { ArchitectureDiagramRecord } from "../types";

const INTERFACE_KEYWORD = "interface";
const REQUIREMENTS_SCHEMA_KEYWORD = "requirements schema";
const ARCHITECTURE_VIEWS = new Set(["block", "internal", "deployment"] as const);

type DiagramKeyword = typeof INTERFACE_KEYWORD | typeof REQUIREMENTS_SCHEMA_KEYWORD;

function includesKeyword(value: string | null | undefined, keyword: DiagramKeyword): boolean {
  if (!value) {return false;}
  return value.toLowerCase().includes(keyword);
}

export function isInterfaceDiagram(diagram: ArchitectureDiagramRecord): boolean {
  return includesKeyword(diagram.name, INTERFACE_KEYWORD)
    || includesKeyword(diagram.description ?? null, INTERFACE_KEYWORD);
}

export function isRequirementsSchemaDiagram(diagram: ArchitectureDiagramRecord): boolean {
  if (diagram.view === "requirements_schema") {
    return true;
  }

  return includesKeyword(diagram.name, REQUIREMENTS_SCHEMA_KEYWORD)
    || includesKeyword(diagram.description ?? null, REQUIREMENTS_SCHEMA_KEYWORD);
}

export function isArchitectureDiagram(diagram: ArchitectureDiagramRecord): boolean {
  if (isInterfaceDiagram(diagram) || isRequirementsSchemaDiagram(diagram)) {
    return false;
  }

  if (!diagram.view) {
    return true;
  }

  return ARCHITECTURE_VIEWS.has(diagram.view);
}
