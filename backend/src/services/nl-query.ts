import OpenAI from "openai";
import { getSession } from "./graph/driver.js";
import { config } from "../config.js";
import {
  sanitizePromptInput,
  INPUT_LIMITS,
  detectSuspiciousOutput,
  buildSecureSystemPrompt
} from "../lib/prompt-security.js";
import { convertNeo4jTypes } from "../lib/neo4j-utils.js";

export interface NLQueryRequest {
  tenant: string;
  projectKey: string;
  query: string;
  includeExplanation?: boolean;
}

export interface NLQueryResult {
  cypherQuery: string;
  results: unknown[];
  resultCount: number;
  executionTime: number;
  explanation?: string;
}

// Few-shot examples for the LLM
const FEW_SHOT_EXAMPLES = [
  {
    natural: "Show me all requirements in this project",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey}) RETURN r LIMIT 100"
  },
  {
    natural: "Find requirements with high QA scores",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey}) WHERE r.qaScore >= 80 RETURN r ORDER BY r.qaScore DESC LIMIT 50"
  },
  {
    natural: "List all documents",
    cypher: "MATCH (d:Document {tenant: $tenant, projectKey: $projectKey}) RETURN d LIMIT 100"
  },
  {
    natural: "Find trace links between requirements",
    cypher: "MATCH (r1:Requirement {tenant: $tenant, projectKey: $projectKey})-[t:SATISFIES|DERIVES|VERIFIES]->(r2:Requirement) RETURN r1, t, r2 LIMIT 100"
  },
  {
    natural: "Show archived requirements",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey, archived: true}) RETURN r LIMIT 100"
  },
  {
    natural: "Find requirements by pattern",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey, pattern: $pattern}) RETURN r LIMIT 100"
  },
  {
    natural: "List all architecture diagrams",
    cypher: "MATCH (d:ArchitectureDiagram {tenant: $tenant, projectKey: $projectKey}) RETURN d LIMIT 100"
  },
  {
    natural: "Find requirements created in the last 7 days",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey}) WHERE r.createdAt >= datetime() - duration({days: 7}) RETURN r ORDER BY r.createdAt DESC LIMIT 100"
  },
  {
    natural: "Show requirements with low QA scores",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey}) WHERE r.qaScore < 60 RETURN r ORDER BY r.qaScore ASC LIMIT 100"
  },
  {
    natural: "List sections in a document",
    cypher: "MATCH (d:Document {tenant: $tenant, projectKey: $projectKey, slug: $documentSlug})-[:CONTAINS]->(s:DocumentSection) RETURN s LIMIT 100"
  },
  {
    natural: "Find requirements verified by inspection",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey, verification: 'Inspection'}) RETURN r LIMIT 100"
  },
  {
    natural: "Show all EARS patterns used",
    cypher: "MATCH (r:Requirement {tenant: $tenant, projectKey: $projectKey}) RETURN DISTINCT r.pattern LIMIT 20"
  }
];

/**
 * Introspects Neo4j schema to understand available nodes and relationships
 */
async function getSchemaInfo(): Promise<string> {
  const session = getSession();
  try {
    // Get node labels and their properties
    const nodeResult = await session.run(`
      CALL db.schema.nodeTypeProperties()
      YIELD nodeType, propertyName, propertyTypes
      RETURN nodeType, collect({name: propertyName, types: propertyTypes}) as properties
      LIMIT 20
    `);

    // Get relationship types
    const relResult = await session.run(`
      CALL db.schema.relTypeProperties()
      YIELD relType, propertyName, propertyTypes
      RETURN relType, collect({name: propertyName, types: propertyTypes}) as properties
      LIMIT 20
    `);

    let schema = "## Available Node Types and Properties\n\n";

    for (const record of nodeResult.records) {
      const nodeType = record.get("nodeType");
      const properties = record.get("properties");
      schema += `### ${nodeType}\n`;
      schema += properties.map((p: any) => `- ${p.name}: ${p.types.join(" | ")}`).join("\n");
      schema += "\n\n";
    }

    schema += "\n## Available Relationship Types\n\n";
    for (const record of relResult.records) {
      const relType = record.get("relType");
      schema += `- ${relType}\n`;
    }

    return schema;
  } finally {
    await session.close();
  }
}

