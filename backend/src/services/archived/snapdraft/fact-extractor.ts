import crypto from 'crypto';
import type { DocumentInfo, RequirementInfo } from './context-builder.js';

/**
 * Extracted technical fact from documents/requirements
 */
export interface ExtractedFact {
  type: 'dimension' | 'material' | 'tolerance' | 'constraint' | 'ambiguity';
  value: string;
  unit?: string;
  feature?: string;  // What the fact applies to (e.g., "overall width", "hole diameter")
  confidence: number; // 0-1
  sourceId: string;  // Document/requirement ID
  sourceType: 'document' | 'requirement';
}

/**
 * Structured output schema for LLM fact extraction
 */
interface FactExtractionResponse {
  dimensions: Array<{
    value: number;
    unit: string;
    feature: string;
    tolerance?: string;
    confidence: number;
  }>;
  materials: Array<{
    name: string;
    specification?: string;
    finish?: string;
    confidence: number;
  }>;
  tolerances: Array<{
    type: string; // "general", "specific"
    standard?: string; // "ISO 2768", "ASME Y14.5"
    value?: string;
    appliesTo?: string;
    confidence: number;
  }>;
  constraints: Array<{
    type: string; // "manufacturing", "assembly", "environmental"
    description: string;
    confidence: number;
  }>;
  ambiguities: Array<{
    issue: string;
    context: string;
  }>;
}

const FACT_EXTRACTION_SYSTEM_PROMPT = `You are a technical fact extractor for engineering drawings.

TASK: Extract structured technical facts from requirements and documents for CAD/technical drawing generation.

EXTRACT:
1. **Dimensions**: All measurements with units (mm, in, cm, m)
   - Feature name (e.g., "overall length", "hole diameter", "wall thickness")
   - Numeric value
   - Unit
   - Tolerance if specified (e.g., "±0.5mm")
   - Confidence: 1.0 if explicit, 0.7-0.9 if implied

2. **Materials**: Material specifications
   - Name (e.g., "aluminum", "steel", "FR-4")
   - Specification if given (e.g., "6061-T6", "304 stainless")
   - Finish if given (e.g., "anodized", "powder coated")
   - Confidence: 1.0 if explicit, 0.6-0.8 if implied

3. **Tolerances**: Manufacturing tolerances
   - Type: "general" (applies to all) or "specific" (for one feature)
   - Standard reference (e.g., "ISO 2768-m", "ASME Y14.5")
   - Value if explicit (e.g., "±0.1mm", "H7")
   - What it applies to
   - Confidence: 1.0 if standard referenced, 0.5-0.8 otherwise

4. **Constraints**: Manufacturing/assembly constraints
   - Type: manufacturing, assembly, environmental, performance
   - Description (e.g., "must withstand 100°C", "no sharp edges")
   - Confidence: 1.0 if quantitative, 0.6-0.9 if qualitative

5. **Ambiguities**: Missing or unclear information
   - What is missing/unclear
   - Context where it's needed

RULES:
- ONLY extract facts explicitly stated or clearly implied
- DO NOT invent dimensions or materials
- Use confidence < 0.6 for highly uncertain facts
- Convert all dimensions to consistent units (prefer mm)
- Flag contradictions as ambiguities

OUTPUT FORMAT: Return JSON matching FactExtractionResponse schema above.`;

/**
 * Cache entry for extracted facts
 */
interface FactCacheEntry {
  facts: ExtractedFact[];
  extractedAt: Date;
  contentHash: string;
}

export class FactExtractor {
  private memoryCache = new Map<string, FactCacheEntry>();
  private maxCacheSize = 500;

  /**
   * Extract facts from documents and requirements
   * Uses caching to avoid redundant LLM calls
   */
  async extractFacts(
    documents: DocumentInfo[],
    requirements: RequirementInfo[],
    openaiApiKey: string,
    dbCache?: FactCacheInterface
  ): Promise<ExtractedFact[]> {
    const allFacts: ExtractedFact[] = [];

    // Extract from each document
    for (const doc of documents) {
      const facts = await this.extractFromSource(
        doc.title,
        doc.content,
        doc.title, // Use title as ID
        'document',
        openaiApiKey,
        dbCache
      );
      allFacts.push(...facts);
    }

    // Extract from each requirement
    for (const req of requirements) {
      const facts = await this.extractFromSource(
        req.title || req.id,
        req.text,
        req.id,
        'requirement',
        openaiApiKey,
        dbCache
      );
      allFacts.push(...facts);
    }

    console.log(`[FactExtractor] Extracted ${allFacts.length} facts from ${documents.length} docs + ${requirements.length} reqs`);

    return allFacts;
  }

  /**
   * Extract facts from a single source with caching
   */
  private async extractFromSource(
    sourceName: string,
    content: string,
    sourceId: string,
    sourceType: 'document' | 'requirement',
    openaiApiKey: string,
    dbCache?: FactCacheInterface
  ): Promise<ExtractedFact[]> {
    // Generate content hash for caching
    const contentHash = this.hashContent(content);
    const cacheKey = `${sourceId}:${contentHash}`;

    // Check memory cache
    const memoryCached = this.memoryCache.get(cacheKey);
    if (memoryCached) {
      console.log(`[FactExtractor] Memory cache hit: ${sourceName}`);
      return memoryCached.facts;
    }

    // Check database cache
    if (dbCache) {
      const dbCached = await dbCache.get(sourceId, contentHash);
      if (dbCached) {
        console.log(`[FactExtractor] DB cache hit: ${sourceName}`);
        this.cacheInMemory(cacheKey, dbCached, contentHash);
        return dbCached;
      }
    }

    // Extract facts using LLM
    console.log(`[FactExtractor] Extracting facts from ${sourceName} (${content.length} chars)`);

    try {
      const facts = await this.extractWithLLM(content, sourceId, sourceType, openaiApiKey);

      // Cache results
      this.cacheInMemory(cacheKey, facts, contentHash);
      if (dbCache) {
        await dbCache.set(sourceId, contentHash, sourceType, facts);
      }

      return facts;
    } catch (error) {
      console.error(`[FactExtractor] LLM extraction failed for ${sourceName}:`, error);

      // Fallback to heuristic extraction
      console.log(`[FactExtractor] Falling back to heuristic extraction for ${sourceName}`);
      return this.extractWithHeuristics(content, sourceId, sourceType);
    }
  }

