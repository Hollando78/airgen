/**
 * Graph Viewer Configuration
 *
 * Contains constants and configuration for the graph visualization,
 * including relationship hierarchy classification and layout defaults.
 */

/**
 * Classify relationship types by their hierarchical nature
 *
 * Strong hierarchy = true containment/ownership (parent-child)
 * Medium hierarchy = ownership but not strict containment
 * Weak/No hierarchy = peer relationships and references
 */
export const RELATIONSHIP_HIERARCHY = {
  // Strong hierarchy (weight: 100) - true containment/ownership
  strong: new Set([
    'OWNS',           // Tenant → Project
    'HAS_DOCUMENT',   // Project → Document
    'HAS_SECTION',    // Document → Section
    'CONTAINS',       // Section → Requirement/Info/SurrogateReference
    'HAS_BLOCK',      // Diagram → Block
    'HAS_CONNECTOR',  // Diagram → Connector
    'HAS_PORT',       // Block → PortInstance
    'INSTANTIATED_AS', // PortDefinition → PortInstance
  ]),

  // Medium hierarchy (weight: 50) - ownership but not containment
  medium: new Set([
    'HAS_LINKSET',              // Project → DocumentLinkset
    'HAS_TRACE_LINK',           // Project → TraceLink
    'HAS_CANDIDATE',            // Project → RequirementCandidate
    'HAS_ARCHITECTURE_DIAGRAM', // Project → ArchitectureDiagram
    'HAS_ARCHITECTURE_BLOCK',   // Project → ArchitectureBlock (definition)
    'CONTAINS_LINK',            // Linkset → TraceLink
    'CONTAINS_PORT',            // Diagram → PortInstance
    'BELONGS_TO_BLOCK',         // PortInstance → Block
  ]),

  // Weak/No hierarchy (weight: 1) - peer relationships and references
  weak: new Set([
    'SATISFIES',
    'DERIVES_FROM',
    'RELATED_TO',
    'VERIFIES',
    'DEPENDS_ON',
    'LINKED_TO',
    'FROM_DOCUMENT',
    'TO_DOCUMENT',
    'FROM_REQUIREMENT',
    'TO_REQUIREMENT',
    'FROM_BLOCK',
    'TO_BLOCK',
    'LINKED_DOCUMENT',
    'FROM_PORT',      // Connector → PortInstance
    'TO_PORT',        // Connector → PortInstance
  ]),
};

/**
 * Node type categories for filtering
 */
export const NODE_TYPE_CATEGORIES = {
  'System': ['Tenant', 'Project'],
  'Document Structure': ['Document', 'DocumentSection', 'Info', 'SurrogateReference'],
  'Requirements': ['Requirement', 'RequirementCandidate'],
  'Architecture': ['ArchitectureDiagram', 'ArchitectureBlock', 'ArchitectureConnector', 'PortDefinition', 'PortInstance'],
  'Traceability': ['DocumentLinkset', 'TraceLink']
};

/**
 * Default visible node types
 */
export const DEFAULT_VISIBLE_NODE_TYPES = new Set([
  'Tenant', 'Project', 'Document', 'DocumentSection', 'Requirement', 'Info',
  'SurrogateReference', 'DocumentLinkset', 'TraceLink', 'RequirementCandidate',
  'ArchitectureDiagram', 'ArchitectureBlock', 'ArchitectureConnector',
  'PortDefinition', 'PortInstance'
]);

/**
 * Default layout name
 */
export const DEFAULT_LAYOUT = 'dagre';
