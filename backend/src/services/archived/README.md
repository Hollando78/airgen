# Archived Services

This directory contains AIRGen services that have been archived for future use.

## SnapDraft (Archived: 2025-10-22)

### Why Archived

SnapDraft was an ambitious attempt to generate manufacturing-ready technical drawings (DXF/SVG) from AIRGen architecture blocks and requirements. After analysis, we discovered a fundamental mismatch:

**The Problem:**
- AIRGen blocks store conceptual/functional data (names, kinds, ports, protocols)
- Technical drawings require physical data (dimensions, materials, tolerances, geometry)
- This 2-3 level abstraction gap meant SnapDraft was generating redundant visualizations that didn't add value beyond existing architecture diagrams

**Research Findings:**
- ISO 128 standards require 5+ dimensions, explicit tolerances, material specs
- AIRGen's data model focuses on system architecture, not component fabrication
- Output was "a worse version of the architecture diagram"

### Future Plans

SnapDraft will be resurrected with a refined purpose:

**Specialized Technical Diagrams** (not manufacturing drawings):
1. Interface Control Diagrams - protocol stacks, signal timing
2. Deployment Diagrams - network topology, physical mounting
3. Sequence Diagrams - interaction flows between blocks
4. State Machine Diagrams - behavioral specifications
5. Connector Pinout Diagrams - port/pin assignments

These diagrams add genuine value beyond architecture diagrams while working with AIRGen's conceptual data model.

### Technical Capabilities Preserved

The archived SnapDraft includes valuable capabilities for future use:

- **Multi-hop context traversal** - Discovers indirect connections up to 3 hops
- **Semantic requirement discovery** - Embedding-based requirement matching
- **Fact extraction** - Structured extraction of technical details from text
- **Hybrid retrieval** - Combines explicit selection with semantic search
- **PostgreSQL fact caching** - Avoids re-extraction
- **Mode analysis** - Intelligent decision between drawing/visualization
- **DXF generation** - ISO 128 compliant layer management
- **SVG generation** - Standards-compliant vector graphics

### Architecture Overview

```
snapdraft/
├── snapdraft-service.ts       # Main orchestrator
├── context-builder.ts          # Multi-hop graph traversal + semantic search
├── fact-extractor.ts           # Extract dimensions/materials/tolerances
├── fact-cache.ts               # PostgreSQL caching
├── mode-analyzer.ts            # Decide: technical_drawing vs visualization
├── llm-generator.ts            # OpenAI GPT-4o for drawing specs
├── dxf-generator.ts            # ISO 128 compliant DXF generation
├── svg-generator.ts            # W3C SVG generation
├── visualization-generator.ts  # DALL-E 3 fallback
└── validation.ts               # JSON schema validation
```

### Database Tables

SnapDraft database tables are preserved for potential future use:
- `snapdraft_drawings`
- `snapdraft_files`
- `snapdraft_history`
- `snapdraft_facts`

### Replacement

SnapDraft has been replaced by **Imagine** - a quick visualization feature that generates concept images using Gemini 2.5 Flash Image.
