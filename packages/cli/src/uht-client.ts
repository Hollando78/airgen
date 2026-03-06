/**
 * Minimal UHT (Universal Hex Taxonomy) API client.
 *
 * Talks to the UHT Substrate factory API for entity classification and comparison.
 * Token resolution: UHT_TOKEN env → UHT_API_KEY env → ~/.config/uht-substrate/config.json
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_UHT_URL = "https://substrate.universalhex.org/api";

export interface UhtClassification {
  entity: string;
  hex_code: string;
  traits: Array<{ name: string; justification: string }>;
}

export interface UhtComparison {
  candidate: string;
  hex_code: string;
  jaccard_similarity: number;
  hamming_distance: number;
  shared_traits: Array<{ name: string }>;
  traits_entity_only: Array<{ name: string }>;
  traits_candidate_only: Array<{ name: string }>;
}

export interface UhtBatchResult {
  entity: string;
  hex_code: string;
  comparisons: UhtComparison[];
  best_match: string;
  best_jaccard: number;
}

function loadUhtConfigToken(): string {
  try {
    const configPath = join(
      process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
      "uht-substrate",
      "config.json",
    );
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return config.token ?? "";
  } catch {
    return "";
  }
}

export class UhtClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = (process.env.UHT_API_URL ?? DEFAULT_UHT_URL).replace(/\/+$/, "");
    this.token = process.env.UHT_TOKEN || process.env.UHT_API_KEY || loadUhtConfigToken();
  }

  get isConfigured(): boolean {
    return this.token.length > 0;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await globalThis.fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`UHT API error (${res.status}): ${text}`);
    }

    return (await res.json()) as T;
  }

  async classify(entity: string): Promise<UhtClassification> {
    return this.request("POST", "/classify", { entity, context: "", use_semantic_priors: false });
  }

  async batchCompare(entity: string, candidates: string[]): Promise<UhtBatchResult> {
    return this.request("POST", "/batch-compare", { entity, candidates });
  }
}
