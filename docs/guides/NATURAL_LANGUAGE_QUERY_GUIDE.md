# Natural Language Query Interface Guide

## Overview

The Natural Language Query Interface allows users to ask questions about their requirements, documents, and system architecture in plain English. The system automatically translates these queries to Cypher (Neo4j's query language) and executes them against the graph database.

## Features

- **Natural Language Input**: Ask questions in plain English without needing to know Cypher
- **Schema Introspection**: The system automatically understands your database structure
- **Few-Shot Learning**: Uses example queries to guide LLM translation
- **Query Validation**: Ensures all generated queries are safe (read-only, properly scoped)
- **Result Export**: Download results as CSV for further analysis
- **Query Explanation**: Optional AI-generated explanations of what queries do
- **Example Suggestions**: Quick access to pre-built example queries by category

## How It Works

### Architecture

```
User Input (Natural Language)
    ↓
Schema Introspection (Neo4j)
    ↓
Text2Cypher Translation (OpenAI LLM)
    ↓
Query Validation (Regex + AST)
    ↓
Cypher Execution (Neo4j)
    ↓
Result Formatting & Display
```

### Security Features

1. **Read-Only Enforcement**: All queries are validated to exclude write operations (CREATE, DELETE, SET, MERGE, REMOVE)
2. **Tenant Isolation**: Queries are automatically filtered to the current tenant/project context
3. **Complexity Limits**:
   - Maximum 1000 results per query
   - Maximum 5 relationship hops
   - 10-second query timeout
4. **Rate Limiting**: 30 queries per hour per user
5. **Input Validation**: User queries are sanitized before LLM processing

## Usage

### Accessing the Query Interface

1. Navigate to the **Query** page from the main navigation menu
2. Enter your question in the text area

### Example Queries

The system provides categorized example queries accessible via the "Example queries:" dropdown:

#### Requirements
- "Show me all requirements in this project"
- "Find requirements with high QA scores"
- "Show archived requirements"
- "Find requirements created in the last 7 days"
- "Show requirements with low QA scores"
- "Find requirements verified by inspection"

#### Documents
- "List all documents"
- "List sections in a document"

#### Traceability
- "Find trace links between requirements"

#### Architecture
- "List all architecture diagrams"

#### Analysis
- "Show all EARS patterns used"

### Tips for Better Queries

1. **Be Specific**: Instead of "Show requirements", try "Show all requirements with QA score above 80"
2. **Use Date References**: The system understands temporal queries like "last 7 days", "this month"
3. **Ask About Relationships**: Questions about links and traces work well: "Find all requirements that satisfy this requirement"
4. **Filter by Attributes**: Include criteria like verification methods, patterns, or tags

### Interpreting Results

1. **Cypher Query Display**: Shows the exact query that was executed - useful for learning Cypher
2. **Explanation**: If enabled, provides a plain-English explanation of what the query does
3. **Results Table**:
   - Expandable rows show all properties
   - Hover over rows for full details
   - Export to CSV for spreadsheet analysis
4. **Execution Time**: Shows how quickly the database executed your query

## API Reference

### Endpoint: POST `/api/query/natural-language`

Translate natural language to Cypher and execute the query.

**Request:**
```json
{
  "tenant": "my-company",
  "projectKey": "my-project",
  "query": "Show me all high-scoring requirements",
  "includeExplanation": true
}
```

**Response:**
```json
{
  "cypherQuery": "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey}) WHERE r.qaScore >= 80 RETURN r ORDER BY r.qaScore DESC LIMIT 100",
  "results": [
    {
      "id": "req-123",
      "ref": "REQ-001",
      "text": "The system shall...",
      "qaScore": 95,
      "pattern": "ubiquitous",
      "verification": "Test"
    }
  ],
  "resultCount": 5,
  "executionTime": 47,
  "explanation": "This query finds all requirements with a QA score of 80 or higher, sorted by score in descending order, limited to the top 100 results."
}
```

### Endpoint: GET `/api/query/examples`

Get available example queries grouped by category.

**Response:**
```json
{
  "examples": [
    {
      "natural": "Show me all requirements in this project",
      "category": "Requirements"
    },
    {
      "natural": "Find requirements with high QA scores",
      "category": "Requirements"
    },
    ...
  ]
}
```

## Database Schema

The Natural Language Query Interface works with the following node types and relationships:

### Node Types
- **Requirement**: System requirements with QA scores, patterns, verification methods
- **Document**: Structured or surrogate documents
- **DocumentSection**: Hierarchical document sections
- **ArchitectureDiagram**: Visual system architecture models
- **ArchitectureBlock**: Components in architecture diagrams
- **ArchitectureConnector**: Relationships between blocks
- **TraceLink**: Typed traceability relationships
- **Project**: Project containers
- **Tenant**: Multi-tenant organization

### Relationships
- `CONTAINS`: Requirements/sections contained within documents
- `OWNS`: Projects owned by tenants
- `SATISFIES`: Traceability - requirement satisfies another
- `DERIVES`: Traceability - requirement derives from another
- `VERIFIES`: Traceability - requirement verifies another
- `PLACES`: Architecture blocks placed in diagrams
- `CONNECTS`: Architecture blocks connected via connectors

### Common Properties
- **Requirements**: `ref`, `text`, `qaScore`, `pattern`, `verification`, `createdAt`, `archived`
- **Documents**: `slug`, `name`, `description`, `createdAt`
- **Architecture**: `id`, `name`, `kind`, `stereotype`, `description`

## Configuration

### Environment Variables

The Natural Language Query feature uses the existing LLM configuration:

```bash
LLM_PROVIDER=openai          # Currently only openai is supported
LLM_API_KEY=sk-...           # Your OpenAI API key
LLM_MODEL=gpt-4o-mini        # Model to use (gpt-4o-mini recommended for cost)
LLM_TEMPERATURE=0.2          # Lower temperature for more deterministic queries
LLM_BASE_URL=                # Optional: Custom endpoint (e.g., Azure OpenAI)
```

### Rate Limiting

- **Per User**: 30 queries per hour
- **Controlled by**: User authentication token
- **Fallback**: IP address if user is not authenticated

## Troubleshooting

### "Query contains forbidden operation"
The generated query tried to perform a write operation. Natural Language Query only supports read operations.

### "Query must include a LIMIT clause"
All queries must have a LIMIT to prevent returning massive result sets. Try rephrasing your question to be more specific.

### "Query must filter by tenant and projectKey"
The system couldn't generate a properly scoped query. Try specifying which project or document you're interested in.

### "LLM response validation failed"
The LLM output couldn't be parsed or contained suspicious content. Try rephrasing your question more clearly.

### "Query execution timeout"
Your query is taking too long to execute. Try making it more specific or limiting the scope (fewer results, fewer relationships).

## Performance Considerations

1. **First Query**: Takes slightly longer as schema is introspected
2. **Complex Queries**: Queries with many relationships may take 1-5 seconds
3. **Result Size**: Queries returning 1000+ results are capped at 1000 for performance
4. **Caching**: Query results are not cached; each query is executed fresh

## Best Practices

1. ✅ **Do**: Use specific criteria (scores, dates, verification methods)
2. ✅ **Do**: Start with example queries and modify them
3. ✅ **Do**: Export results to CSV for reporting
4. ✅ **Do**: Use the Cypher query display to learn Neo4j
5. ❌ **Don't**: Ask for all data without filtering
6. ❌ **Don't**: Try to use write operations (create, delete, update)
7. ❌ **Don't**: Ask for multi-hop relationships that are too deep

## Known Limitations

1. **No Multi-Query Analysis**: One query at a time (no compound queries)
2. **Limited Aggregation**: Complex aggregations may not translate well
3. **Graph Algorithms**: Specialized algorithms (shortest path, PageRank) not yet supported
4. **Write Operations**: Read-only interface, cannot modify data
5. **Exact Date Matching**: Date queries work with relative terms (last 7 days) but not specific ISO dates

## Future Enhancements

- [ ] Multi-query support (execute multiple queries with one request)
- [ ] Vector search integration for semantic similarity
- [ ] Graph algorithm support (shortest path, centrality)
- [ ] Query result caching
- [ ] Query history and saved queries
- [ ] Advanced aggregation support
- [ ] Query cost estimation before execution
- [ ] Batch query export for reporting

## Support

For issues or questions about Natural Language Query:
1. Check this guide and troubleshooting section
2. Review example queries for similar use cases
3. Check generated Cypher query for hints about what's happening
4. Verify your LLM configuration is correct
5. Contact the development team with specific query and error details

## Implementation Details

### Files Created
- Backend: `backend/src/services/nl-query.ts` - Core NL query processing
- Backend: `backend/src/routes/nl-query.ts` - API endpoints
- Frontend: `frontend/src/pages/NaturalLanguageQuery.tsx` - Main UI page
- Frontend: `frontend/src/components/QueryResultsTable.tsx` - Results display
- Frontend: `frontend/src/components/QueryExamplesDropdown.tsx` - Example selector

### Key Technologies
- **Backend**: Fastify, Neo4j Driver, OpenAI SDK, TypeScript
- **Frontend**: React, React Query, Tailwind CSS, TypeScript
- **Database**: Neo4j 5.x
- **LLM**: OpenAI GPT-4o-mini (or compatible)

### Testing Recommendations

1. **Unit Tests**: Test schema introspection and query validation
2. **Integration Tests**: Test end-to-end flows with sample database
3. **Security Tests**: Verify read-only enforcement and tenant isolation
4. **Performance Tests**: Measure query translation and execution time
5. **LLM Tests**: Test prompt effectiveness with various query types

## Version History

- **v1.0.0** (Initial Release)
  - Natural language to Cypher translation
  - Schema introspection
  - Query validation and security
  - Result export to CSV
  - Example query suggestions
  - Query explanation
