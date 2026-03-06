# airgen-cli

Requirements engineering from the command line. Manage requirements, architecture diagrams, traceability, baselines, and more — all from your terminal.

Pairs with [AIRGen Studio](https://airgen.studio) and the AIRGen MCP server.

## Install

```bash
npm install -g airgen-cli
```

## Configuration

Set credentials via environment variables or `~/.airgenrc`:

```bash
# Environment variables
export AIRGEN_API_URL=https://api.airgen.studio/api
export AIRGEN_EMAIL=you@example.com
export AIRGEN_PASSWORD=your-password
```

Or create `~/.airgenrc`:

```json
{
  "apiUrl": "https://api.airgen.studio/api",
  "email": "you@example.com",
  "password": "your-password"
}
```

For semantic linting, also set a UHT token:

```bash
export UHT_API_KEY=your-token    # or UHT_TOKEN
```

## Quick start

```bash
# List your tenants and projects
airgen tenants list
airgen projects list my-tenant

# List requirements
airgen reqs list my-tenant my-project

# Render a diagram in the terminal
airgen diag list my-tenant my-project
airgen diag render my-tenant my-project diagram-123

# Run semantic lint
airgen lint my-tenant my-project

# Get a compliance report
airgen report compliance my-tenant my-project
```

## Global options

| Flag | Description |
|---|---|
| `--json` | Output as JSON (works with any command) |
| `-V, --version` | Print version |
| `-h, --help` | Show help |

## Commands

### Tenants & Projects

```bash
airgen tenants list                          # List all tenants
airgen projects list <tenant>                # List projects in a tenant
airgen projects create <tenant> --name "X"   # Create a project
airgen projects delete <tenant> <project>    # Delete a project
```

### Requirements

```bash
airgen reqs list <tenant> <project>                    # List (paginated)
airgen reqs list <tenant> <project> --page 2 --limit 50
airgen reqs get <tenant> <project> <ref>               # Full detail
airgen reqs create <tenant> <project> --text "The system shall..."
airgen reqs update <tenant> <project> <id> --text "..." --tags safety,critical
airgen reqs delete <tenant> <project> <id>             # Soft-delete
airgen reqs history <tenant> <project> <id>            # Version history
airgen reqs search <tenant> <project> --query "thermal" --mode semantic
airgen reqs filter <tenant> <project> --pattern functional --tag safety
```

### Architecture Diagrams

```bash
airgen diag list <tenant> <project>                    # List diagrams
airgen diag get <tenant> <project> <id>                # Blocks + connectors JSON
airgen diag render <tenant> <project> <id>             # Terminal display (default)
airgen diag render <tenant> <project> <id> --format mermaid  # Mermaid syntax
airgen diag render <tenant> <project> <id> --format mermaid --wrap -o diagram.md
airgen diag create <tenant> <project> --name "X" --view block
airgen diag update <tenant> <project> <id> --name "Y"
airgen diag delete <tenant> <project> <id>
```

**Blocks:**

```bash
airgen diag blocks library <tenant> <project>
airgen diag blocks create <tenant> <project> --diagram <id> --name "X" --kind subsystem
airgen diag blocks delete <tenant> <project> <block-id>
```

**Connectors:**

```bash
airgen diag conn create <tenant> <project> --diagram <id> --source <id> --target <id> --kind flow --label "data"
airgen diag conn delete <tenant> <project> <conn-id> --diagram <id>
```

### Traceability

```bash
airgen trace list <tenant> <project>                   # List trace links
airgen trace create <tenant> <project> --source <id> --target <id> --type derives
airgen trace delete <tenant> <project> <link-id>
airgen trace linksets list <tenant> <project>          # Document linksets
```

### Baselines & Diff

```bash
airgen bl list <tenant> <project>
airgen bl create <tenant> <project> --name "v1.0"
airgen bl compare <tenant> <project> --from <id1> --to <id2>

# Rich diff between baselines
airgen diff <tenant> <project> --from <bl1> --to <bl2>           # Pretty terminal output
airgen diff <tenant> <project> --from <bl1> --to <bl2> --json    # Structured JSON
airgen diff <tenant> <project> --from <bl1> --to <bl2> --format markdown -o diff.md
```

`diff` shows added, modified, and removed requirements with full text, plus a summary of changes to documents, trace links, diagrams, blocks, and connectors.

### Quality & AI

```bash
airgen qa analyze "The system shall..."               # Analyze single requirement
airgen qa score start <tenant> <project>               # Background QA scoring
airgen qa draft "user needs thermal imaging"           # Draft requirements from NL

airgen ai generate <tenant> <project> --prompt "..."   # Generate candidates
airgen ai candidates <tenant> <project>                # List pending candidates
airgen ai accept <candidate-id>                        # Promote to requirement
airgen ai reject <candidate-id>                        # Reject candidate
```

### Reports

```bash
airgen report stats <tenant> <project>                 # Overview statistics
airgen report quality <tenant> <project>               # QA score summary
airgen report compliance <tenant> <project>            # Compliance + impl status
airgen report orphans <tenant> <project>               # Untraced requirements
```

All report commands auto-paginate through the full requirement set (up to 5000).

### Implementation Tracking

```bash
airgen impl status <tenant> <project> <req> --status implemented --notes "done in v2"
airgen impl summary <tenant> <project>                 # Coverage breakdown
airgen impl list <tenant> <project> --status blocked   # Filter by status
airgen impl bulk-update <tenant> <project> --file updates.json

# Artifact linking
airgen impl link <tenant> <project> <req> --type file --path src/engine.ts
airgen impl unlink <tenant> <project> <req> --artifact <id>
```

**Statuses:** `not_started`, `in_progress`, `implemented`, `verified`, `blocked`

**Bulk update file format:**

```json
[
  { "ref": "REQ-001", "status": "implemented", "notes": "shipped" },
  { "ref": "REQ-002", "status": "in_progress" }
]
```

### Verification

Manage verification activities, evidence, documents, and run the verification engine to detect gaps.

```bash
# Run the verification engine
airgen verify run <tenant> <project>                  # Coverage report + findings
airgen verify matrix <tenant> <project>               # Cross-reference matrix

# Activities (TADI: Test, Analysis, Demonstration, Inspection)
airgen verify act list <tenant> <project>
airgen verify act create <tenant> <project> <req-id> --method Test --title "..."
airgen verify act update <activity-id> --status passed

# Evidence
airgen verify ev list <tenant> <project>
airgen verify ev add <tenant> <project> <activity-id> --type test_result --title "..." --verdict pass --recorded-by "name"

# Verification documents
airgen verify docs list <tenant> <project>
airgen verify docs create <tenant> <project> --name "Test Plan" --kind test_plan
airgen verify docs status <vdoc-id> --status approved
airgen verify docs revisions <vdoc-id>
airgen verify docs revise <vdoc-id> --rev 1.0 --change "Final review" --by "name"
```

**Activity statuses:** `planned`, `in_progress`, `executed`, `passed`, `failed`, `blocked`

**Evidence verdicts:** `pass`, `fail`, `inconclusive`, `not_applicable`

**Document kinds:** `test_plan`, `test_procedure`, `test_report`, `analysis_report`, `inspection_checklist`, `demonstration_protocol`

**Document statuses:** `draft`, `review`, `approved`, `superseded`

### Import / Export

```bash
airgen import requirements <tenant> <project> --file reqs.csv
airgen export requirements <tenant> <project>          # Markdown
airgen export requirements <tenant> <project> --json   # JSON
```

### Activity

```bash
airgen activity list <tenant> <project>                # Recent activity
airgen activity list <tenant> <project> --limit 50
```

### Documents

```bash
airgen docs list <tenant> <project>
airgen docs get <tenant> <project> <slug>
airgen docs create <tenant> <project> --title "X" --kind structured
airgen docs delete <tenant> <project> <slug>
airgen docs export <tenant> <project> <slug>           # Markdown export
airgen docs sec list <tenant> <project> <slug>         # List sections
```

### Semantic Lint

Classifies domain concepts from your requirements using the [Universal Hex Taxonomy](https://universalhex.org) and flags ontological issues, structural problems, and coverage gaps.

```bash
airgen lint <tenant> <project>                         # Full lint (top 15 concepts)
airgen lint <tenant> <project> --concepts 20           # Classify more concepts
airgen lint <tenant> <project> --format markdown -o lint-report.md
airgen lint <tenant> <project> --format json           # Machine-readable
```

**What it detects:**

- Ontological mismatches (e.g., non-physical entity with physical constraints)
- Abstract metrics missing statistical parameters
- Verification requirements mixed with functional requirements
- Degraded modes without performance criteria
- Ontological ambiguity between similar concepts
- Requirements lacking "shall" keyword

**Requires:** `UHT_TOKEN` or `UHT_API_KEY` environment variable. Get a token at [universalhex.org](https://universalhex.org).

## JSON mode

Append `--json` to any command for machine-readable output:

```bash
airgen reqs list my-tenant my-project --json | jq '.[].ref'
airgen report compliance my-tenant my-project --json | jq '.summary'
```

## Aliases

| Full command | Alias |
|---|---|
| `requirements` | `reqs` |
| `diagrams` | `diag` |
| `documents` | `docs` |
| `connectors` | `conn` |
| `baselines` | `bl` |
| `traces` | `trace` |
| `quality` | `qa` |
| `reports` | `report` |
| `projects` | `proj` |
| `sections` | `sec` |
| `verify activities` | `verify act` |
| `verify evidence` | `verify ev` |
| `verify documents` | `verify docs` |

## License

MIT