  /**
   * Extract facts using GPT-4o-mini with structured output
   */
  private async extractWithLLM(
    content: string,
    sourceId: string,
    sourceType: 'document' | 'requirement',
    openaiApiKey: string
  ): Promise<ExtractedFact[]> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: FACT_EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: `Extract technical facts from:\n\n${content.substring(0, 8000)}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1, // Very low for consistent extraction
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const extracted: FactExtractionResponse = JSON.parse(data.choices[0].message.content);

    // Convert to ExtractedFact format
    const facts: ExtractedFact[] = [];

    // Dimensions
    for (const dim of extracted.dimensions || []) {
      facts.push({
        type: 'dimension',
        value: `${dim.value}`,
        unit: dim.unit,
        feature: dim.feature,
        confidence: dim.confidence,
        sourceId,
        sourceType,
      });

      // Add tolerance as separate fact if present
      if (dim.tolerance) {
        facts.push({
          type: 'tolerance',
          value: dim.tolerance,
          feature: dim.feature,
          confidence: dim.confidence,
          sourceId,
          sourceType,
        });
      }
    }

    // Materials
    for (const mat of extracted.materials || []) {
      const materialValue = mat.specification
        ? `${mat.name} ${mat.specification}`
        : mat.name;
      facts.push({
        type: 'material',
        value: materialValue,
        feature: mat.finish,
        confidence: mat.confidence,
        sourceId,
        sourceType,
      });
    }

    // Tolerances
    for (const tol of extracted.tolerances || []) {
      facts.push({
        type: 'tolerance',
        value: tol.standard || tol.value || tol.type,
        feature: tol.appliesTo,
        confidence: tol.confidence,
        sourceId,
        sourceType,
      });
    }

    // Constraints
    for (const con of extracted.constraints || []) {
      facts.push({
        type: 'constraint',
        value: con.description,
        feature: con.type,
        confidence: con.confidence,
        sourceId,
        sourceType,
      });
    }

    // Ambiguities
    for (const amb of extracted.ambiguities || []) {
      facts.push({
        type: 'ambiguity',
        value: amb.issue,
        feature: amb.context,
        confidence: 0.9,
        sourceId,
        sourceType,
      });
    }

    return facts;
  }

  /**
   * Fallback heuristic extraction using regex patterns
   * Lower quality but works without LLM
   */
  private extractWithHeuristics(
    content: string,
    sourceId: string,
    sourceType: 'document' | 'requirement'
  ): ExtractedFact[]  {
    const facts: ExtractedFact[] = [];

    // Dimension patterns: "120mm", "5.5 inches", "10 cm"
    const dimensionRegex = /(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|ft|feet)/gi;
    const dimensionMatches = content.matchAll(dimensionRegex);
    for (const match of dimensionMatches) {
      facts.push({
        type: 'dimension',
        value: match[1],
        unit: match[2].toLowerCase().replace('inches', 'in').replace('inch', 'in'),
        confidence: 0.6, // Lower confidence for heuristic
        sourceId,
        sourceType,
      });
    }

    // Material patterns: common engineering materials
    const materialKeywords = [
      'aluminum', 'steel', 'stainless steel', 'brass', 'copper', 'titanium',
      'plastic', 'ABS', 'PLA', 'PETG', 'nylon', 'polycarbonate',
      'FR-4', 'PCB', 'wood', 'plywood', 'MDF', 'acrylic'
    ];
    for (const material of materialKeywords) {
      const regex = new RegExp(`\\b${material}\\b`, 'gi');
      if (regex.test(content)) {
        facts.push({
          type: 'material',
          value: material,
          confidence: 0.5, // Low confidence - keyword match only
          sourceId,
          sourceType,
        });
      }
    }

    // Tolerance patterns: "±0.5mm", "± 0.1", "ISO 2768"
    const toleranceRegex = /[±]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in)?|ISO\s*\d+|ASME\s*Y\d+/gi;
    const toleranceMatches = content.matchAll(toleranceRegex);
    for (const match of toleranceMatches) {
      facts.push({
        type: 'tolerance',
        value: match[0],
        unit: match[2],
        confidence: 0.6,
        sourceId,
        sourceType,
      });
    }

    console.log(`[FactExtractor] Heuristic extraction found ${facts.length} facts`);
    return facts;
  }

  /**
   * Generate content hash for caching
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * Cache facts in memory with LRU eviction
   */
  private cacheInMemory(key: string, facts: ExtractedFact[], contentHash: string): void {
    if (this.memoryCache.size >= this.maxCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(key, {
      facts,
      extractedAt: new Date(),
      contentHash,
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      maxCacheSize: this.maxCacheSize,
    };
  }
}

/**
 * Interface for database-level fact caching
 * Implemented separately to avoid circular dependencies
 */
export interface FactCacheInterface {
  get(sourceId: string, contentHash: string): Promise<ExtractedFact[] | null>;
  set(sourceId: string, contentHash: string, sourceType: string, facts: ExtractedFact[]): Promise<void>;
}