/**
 * Validates that a Cypher query is safe to execute (read-only, properly scoped)
 */
function validateCypherQuery(query: string): { valid: boolean; error?: string } {
  // Check for dangerous operations
  const dangerousKeywords = [
    /\bCREATE\b/i,
    /\bDELETE\b/i,
    /\bMERGE\b/i,
    /\bSET\b/i,
    /\bREMOVE\b/i,
    /\bDROP\b/i,
    /\bALTER\b/i,
    /\bDETACH\b/i,
    /ADMIN/i
  ];

  for (const keyword of dangerousKeywords) {
    if (keyword.test(query)) {
      return { valid: false, error: `Query contains forbidden operation: ${keyword.source}` };
    }
  }

  // Ensure query uses LIMIT to prevent massive results
  if (!/LIMIT\s+\d+/i.test(query)) {
    return { valid: false, error: "Query must include a LIMIT clause" };
  }

  // Check LIMIT is reasonable
  const limitMatch = query.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    const limit = parseInt(limitMatch[1]);
    if (limit > 10000) {
      return { valid: false, error: `LIMIT too high: ${limit} (max 10000)` };
    }
  }

  // Ensure parameters use tenant and projectKey for isolation
  if (!query.includes("$tenant") && !query.includes("$projectKey")) {
    return { valid: false, error: "Query must filter by tenant and projectKey for security" };
  }

  return { valid: true };
}

/**
 * Generates a natural language explanation of a Cypher query
 */
async function generateExplanation(
  naturalQuery: string,
  cypherQuery: string,
  resultCount: number,
  client: OpenAI
): Promise<string> {
  try {
    const prompt = buildSecureSystemPrompt("data analyst", [
      "Explain what a Cypher database query does in simple terms.",
      "Focus on what data it retrieves and why it matches the user's request.",
      "Keep explanations concise (1-2 sentences)."
    ]);

    const completion = await client.chat.completions.create({
      model: config.llm.model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: prompt
        },
        {
          role: "user",
          content: `User asked: "${naturalQuery}"\n\nGenerated query:\n${cypherQuery}\n\nThis query returned ${resultCount} results. Explain what this query does.`
        }
      ],
      max_tokens: 150
    });

    return completion.choices[0]?.message?.content || "Query explanation unavailable";
  } catch (error) {
    return "Query explanation unavailable";
  }
}

/**
 * Translates natural language query to Cypher using LLM
 */
async function translateToCypher(
  naturalQuery: string,
  schemaInfo: string,
  client: OpenAI
): Promise<string> {
  const sanitizedQuery = sanitizePromptInput(naturalQuery, "query", INPUT_LIMITS.USER_INPUT);

  const examplesText = FEW_SHOT_EXAMPLES
    .map(ex => `- Natural: "${ex.natural}"\n  Cypher: ${ex.cypher}`)
    .join("\n");

  const systemPrompt = buildSecureSystemPrompt("Neo4j Cypher query expert", [
    "You are an expert in Cypher queries for Neo4j graph database.",
    "Generate ONLY a valid Cypher query - no explanation, no markdown, just the raw query.",
    "IMPORTANT RULES:",
    "1. ALL queries MUST filter by $tenant and $projectKey for security",
    "2. ALL queries MUST include a LIMIT clause (max 1000)",
    "3. Queries MUST be read-only (no CREATE, DELETE, SET, MERGE, REMOVE)",
    "4. Use appropriate relationship types: CONTAINS, OWNS, SATISFIES, DERIVES, VERIFIES",
    "5. Return only necessary properties to keep results manageable",
    "6. Use ORDER BY with LIMIT for consistent pagination"
  ]);

  const userPrompt = `${schemaInfo}

## Example Queries
${examplesText}

## User Request
Translate this request to Cypher: "${sanitizedQuery}"

Remember:
- Filter by $tenant and $projectKey always
- Include LIMIT in the query
- Return only raw Cypher, no explanation`;

  const completion = await client.chat.completions.create({
    model: config.llm.model,
    temperature: 0.2,
    response_format: undefined, // Don't use JSON format for this
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 500
  });

  const rawQuery = completion.choices[0]?.message?.content?.trim() || "";

  // Detect suspicious output
  if (detectSuspiciousOutput(rawQuery)) {
    throw new Error("Query generation validation failed. Please rephrase your request.");
  }

  // Extract Cypher from markdown code blocks if present
  const codeBlockMatch = rawQuery.match(/```(?:cypher)?\s*\n?([\s\S]*?)\n?```/);
  const cypherQuery = codeBlockMatch ? codeBlockMatch[1].trim() : rawQuery;

  return cypherQuery;
}

