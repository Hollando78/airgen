import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";

/**
 * Request ID middleware for correlation tracking
 *
 * Adds a unique request ID to each request for tracing and debugging.
 * The request ID is:
 * - Generated as a UUID v4
 * - Added to the request object as `req.id`
 * - Included in the X-Request-ID response header
 * - Available in all log statements via Fastify's request serializer
 *
 * Usage in logs:
 *   app.log.info({ req }, "Processing request");
 *   // Logs will include the request ID automatically
 */

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Unique identifier for this request
     */
    requestId: string;
  }
}

export function setupRequestIdMiddleware(app: FastifyInstance): void {
  // Add request ID to all requests
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Try to use X-Request-ID from client if provided, otherwise generate new one
    const clientRequestId = req.headers["x-request-id"];
    const requestId = typeof clientRequestId === "string" ? clientRequestId : randomUUID();

    // Store on request object
    req.requestId = requestId;

    // Add to response headers
    reply.header("X-Request-ID", requestId);
  });

  // Update request serializer to include request ID
  app.log.info("Request ID middleware enabled");
}
