import { z } from "zod";

/**
 * Standard pagination query parameters schema
 * @see {@link PaginationParams} for the TypeScript type
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

/**
 * Pagination parameters extracted from query string
 */
export type PaginationParams = z.infer<typeof paginationSchema>;

/**
 * Pagination metadata included in API responses
 * Provides information about the current page and navigation
 */
export interface PaginationMeta {
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  totalItems: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPrevPage: boolean;
}

/**
 * Standard paginated response format
 * @template T The type of items in the data array
 */
export interface PaginatedResponse<T> {
  /** Array of items for the current page */
  data: T[];
  /** Pagination metadata */
  meta: PaginationMeta;
}

/**
 * Calculates pagination metadata based on total items and pagination params
 *
 * @param totalItems - Total number of items available
 * @param page - Current page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Pagination metadata including page counts and navigation flags
 *
 * @example
 * ```typescript
 * const meta = calculatePagination(100, 2, 20);
 * // Returns: { currentPage: 2, pageSize: 20, totalItems: 100, totalPages: 5, hasNextPage: true, hasPrevPage: true }
 * ```
 */
export function calculatePagination(
  totalItems: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    currentPage: page,
    pageSize: limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
}

/**
 * Calculates skip/offset values for database queries
 *
 * @param page - Current page number (1-indexed)
 * @param limit - Number of items per page
 * @returns Object with skip (offset) and limit values for database queries
 *
 * @example
 * ```typescript
 * const { skip, limit } = getSkipLimit(3, 20);
 * // Returns: { skip: 40, limit: 20 }
 * // Use in Cypher: SKIP $skip LIMIT $limit
 * ```
 */
export function getSkipLimit(page: number, limit: number): { skip: number; limit: number } {
  return {
    skip: (page - 1) * limit,
    limit
  };
}

/**
 * Creates a properly formatted paginated response
 *
 * @template T The type of items in the data array
 * @param data - Array of items for the current page
 * @param totalItems - Total number of items across all pages
 * @param params - Pagination parameters from the request
 * @returns Paginated response with data and metadata
 *
 * @example
 * ```typescript
 * const response = createPaginatedResponse(
 *   requirements.slice(0, 20),
 *   requirements.length,
 *   { page: 1, limit: 20, sortOrder: 'desc' }
 * );
 * ```
 */
export function createPaginatedResponse<T>(
  data: T[],
  totalItems: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    meta: calculatePagination(totalItems, params.page, params.limit)
  };
}

/**
 * Parses and validates pagination parameters from query string
 *
 * @param query - Raw query parameters object
 * @returns Validated pagination parameters with defaults applied
 * @throws {ZodError} If query parameters are invalid
 *
 * @example
 * ```typescript
 * const params = parsePaginationParams(req.query);
 * // Safely use params.page, params.limit, etc.
 * ```
 */
export function parsePaginationParams(query: unknown): PaginationParams {
  return paginationSchema.parse(query || {});
}