/**
 * Executes a Cypher query with proper parameter binding and error handling
 */
async function executeCypherQuery(
  cypher: string,
  params: Record<string, unknown>
): Promise<{ results: unknown[]; executionTime: number }> {
  const session = getSession();
  const startTime = Date.now();

  try {
    const result = await session.run(cypher, params);
    const executionTime = Date.now() - startTime;

    // Convert Neo4j types to JavaScript for JSON serialization
    const results = result.records.map(record => {
      const obj: Record<string, unknown> = {};
      record.keys.forEach((key) => {
        const keyStr = String(key);
        obj[keyStr] = convertNeo4jTypes(record.get(keyStr));
      });
      return obj;
    });

    return { results, executionTime };
  } catch (error) {
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await session.close();
  }
}

/**
 * Main function to process natural language queries
 */
export async function processNaturalLanguageQuery(
  request: NLQueryRequest
): Promise<NLQueryResult> {
  if (!config.llm.provider || !config.llm.apiKey) {
    throw new Error("LLM not configured. Set LLM_API_KEY and LLM_PROVIDER environment variables.");
  }

  const client = new OpenAI({
    apiKey: config.llm.apiKey,
    baseURL: config.llm.baseUrl || undefined
  });

  try {
    // Step 1: Get schema information
    const schemaInfo = await getSchemaInfo();

    // Step 2: Translate natural language to Cypher
    const cypherQuery = await translateToCypher(request.query, schemaInfo, client);

    // Step 3: Validate the query
    const validation = validateCypherQuery(cypherQuery);
    if (!validation.valid) {
      throw new Error(`Query validation failed: ${validation.error}`);
    }

    // Step 4: Execute query with proper tenant/project isolation
    const { results, executionTime } = await executeCypherQuery(cypherQuery, {
      tenant: request.tenant,
      projectKey: request.projectKey
    });

    // Step 5: Generate explanation if requested
    let explanation: string | undefined;
    if (request.includeExplanation) {
      explanation = await generateExplanation(
        request.query,
        cypherQuery,
        results.length,
        client
      );
    }

    return {
      cypherQuery,
      results,
      resultCount: results.length,
      executionTime,
      explanation
    };
  } catch (error) {
    throw new Error(
      `Natural language query processing failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get example queries for UI
 */
export function getExampleQueries(): Array<{ natural: string; category: string }> {
  return [
    { natural: "Show me all requirements in this project", category: "Requirements" },
    { natural: "Find requirements with high QA scores", category: "Requirements" },
    { natural: "Show archived requirements", category: "Requirements" },
    { natural: "Find requirements created in the last 7 days", category: "Requirements" },
    { natural: "Show requirements with low QA scores", category: "Requirements" },
    { natural: "Find requirements verified by inspection", category: "Requirements" },
    { natural: "List all documents", category: "Documents" },
    { natural: "List sections in a document", category: "Documents" },
    { natural: "Find trace links between requirements", category: "Traceability" },
    { natural: "List all architecture diagrams", category: "Architecture" },
    { natural: "Show all EARS patterns used", category: "Analysis" }
  ];
}
