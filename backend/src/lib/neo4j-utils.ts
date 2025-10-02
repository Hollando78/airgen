import { isInt, isDate, isDateTime, isLocalDateTime, isTime, isLocalTime, isDuration, Integer } from "neo4j-driver";

/**
 * Converts a Neo4j Integer to a JavaScript number.
 * Returns the fallback value if conversion fails or value is null/undefined.
 */
export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (isInt(value)) {
    try {
      return (value as Integer).toNumber();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Converts a Neo4j temporal type to an ISO string.
 * Handles Date, DateTime, LocalDateTime, Time, LocalTime.
 */
export function toISOString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (isDate(value) || isDateTime(value) || isLocalDateTime(value)) {
    return value.toString();
  }
  if (isTime(value) || isLocalTime(value)) {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

/**
 * Recursively converts Neo4j types in an object to native JavaScript types.
 * This ensures proper JSON serialization.
 */
export function convertNeo4jTypes(value: unknown): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Neo4j Integer
  if (isInt(value)) {
    return toNumber(value);
  }

  // Handle Neo4j temporal types
  if (isDate(value) || isDateTime(value) || isLocalDateTime(value) || isTime(value) || isLocalTime(value)) {
    return toISOString(value);
  }

  // Handle Neo4j Duration
  if (isDuration(value)) {
    return value.toString();
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    return value.map(item => convertNeo4jTypes(item));
  }

  // Handle plain objects
  if (typeof value === "object" && value.constructor === Object) {
    const converted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      converted[key] = convertNeo4jTypes(val);
    }
    return converted;
  }

  // Handle Date objects
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Return primitives as-is
  return value;
}

/**
 * Deep converts all Neo4j types in a response object to ensure JSON serializability.
 * Use this before sending responses to the frontend.
 */
export function sanitizeNeo4jResponse<T>(data: T): T {
  return convertNeo4jTypes(data) as T;
}
